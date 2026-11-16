import type { Band, FrameStats, Rect } from '../types';

/** RGBA pixels, row-major, as returned by CanvasRenderingContext2D.getImageData. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

const luma = (d: Pixels['data'], i: number) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;

/* ------------------------------------------------------------------ */
/* Black bars (letterbox / pillarbox)                                  */
/* ------------------------------------------------------------------ */

/** Bars are black or close to it; anything brighter at the edge is picture. */
const MAX_BAR_LUMA = 40;
/** How far a bar pixel may stray from the bar's own level (compression noise). */
const BAR_TOLERANCE = 10;
const OUTLIERS = 0.01;

/**
 * Luma of the bar that starts at an edge line, or -1 when that line is not a flat dark line.
 * Measuring the level (instead of assuming black) tells a real bar from a merely dark scene:
 * the scene is rarely exactly as dark, and as flat, as the bar next to it.
 */
function edgeLevel(values: number[]): number {
  const v = values.slice().sort((p, q) => p - q);
  const lo = v[Math.floor(v.length * 0.05)];
  const hi = v[Math.min(v.length - 1, Math.floor(v.length * 0.95))];
  const mid = v[Math.floor(v.length / 2)];
  return hi - lo <= 6 && mid <= MAX_BAR_LUMA ? mid : -1;
}

function barLevel(first: number[], last: number[]): number {
  const a = edgeLevel(first);
  const b = edgeLevel(last);
  if (a < 0) return b;
  if (b < 0) return a;
  return Math.min(a, b);
}

/** For each row: 1 when (nearly) every pixel sits at the level of the bar found at the top or bottom edge. */
export function darkRows(px: Pixels): Uint8Array {
  const { width, height, data } = px;
  const out = new Uint8Array(height);
  const line = (y: number) => {
    const v: number[] = [];
    for (let x = 0; x < width; x++) v.push(luma(data, (y * width + x) * 4));
    return v;
  };
  const level = barLevel(line(0), line(height - 1));
  if (level < 0) return out;
  const limit = level + BAR_TOLERANCE;
  const allowed = Math.floor(width * OUTLIERS);
  for (let y = 0; y < height; y++) {
    let bright = 0;
    let i = y * width * 4;
    for (let x = 0; x < width; x++, i += 4) {
      if (luma(data, i) > limit && ++bright > allowed) break;
    }
    out[y] = bright <= allowed ? 1 : 0;
  }
  return out;
}

/** For each column: 1 when (nearly) every pixel sits at the level of the bar found at the left or right edge. */
export function darkCols(px: Pixels): Uint8Array {
  const { width, height, data } = px;
  const out = new Uint8Array(width);
  const line = (x: number) => {
    const v: number[] = [];
    for (let y = 0; y < height; y++) v.push(luma(data, (y * width + x) * 4));
    return v;
  };
  const level = barLevel(line(0), line(width - 1));
  if (level < 0) return out;
  const limit = level + BAR_TOLERANCE;
  const allowed = Math.floor(height * OUTLIERS);
  for (let x = 0; x < width; x++) {
    let bright = 0;
    for (let y = 0; y < height; y++) {
      if (luma(data, (y * width + x) * 4) > limit && ++bright > allowed) break;
    }
    out[x] = bright <= allowed ? 1 : 0;
  }
  return out;
}

/** Bars thicker than this share of a side are treated as picture, not as bars. */
const MAX_BAR = 0.35;

/**
 * How many leading and trailing lines are dark in at least half of the frames.
 * Voting across frames keeps a player overlay or one dark scene from skewing the result.
 */
export function consensusBars(lists: Uint8Array[]): { start: number; end: number } {
  if (lists.length === 0) return { start: 0, end: 0 };
  const len = lists[0].length;
  const need = Math.ceil(lists.length / 2);
  const dark = (i: number) => {
    let votes = 0;
    for (const l of lists) votes += l[i];
    return votes >= need;
  };
  let start = 0;
  while (start < len && dark(start)) start++;
  let end = 0;
  while (end < len - start && dark(len - 1 - end)) end++;
  if (start > len * MAX_BAR) start = 0;
  if (end > len * MAX_BAR) end = 0;
  // Scaled video usually has one blended line at each edge; take it too.
  if (start > 0) start++;
  if (end > 0) end++;
  return { start, end };
}

/** Content rectangle for a group of same-sized frames. */
export function detectCrop(stats: FrameStats[], w: number, h: number): Rect {
  const rows = consensusBars(stats.map((s) => s.rowDark));
  const cols = consensusBars(stats.map((s) => s.colDark));
  const x = cols.start / w;
  const y = rows.start / h;
  const cw = (w - cols.start - cols.end) / w;
  const ch = (h - rows.start - rows.end) / h;
  if (cw < 0.3 || ch < 0.3) return { x: 0, y: 0, w: 1, h: 1 };
  return { x, y, w: cw, h: ch };
}

/* ------------------------------------------------------------------ */
/* Subtitle band                                                       */
/* ------------------------------------------------------------------ */

export interface BandHit {
  /** Extent of the subtitle text, as fractions of the analysed image height. */
  top: number;
  bottom: number;
  /** Height of one text line, as a fraction of the image height. */
  lineH: number;
  score: number;
}

const BRIGHT = 170;
const CONTRAST = 60;
/** Subtitles are looked for in this lower share of the picture. */
const SEARCH_FROM = 0.45;

interface RowInfo {
  count: number;
  l: number;
  r: number;
  /** Accepted strokes as [start, end, start, end, …]. */
  strokes: number[];
}

const EMPTY_ROW: RowInfo = { count: 0, l: 0, r: 0, strokes: [] };

/**
 * Find subtitle text in one frame.
 *
 * Subtitles are bright, thin strokes with a dark edge, laid out symmetrically
 * around the horizontal centre. Each row is scanned for short bright runs that
 * drop to dark on both sides; runs are then grown outward from the centre so
 * off-centre clutter (lamps, paper, logos) is left out.
 */
export function detectBandInFrame(px: Pixels): BandHit | null {
  return findSubtitle(px)?.hit ?? null;
}

interface Found {
  hit: BandHit;
  /** Bounding box of the subtitle text in pixels of the analysed image. */
  box: { x0: number; x1: number; y0: number; y1: number };
  rows: RowInfo[];
}

function findSubtitle(px: Pixels): Found | null {
  const { width: W, height: H, data } = px;
  if (W < 40 || H < 40) return null;
  const y0 = Math.floor(H * SEARCH_FROM);
  const cx = W / 2;
  const maxRun = Math.max(4, Math.round(W * 0.06));
  const gapMax = W * 0.045;
  const nearCentre = W * 0.08;
  const rows: RowInfo[] = new Array(H);
  const row = new Float32Array(W);
  const starts: number[] = [];
  const ends: number[] = [];

  for (let y = y0; y < H; y++) {
    let i = y * W * 4;
    for (let x = 0; x < W; x++, i += 4) row[x] = luma(data, i);
    starts.length = 0;
    ends.length = 0;
    let x = 0;
    while (x < W) {
      if (row[x] < BRIGHT) {
        x++;
        continue;
      }
      const a = x;
      let peak = row[x];
      while (x < W && row[x] >= BRIGHT) {
        if (row[x] > peak) peak = row[x];
        x++;
      }
      const b = x;
      if (b - a > maxRun) continue;
      // Require a clear drop within 3px on each side: the stroke outline or a dark scene.
      let left = 255;
      for (let k = Math.max(0, a - 3); k < a; k++) left = Math.min(left, row[k]);
      let right = 255;
      for (let k = b; k < Math.min(W, b + 3); k++) right = Math.min(right, row[k]);
      if (a === 0 || b === W) continue;
      if (peak - left < CONTRAST || peak - right < CONTRAST) continue;
      starts.push(a);
      ends.push(b);
    }
    rows[y] = centralSegment(starts, ends, cx, gapMax, nearCentre);
  }

  // Rows with at least two strokes, bridging hairline gaps, form text lines.
  const bridge = Math.max(1, Math.round(H * 0.006));
  const minLine = Math.max(4, H * 0.012);
  const maxLine = H * 0.16;
  interface Line {
    top: number;
    bottom: number;
    strokes: number;
    L: number;
    R: number;
  }
  const lines: Line[] = [];
  let y = y0;
  while (y < H) {
    if (rows[y].count < 2) {
      y++;
      continue;
    }
    const top = y;
    let last = y;
    let gap = 0;
    while (y < H && gap <= bridge) {
      if (rows[y].count >= 2) {
        last = y;
        gap = 0;
      } else gap++;
      y++;
    }
    const bottom = last + 1;
    const h = bottom - top;
    if (h < minLine || h > maxLine) continue;
    let strokes = 0;
    let peakCount = 0;
    const ls: number[] = [];
    const rs: number[] = [];
    for (let k = top; k < bottom; k++) {
      const r = rows[k];
      if (r.count < 2) continue;
      strokes += r.count;
      peakCount = Math.max(peakCount, r.count);
      ls.push(r.l);
      rs.push(r.r);
    }
    if (strokes < 10 || peakCount < 4) continue;
    ls.sort((p, q) => p - q);
    rs.sort((p, q) => p - q);
    const L = ls[Math.floor(ls.length * 0.15)];
    const R = rs[Math.min(rs.length - 1, Math.floor(rs.length * 0.85))];
    if (R - L < W * 0.03) continue;
    if (Math.abs((L + R) / 2 - cx) > W * 0.06) continue;
    lines.push({ top, bottom, strokes, L, R });
  }
  if (lines.length === 0) return null;

  // Lines close together (e.g. bilingual subtitles) belong to one block; keep the strongest block.
  const join = H * 0.04;
  interface Block {
    top: number;
    bottom: number;
    strokes: number;
    lineH: number;
    L: number;
    R: number;
  }
  let best: Block | undefined;
  let cur: Block | undefined;
  for (const ln of lines) {
    if (cur && ln.top - cur.bottom <= join) {
      cur.bottom = ln.bottom;
      cur.strokes += ln.strokes;
      cur.lineH = Math.max(cur.lineH, ln.bottom - ln.top);
      cur.L = Math.min(cur.L, ln.L);
      cur.R = Math.max(cur.R, ln.R);
    } else {
      cur = { top: ln.top, bottom: ln.bottom, strokes: ln.strokes, lineH: ln.bottom - ln.top, L: ln.L, R: ln.R };
    }
    if (!best || cur.strokes >= best.strokes) best = cur;
  }
  if (!best) return null;
  return {
    hit: { top: best.top / H, bottom: best.bottom / H, lineH: best.lineH / H, score: best.strokes },
    box: { x0: best.L, x1: best.R, y0: best.top, y1: best.bottom },
    rows,
  };
}

/* ------------------------------------------------------------------ */
/* Subtitle fingerprint (used to notice when the subtitle changes)     */
/* ------------------------------------------------------------------ */

export const SIG_COLS = 64;
export const SIG_ROWS = 24;

/**
 * A coarse map of where subtitle ink sits in the frame, or null when no subtitle is visible.
 * Two frames showing the same line give nearly identical maps.
 */
export function subtitleSignature(px: Pixels): Float32Array | null {
  const found = findSubtitle(px);
  if (!found) return null;
  const { width: W, height: H } = px;
  const { x0, x1, y0, y1 } = found.box;
  const sig = new Float32Array(SIG_COLS * SIG_ROWS);
  const yBase = H * SEARCH_FROM;
  const ySpan = H - yBase;
  // Only stroke pixels count, so a bright or moving background behind the text barely matters.
  for (let y = y0; y < y1; y++) {
    const gy = Math.min(SIG_ROWS - 1, Math.max(0, Math.floor(((y - yBase) / ySpan) * SIG_ROWS)));
    const strokes = found.rows[y].strokes;
    for (let k = 0; k < strokes.length; k += 2) {
      const a = Math.max(strokes[k], x0);
      const b = Math.min(strokes[k + 1], x1);
      for (let x = a; x < b; x++) sig[gy * SIG_COLS + Math.min(SIG_COLS - 1, Math.floor((x / W) * SIG_COLS))]++;
    }
  }
  return sig;
}

/** 0 for identical fingerprints, towards 1 (and beyond) for different subtitles. */
export function signatureDistance(a: Float32Array, b: Float32Array): number {
  let diff = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < a.length; i++) {
    diff += Math.abs(a[i] - b[i]);
    sa += a[i];
    sb += b[i];
  }
  return diff / Math.max(sa, sb, 1);
}

/** Keep only the strokes reachable from the centre without crossing a wide gap. */
function centralSegment(starts: number[], ends: number[], cx: number, gapMax: number, near: number): RowInfo {
  const n = starts.length;
  if (n === 0) return EMPTY_ROW;
  let seed = -1;
  let bestD = Infinity;
  for (let k = 0; k < n; k++) {
    const d = cx < starts[k] ? starts[k] - cx : cx > ends[k] ? cx - ends[k] : 0;
    if (d < bestD) {
      bestD = d;
      seed = k;
    }
  }
  if (bestD > near) return EMPTY_ROW;
  let lo = seed;
  let hi = seed;
  while (lo > 0 && starts[lo] - ends[lo - 1] <= gapMax) lo--;
  while (hi < n - 1 && starts[hi + 1] - ends[hi] <= gapMax) hi++;
  const strokes: number[] = [];
  for (let k = lo; k <= hi; k++) strokes.push(starts[k], ends[k]);
  return { count: hi - lo + 1, l: starts[lo], r: ends[hi], strokes };
}

/**
 * Merge per-frame hits into one band that fits every subtitle, with breathing room.
 * Hits that disagree with the majority position are ignored.
 */
export function combineBands(hits: (BandHit | null)[]): Band | null {
  const good = hits.filter((h): h is BandHit => !!h);
  if (good.length === 0) return null;
  const overlaps = (a: BandHit, b: BandHit) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
  let seed = good[0];
  let seedVotes = -1;
  for (const a of good) {
    let votes = 0;
    for (const b of good) if (overlaps(a, b)) votes += 1 + b.score / 1e6;
    if (votes > seedVotes) {
      seedVotes = votes;
      seed = a;
    }
  }
  const group = good.filter((h) => overlaps(seed, h));
  const top = Math.min(...group.map((h) => h.top));
  const bottom = Math.max(...group.map((h) => h.bottom));
  const heights = group.map((h) => h.lineH).sort((a, b) => a - b);
  const lineH = heights[Math.floor(heights.length / 2)];
  const pad = Math.min(0.05, Math.max(0.012, lineH * 0.45));
  return {
    top: Math.max(0, top - pad),
    bottom: Math.min(1, bottom + pad),
  };
}
