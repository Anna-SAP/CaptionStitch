/** Colour maths for the picker. Hue is 0..360, saturation and value are 0..1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const hex2 = (n: number) => Math.round(clamp01(n) * 255).toString(16).padStart(2, '0');

/** Accepts #rgb or #rrggbb, with or without the hash. Returns lower-case #rrggbb or null. */
export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return '#' + (h.length === 3 ? [...h].map((c) => c + c).join('') : h);
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt((normalizeHex(hex) ?? '#000000').slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + hex2(r / 255) + hex2(g / 255) + hex2(b / 255);
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: h * 60, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return '#' + hex2(f(5)) + hex2(f(3)) + hex2(f(1));
}

/**
 * A handful of distinct colours that dominate a picture, most common first.
 * `data` is RGBA. Used to offer backgrounds that match the screenshots.
 */
export function dominantColors(data: Uint8ClampedArray | Uint8Array, count = 6): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += data[i];
    b.g += data[i + 1];
    b.b += data[i + 2];
    buckets.set(key, b);
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  const picked: [number, number, number][] = [];
  for (const b of sorted) {
    const c: [number, number, number] = [b.r / b.n, b.g / b.n, b.b / b.n];
    // Skip near-duplicates so the suggestions are actually different from each other.
    if (picked.some((p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) < 72)) continue;
    picked.push(c);
    if (picked.length === count) break;
  }
  return picked.map((c) => rgbToHex(c[0], c[1], c[2]));
}
