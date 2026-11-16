import type { Incoming } from '../state';
import { toBlob } from './export';

const LINES: [string, string][] = [
  ['你为什么总在截图？', 'Why are you always taking screenshots?'],
  ['因为好台词值得被记住', 'Because a good line deserves to be remembered.'],
  ['那就把它们拼在一起吧', "Then let's stitch them together."],
];

/**
 * Draw a few stand-in "video screenshots": a letterboxed scene with bilingual subtitles.
 * They let people try the tool without having screenshots at hand.
 */
export async function makeDemoFrames(): Promise<Incoming[]> {
  const W = 1920;
  const H = 1200;
  const BAR = 138;
  const out: Incoming[] = [];
  for (let i = 0; i < LINES.length; i++) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const top = BAR;
    const ph = H - BAR * 2;

    // Dusk sky, sun, hills and a foreground figure that shifts from shot to shot.
    const sky = ctx.createLinearGradient(0, top, 0, top + ph);
    sky.addColorStop(0, '#1d2b4f');
    sky.addColorStop(0.55, '#b5566b');
    sky.addColorStop(1, '#f2a65a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, top, W, ph);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, W, ph);
    ctx.clip();
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath();
    ctx.arc(1380 - i * 60, top + ph * 0.52, 120, 0, Math.PI * 2);
    ctx.fill();
    const hill = (color: string, base: number, amp: number, phase: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, top + ph);
      for (let x = 0; x <= W; x += 16) {
        ctx.lineTo(x, top + base + Math.sin(x / 260 + phase) * amp + Math.sin(x / 90 + phase * 2) * amp * 0.25);
      }
      ctx.lineTo(W, top + ph);
      ctx.closePath();
      ctx.fill();
    };
    hill('#5b3558', ph * 0.62, 60, 0.4 + i * 0.3);
    hill('#2e2140', ph * 0.74, 44, 2.1 + i * 0.2);
    hill('#16121f', ph * 0.88, 26, 4.2);
    const px = 520 + i * 170;
    ctx.fillStyle = '#0c0a12';
    ctx.beginPath();
    ctx.arc(px, top + ph * 0.6, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(px - 62, top + ph * 0.65, 124, ph * 0.4);
    ctx.restore();

    // Subtitles: white with a dark outline, like most players draw them.
    const [zh, en] = LINES[i];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const draw = (text: string, size: number, y: number) => {
      ctx.font = `500 ${size}px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC","WenQuanYi Zen Hei",sans-serif`;
      ctx.lineWidth = size * 0.14;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(text, W / 2, y);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, W / 2, y);
    };
    draw(zh, 58, top + ph - 128);
    draw(en, 36, top + ph - 66);

    out.push({ blob: await toBlob(c, 'image/png'), name: `demo-${i + 1}.png`, time: i });
  }
  return out;
}
