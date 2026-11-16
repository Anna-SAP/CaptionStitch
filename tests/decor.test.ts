import { describe, expect, it } from 'vitest';
import { dominantColors, hexToHsv, hsvToHex, normalizeHex } from '../src/core/color';
import { computeLayout, type LayoutFrame } from '../src/core/layout';
import { anchorAt, stickerBox } from '../src/core/stickers';
import { graphemes, textColors, wrapText, type Measure } from '../src/core/text';
import { DEFAULT_SETTINGS, FULL_RECT, type Sticker } from '../src/types';

describe('colour', () => {
  it('normalizes hex codes', () => {
    expect(normalizeHex('FFE3EC')).toBe('#ffe3ec');
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('pink')).toBeNull();
  });

  it('round-trips through HSV', () => {
    for (const hex of ['#000000', '#ffffff', '#ff6b81', '#4ea8de', '#123456', '#f2c14e', '#808080']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(Math.round(hexToHsv('#00ff00').h)).toBe(120);
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe('#0000ff');
  });

  it('finds the distinct colours that dominate a picture', () => {
    const px = new Uint8ClampedArray(100 * 4);
    for (let i = 0; i < 100; i++) {
      const c = i < 60 ? [200, 30, 30] : i < 90 ? [20, 40, 200] : [205, 32, 28];
      px.set([...c, 255], i * 4);
    }
    const colors = dominantColors(px, 4);
    expect(colors).toHaveLength(2);
    expect(hexToHsv(colors[0]).h).toBeLessThan(10);
    expect(Math.round(hexToHsv(colors[1]).h / 10)).toBe(23);
  });

  it('uses a chosen text colour, or contrast when none is chosen', () => {
    expect(textColors('#111111', '#ff6b81').fg).toBe('#ff6b81');
    expect(textColors('#111111', '#ff6b81').muted).toBe('rgba(255,107,129,0.62)');
    expect(textColors('#ffe3ec').fg).toBe('#191919');
    expect(textColors('#111111', 'nonsense').fg).toBe('#f5f3ee');
  });
});

describe('emoji in text', () => {
  const measure: Measure = (text) => graphemes(text).length * 10;

  it('keeps multi-part emoji whole', () => {
    expect(graphemes('a👨‍👩‍👧b❤️‍🔥')).toEqual(['a', '👨‍👩‍👧', 'b', '❤️‍🔥']);
  });

  it('may break a line before or after an emoji but never inside one', () => {
    const lines = wrapText('因果❤️‍🔥🦧因果', 30, 'f', measure);
    expect(lines.join('')).toBe('因果❤️‍🔥🦧因果');
    for (const line of lines) expect(graphemes(line).length).toBeLessThanOrEqual(3);
    expect(lines.some((l) => l.includes('❤️‍🔥'))).toBe(true);
  });
});

describe('stickers', () => {
  const frame = (id: string): LayoutFrame => ({ id, w: 1000, h: 500, crop: FULL_RECT, full: null, band: null });
  const settings = { ...DEFAULT_SETTINGS, band: { top: 0.8, bottom: 1 } };
  const text = { header: 100, footer: 200 };
  const base: Sticker = { id: 's', kind: 'emoji', emoji: '😀', aspect: 2, anchor: 'body', x: 0.5, y: 0.5, size: 0.1, rot: 0 };

  it('converts between image points and anchored positions', () => {
    const l = computeLayout([frame('a'), frame('b')], settings, 1000, text);
    for (const [cx, cy, anchor] of [
      [300, 40, 'header'],
      [500, 400, 'body'],
      [900, l.height - 20, 'footer'],
    ] as const) {
      const pos = anchorAt(cx, cy, l);
      expect(pos.anchor).toBe(anchor);
      const box = stickerBox({ ...base, ...pos }, l);
      expect(box.cx).toBeCloseTo(cx);
      expect(box.cy).toBeCloseTo(cy);
    }
  });

  it('sizes by image width and keeps the aspect ratio', () => {
    const l = computeLayout([frame('a')], settings, 2000, text);
    const box = stickerBox(base, l);
    expect(box.w).toBe(200);
    expect(box.h).toBe(100);
  });

  it('keeps a footer sticker in the footer when more frames are added', () => {
    const one = computeLayout([frame('a')], settings, 1000, text);
    const pos = anchorAt(800, one.height - 100, one);
    const more = computeLayout([frame('a'), frame('b'), frame('c')], settings, 1000, text);
    const box = stickerBox({ ...base, ...pos }, more);
    expect(box.cy).toBeCloseTo(more.height - 100);
  });

  it('falls back to the frames when there is no text area', () => {
    const l = computeLayout([frame('a')], settings, 1000);
    expect(anchorAt(500, 0, l).anchor).toBe('body');
    expect(anchorAt(500, l.height, l).anchor).toBe('body');
    expect(anchorAt(5000, -50, l)).toMatchObject({ x: 1, y: 0 });
  });
});
