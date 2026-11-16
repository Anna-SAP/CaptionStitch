import { describe, expect, it } from 'vitest';
import { computeLayout, fitWidth, MAX_CANVAS_SIDE, normalizeBand, outputWidth, type LayoutFrame } from '../src/core/layout';
import { DEFAULT_SETTINGS, FULL_RECT, type Settings } from '../src/types';

const frame = (id: string, patch: Partial<LayoutFrame> = {}): LayoutFrame => ({
  id,
  w: 1920,
  h: 1080,
  crop: FULL_RECT,
  full: null,
  band: null,
  ...patch,
});
const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, band: { top: 0.8, bottom: 1 }, ...patch });

describe('captions layout', () => {
  it('keeps the first frame whole and cuts the rest to the subtitle band', () => {
    const l = computeLayout([frame('a'), frame('b'), frame('c')], settings(), 960);
    expect(l.items.map((i) => i.full)).toEqual([true, false, false]);
    expect(l.items.map((i) => i.dh)).toEqual([540, 108, 108]);
    expect(l.items.map((i) => i.dy)).toEqual([0, 540, 648]);
    expect(l.height).toBe(756);
    expect(l.items[1].sy).toBeCloseTo(864);
    expect(l.items[1].sh).toBeCloseTo(216);
  });

  it('measures the band inside the cropped content, not the raw screenshot', () => {
    const crop = { x: 0, y: 0.1, w: 1, h: 0.8 };
    const l = computeLayout([frame('a', { crop }), frame('b', { crop })], settings(), 1920);
    expect(l.items[0].sy).toBeCloseTo(108);
    expect(l.items[0].dh).toBe(864);
    expect(l.items[1].sy).toBeCloseTo(108 + 0.8 * 864);
    expect(l.items[1].dh).toBe(Math.round(864 * 0.2));
  });

  it('honours per-frame choices', () => {
    const l = computeLayout(
      [frame('a', { full: false }), frame('b', { full: true }), frame('c', { band: { top: 0.5, bottom: 0.75 } })],
      settings(),
      1920,
    );
    expect(l.items.map((i) => i.full)).toEqual([false, true, false]);
    expect(l.items[2].dh).toBe(270);
    expect(l.items[2].sy).toBeCloseTo(540);
  });

  it('scales gap and padding with the output width', () => {
    const s = settings({ gap: 10, padding: 20 });
    const small = computeLayout([frame('a'), frame('b')], s, 1080);
    const big = computeLayout([frame('a'), frame('b')], s, 2160);
    expect(small.pad).toBe(20);
    expect(big.pad).toBe(40);
    expect(small.items[0].dx).toBe(20);
    expect(small.items[0].dw).toBe(1040);
    expect(small.items[1].dy - (small.items[0].dy + small.items[0].dh)).toBe(10);
    expect(big.items[1].dy - (big.items[0].dy + big.items[0].dh)).toBe(20);
  });

  it('leaves room for text above and below', () => {
    const l = computeLayout([frame('a')], settings(), 1920, { header: 100, footer: 60 });
    expect(l.items[0].dy).toBe(100);
    expect(l.height).toBe(100 + 1080 + 60);
  });
});

describe('other layouts', () => {
  it('stacks whole frames', () => {
    const l = computeLayout([frame('a'), frame('b', { full: false })], settings({ layout: 'stack' }), 1920);
    expect(l.items.map((i) => i.dh)).toEqual([1080, 1080]);
  });

  it('lays out an even grid and centre-crops odd shapes', () => {
    const l = computeLayout([frame('a'), frame('b'), frame('c', { w: 1000, h: 1000 })], settings({ layout: 'grid', columns: 2 }), 1000);
    expect(l.items.map((i) => [i.dx, i.dy])).toEqual([
      [0, 0],
      [500, 0],
      [0, 281],
    ]);
    expect(l.items[2].sw / l.items[2].sh).toBeCloseTo(500 / 281, 2);
    expect(l.height).toBe(562);
  });
});

describe('helpers', () => {
  it('uses the widest content for "source" width', () => {
    const frames = [frame('a', { crop: { x: 0.1, y: 0, w: 0.8, h: 1 } }), frame('b', { w: 1280, h: 720 })];
    expect(outputWidth(frames, settings({ width: 0 }))).toBe(1536);
    expect(outputWidth(frames, settings({ width: 1080 }))).toBe(1080);
  });

  it('keeps bands valid', () => {
    expect(normalizeBand({ top: 0.9, bottom: 0.2 }).bottom).toBeGreaterThan(normalizeBand({ top: 0.9, bottom: 0.2 }).top);
    expect(normalizeBand({ top: -1, bottom: 2 })).toEqual({ top: 0, bottom: 1 });
  });

  it('shrinks layouts that exceed canvas limits', () => {
    expect(fitWidth(1080, 4000)).toBe(1080);
    const w = fitWidth(1080, 40000);
    expect(w).toBeLessThan(1080);
    expect((40000 * w) / 1080).toBeLessThanOrEqual(MAX_CANVAS_SIDE + 1);
  });
});
