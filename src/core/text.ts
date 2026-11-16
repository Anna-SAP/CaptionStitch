import type { Settings } from '../types';

export type Measure = (text: string, font: string) => number;

export interface TextLine {
  text: string;
  x: number;
  /** Top of the line box, relative to the block. */
  y: number;
  font: string;
  size: number;
  lineHeight: number;
  muted: boolean;
  align: 'left' | 'right';
}

export interface TextBlock {
  height: number;
  lines: TextLine[];
}

export const EMPTY_BLOCK: TextBlock = { height: 0, lines: [] };

const FONTS = {
  sans: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","WenQuanYi Zen Hei",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
  serif:
    '"Songti SC","Noto Serif CJK SC","Source Han Serif SC",SimSun,"Iowan Old Style","Palatino Linotype",Georgia,serif',
};

const isCjk = (ch: string) => /[⺀-鿿豈-﫿＀-￯　-〿]/.test(ch);
/** Punctuation that must not start a line. */
const NO_LINE_START = /^[，。！？、；：）》」』”’…—,.!?;:)\]}%]/;

/** Split text into units a line may break between: CJK characters and Latin words. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  let word = '';
  const flush = () => {
    if (word) out.push(word);
    word = '';
  };
  for (const ch of text) {
    if (isCjk(ch)) {
      flush();
      out.push(ch);
    } else if (ch === ' ') {
      word += ch;
      flush();
    } else {
      word += ch;
    }
  }
  flush();
  return out;
}

/** Greedy line wrapping that understands CJK text and explicit newlines. */
export function wrapText(text: string, maxWidth: number, font: string, measure: Measure): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (para.trim() === '') {
      lines.push('');
      continue;
    }
    let line = '';
    for (const tok of tokenize(para)) {
      const next = line + tok;
      if (line === '' || measure(next.trimEnd(), font) <= maxWidth || NO_LINE_START.test(tok)) {
        line = next;
        // A single token wider than the line is split by character.
        while (measure(line.trimEnd(), font) > maxWidth && [...line].length > 1 && !NO_LINE_START.test(tok)) {
          const chars = [...line];
          let cut = chars.length - 1;
          while (cut > 1 && measure(chars.slice(0, cut).join(''), font) > maxWidth) cut--;
          lines.push(chars.slice(0, cut).join(''));
          line = chars.slice(cut).join('');
        }
      } else {
        lines.push(line.trimEnd());
        line = tok.trimStart();
      }
    }
    lines.push(line.trimEnd());
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

interface Part {
  text: string;
  size: number;
  weight: number;
  lineHeight: number;
  muted: boolean;
  align: 'left' | 'right';
  gapBefore: number;
}

function buildBlock(parts: Part[], width: number, unit: number, sidePad: number, s: Settings, measure: Measure): TextBlock {
  const active = parts.filter((p) => p.text.trim() !== '');
  if (active.length === 0) return EMPTY_BLOCK;
  const family = FONTS[s.font];
  const vPad = Math.round(30 * unit);
  const maxWidth = width - sidePad * 2;
  const lines: TextLine[] = [];
  let y = vPad;
  active.forEach((p, i) => {
    const size = Math.max(8, Math.round(p.size * unit));
    const lineHeight = Math.round(size * p.lineHeight);
    const font = `${p.weight} ${size}px ${family}`;
    if (i > 0) y += Math.round(p.gapBefore * unit);
    for (const text of wrapText(p.text.trim(), maxWidth, font, measure)) {
      lines.push({
        text,
        x: p.align === 'left' ? sidePad : width - sidePad,
        y,
        font,
        size,
        lineHeight,
        muted: p.muted,
        align: p.align,
      });
      y += lineHeight;
    }
  });
  return { height: y + vPad, lines };
}

/** Text placed above the frames: the title, and the note when it is set to sit on top. */
export function headerBlock(s: Settings, width: number, unit: number, pad: number, measure: Measure): TextBlock {
  const sidePad = Math.max(pad, Math.round(40 * unit));
  const parts: Part[] = [
    { text: s.title, size: 42, weight: 700, lineHeight: 1.35, muted: false, align: 'left', gapBefore: 0 },
  ];
  if (s.notePos === 'top') {
    parts.push({ text: s.note, size: 32, weight: 400, lineHeight: 1.6, muted: false, align: 'left', gapBefore: 14 });
  }
  return buildBlock(parts, width, unit, sidePad, s, measure);
}

/** Text placed below the frames: the note (by default) and the credit line. */
export function footerBlock(s: Settings, width: number, unit: number, pad: number, measure: Measure): TextBlock {
  const sidePad = Math.max(pad, Math.round(40 * unit));
  const parts: Part[] = [];
  if (s.notePos === 'bottom') {
    parts.push({ text: s.note, size: 32, weight: 400, lineHeight: 1.6, muted: false, align: 'left', gapBefore: 0 });
  }
  parts.push({ text: s.credit, size: 24, weight: 400, lineHeight: 1.4, muted: true, align: 'right', gapBefore: 18 });
  return buildBlock(parts, width, unit, sidePad, s, measure);
}

/** Readable text colour for a given background. */
export function textColors(bg: string): { fg: string; muted: string } {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  let lum = 0;
  if (m) {
    const n = parseInt(m[1], 16);
    const lin = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  }
  return lum > 0.4
    ? { fg: '#191919', muted: 'rgba(25,25,25,0.6)' }
    : { fg: '#f5f3ee', muted: 'rgba(245,243,238,0.62)' };
}
