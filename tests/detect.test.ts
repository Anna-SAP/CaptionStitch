import { describe, expect, it } from 'vitest';
import {
  combineBands,
  consensusBars,
  darkCols,
  darkRows,
  detectBandInFrame,
  detectCrop,
  signatureDistance,
  subtitleSignature,
  type Pixels,
} from '../src/core/detect';

/** A tiny software canvas for building test pictures. */
class Pic implements Pixels {
  data: Uint8ClampedArray;
  constructor(
    public width: number,
    public height: number,
    fill = 0,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4).fill(255);
    this.rect(0, 0, width, height, fill);
  }
  rect(x: number, y: number, w: number, h: number, v: number) {
    for (let yy = Math.max(0, y); yy < Math.min(this.height, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.width, x + w); xx++) {
        const i = (yy * this.width + xx) * 4;
        this.data[i] = this.data[i + 1] = this.data[i + 2] = v;
      }
    }
    return this;
  }
  /** A textured "scene": never flat, never as dark as a bar. */
  scene(y0: number, y1: number, base = 90) {
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < this.width; x++) this.rect(x, y, 1, 1, base + ((x * 7 + y * 13) % 40));
    }
    return this;
  }
  /** Fake subtitle: evenly spaced white strokes with a dark outline, centred at cx. */
  subtitle(cx: number, y: number, h: number, strokes: number, pitch = 6) {
    const x0 = Math.round(cx - (strokes * pitch) / 2);
    this.rect(x0 - 2, y - 2, strokes * pitch + 2, h + 4, 10);
    for (let k = 0; k < strokes; k++) this.rect(x0 + k * pitch, y, 2, h, 250);
    return this;
  }
}

const stats = (p: Pic) => ({ rowDark: darkRows(p), colDark: darkCols(p) });

describe('black bars', () => {
  it('finds letterbox bars', () => {
    const p = new Pic(200, 120).scene(12, 108);
    const crop = detectCrop([stats(p)], 200, 120);
    expect(Math.round(crop.y * 120)).toBe(13);
    expect(Math.round(crop.h * 120)).toBe(120 - 26);
    expect(crop.x).toBe(0);
    expect(crop.w).toBe(1);
  });

  it('finds pillarbox bars', () => {
    const p = new Pic(200, 120).scene(0, 120);
    p.rect(0, 0, 20, 120, 0).rect(180, 0, 20, 120, 0);
    const crop = detectCrop([stats(p)], 200, 120);
    expect(Math.round(crop.x * 200)).toBe(21);
    expect(Math.round(crop.w * 200)).toBe(200 - 42);
  });

  it('does not eat a dark scene that touches the bar', () => {
    const p = new Pic(200, 120).scene(12, 108);
    p.rect(0, 90, 200, 18, 19); // dark, flat ground right above the bottom bar
    const crop = detectCrop([stats(p)], 200, 120);
    expect(Math.round((crop.y + crop.h) * 120)).toBe(120 - 13);
  });

  it('leaves pictures without bars alone', () => {
    const p = new Pic(200, 120).scene(0, 120);
    expect(detectCrop([stats(p)], 200, 120)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('outvotes a player overlay drawn inside the bar', () => {
    const clean = () => new Pic(200, 120).scene(12, 108);
    const overlay = clean().rect(20, 3, 60, 5, 230).rect(10, 111, 30, 5, 230);
    const alone = detectCrop([stats(overlay)], 200, 120);
    expect(alone.h).toBeGreaterThan((120 - 26) / 120);
    const voted = detectCrop([stats(overlay), stats(clean()), stats(clean())], 200, 120);
    expect(Math.round(voted.y * 120)).toBe(13);
    expect(Math.round(voted.h * 120)).toBe(120 - 26);
  });

  it('ignores implausibly thick bars', () => {
    const rows = new Uint8Array(100).fill(0);
    rows.fill(1, 0, 50);
    expect(consensusBars([rows]).start).toBe(0);
  });
});

describe('subtitle band', () => {
  const W = 400;
  const H = 240;
  const base = () => new Pic(W, H).scene(0, H);

  it('locates centred subtitle text', () => {
    const hit = detectBandInFrame(base().subtitle(W / 2, 190, 16, 30))!;
    expect(hit).not.toBeNull();
    expect(Math.round(hit.top * H)).toBe(190);
    expect(Math.round(hit.bottom * H)).toBe(206);
  });

  it('joins two close lines (bilingual subtitles)', () => {
    const hit = detectBandInFrame(base().subtitle(W / 2, 180, 16, 28).subtitle(W / 2, 201, 10, 44, 4))!;
    expect(Math.round(hit.top * H)).toBe(180);
    expect(Math.round(hit.bottom * H)).toBe(211);
  });

  it('ignores off-centre clutter and large bright areas', () => {
    const p = base().subtitle(W / 2, 190, 16, 30);
    p.subtitle(60, 150, 16, 8); // a logo-like cluster near the left edge
    p.rect(300, 120, 90, 60, 240); // a lamp
    const hit = detectBandInFrame(p)!;
    expect(Math.round(hit.top * H)).toBe(190);
    expect(Math.round(hit.bottom * H)).toBe(206);
  });

  it('reports nothing when there is no subtitle', () => {
    expect(detectBandInFrame(base())).toBeNull();
    expect(detectBandInFrame(base().rect(100, 150, 200, 40, 245))).toBeNull();
  });

  it('combines frames into one padded band and drops outliers', () => {
    const a = { top: 0.8, bottom: 0.86, lineH: 0.06, score: 100 };
    const b = { top: 0.79, bottom: 0.9, lineH: 0.05, score: 100 };
    const stray = { top: 0.5, bottom: 0.55, lineH: 0.05, score: 500 };
    const band = combineBands([a, null, b, stray])!;
    expect(band.top).toBeLessThan(0.79);
    expect(band.top).toBeGreaterThan(0.74);
    expect(band.bottom).toBeGreaterThan(0.9);
    expect(band.bottom).toBeLessThan(0.95);
    expect(combineBands([null, null])).toBeNull();
  });
});

describe('subtitle fingerprint', () => {
  const W = 400;
  const H = 240;
  const base = (shade: number) => new Pic(W, H).scene(0, H, shade);

  it('matches the same line on a different background and separates different lines', () => {
    const a = subtitleSignature(base(90).subtitle(W / 2, 190, 16, 30))!;
    const sameLine = subtitleSignature(base(60).subtitle(W / 2, 190, 16, 30))!;
    const otherLine = subtitleSignature(base(90).subtitle(W / 2, 190, 16, 14))!;
    expect(signatureDistance(a, sameLine)).toBeLessThan(0.1);
    expect(signatureDistance(a, otherLine)).toBeGreaterThan(0.4);
    expect(subtitleSignature(base(90))).toBeNull();
  });
});
