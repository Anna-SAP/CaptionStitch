import { computed, effect, signal } from '@preact/signals';
import { combineBands, detectCrop } from './core/detect';
import { analyseBand, importBlob, importStickerBlob, newId } from './core/image';
import { normalizeBand } from './core/layout';
import { planRender, type Decor } from './core/render';
import { anchorAt } from './core/stickers';
import { idbDel, idbGet, idbKeys, idbSet } from './core/store';
import { t, type Key } from './i18n';
import {
  DEFAULT_SETTINGS,
  FULL_RECT,
  type Band,
  type Frame,
  type Rect,
  type Settings,
  type Sticker,
  type StickerAsset,
} from './types';

/* ------------------------------------------------------------------ */
/* Signals                                                             */
/* ------------------------------------------------------------------ */

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('captionstitch.settings');
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULT_SETTINGS, ...saved, band: normalizeBand(saved.band ?? DEFAULT_SETTINGS.band) };
    }
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_SETTINGS;
}

export const frames = signal<Frame[]>([]);
export const settings = signal<Settings>(loadSettings());
export const busy = signal(0);
export const showGuides = signal(true);
/** The frame the pointer is on (or that was last tapped). */
export const activeId = signal<string | null>(null);

/** Stickers placed on the image, in paint order. */
export const stickers = signal<Sticker[]>([]);
/** The user's own sticker pictures; kept between visits. */
export const assets = signal<StickerAsset[]>([]);
export const activeSticker = signal<string | null>(null);
/** Which text field (or the sticker layer) the emoji picker feeds; null when it is closed. */
export type PickerTarget = 'title' | 'note' | 'credit' | 'sticker';
export const picker = signal<PickerTarget | null>(null);

export type Modal =
  | null
  | { kind: 'crop'; id: string }
  | { kind: 'video'; file?: Blob; stream?: MediaStream };
export const modal = signal<Modal>(null);

export const plan = computed(() => (frames.value.length ? planRender(frames.value, settings.value) : null));
export const decor = computed<Decor>(() => ({
  stickers: stickers.value,
  assets: new Map(assets.value.map((a) => [a.id, a])),
}));

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
  action?: { label: string; run: () => void };
}
export const toasts = signal<Toast[]>([]);
let toastSeq = 0;

export function toast(text: string, opts: { kind?: Toast['kind']; action?: Toast['action']; ms?: number } = {}) {
  const id = ++toastSeq;
  toasts.value = [...toasts.value.slice(-2), { id, text, kind: opts.kind ?? 'info', action: opts.action }];
  setTimeout(() => dismissToast(id), opts.ms ?? (opts.action ? 7000 : 2600));
}
export function dismissToast(id: number) {
  toasts.value = toasts.value.filter((x) => x.id !== id);
}
export const say = (key: Key, vars?: Record<string, string | number>) => toast(t(key, vars));
export const fail = (key: Key, vars?: Record<string, string | number>) => toast(t(key, vars), { kind: 'error', ms: 5000 });

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

const sameRect = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h) < 1e-6;

/** Re-run auto crop and auto band detection for the frames that are still on "auto". */
export function reanalyse(): { bandFound: boolean } {
  let list = frames.value;
  const s = settings.value;

  const groups = new Map<string, Frame[]>();
  for (const f of list) {
    const key = `${f.w}x${f.h}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const crops = new Map<string, Rect>();
  for (const [key, group] of groups) {
    crops.set(key, s.autoTrim ? detectCrop(group.map((f) => f.stats), group[0].w, group[0].h) : FULL_RECT);
  }
  let changed = false;
  list = list.map((f) => {
    if (!f.cropAuto) return f;
    const crop = crops.get(`${f.w}x${f.h}`)!;
    if (sameRect(crop, f.crop)) return f;
    changed = true;
    return { ...f, crop };
  });
  if (changed) frames.value = list;

  let bandFound = false;
  if (s.bandAuto && list.length > 0) {
    const band = combineBands(list.map(analyseBand));
    if (band) {
      bandFound = true;
      const b = normalizeBand(band);
      if (Math.abs(b.top - s.band.top) + Math.abs(b.bottom - s.band.bottom) > 1e-4) {
        settings.value = { ...settings.value, band: b };
      }
    }
  }
  return { bandFound };
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export interface Incoming {
  blob: Blob;
  name: string;
  /** Used to put a batch in shooting order. */
  time?: number;
}

const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Import images, oldest first, then refresh the automatic crop and band. */
export async function addBlobs(items: Incoming[]): Promise<number> {
  if (items.length === 0) return 0;
  const sorted = [...items].sort((a, b) => (a.time ?? 0) - (b.time ?? 0) || natural.compare(a.name, b.name));
  busy.value++;
  let failed = 0;
  let added = 0;
  try {
    for (const item of sorted) {
      try {
        const frame = await importBlob(item.blob, item.name);
        frames.value = [...frames.value, frame];
        added++;
      } catch {
        failed++;
      }
    }
    reanalyse();
  } finally {
    busy.value--;
  }
  if (failed) fail('importFailed', { n: failed });
  return added;
}

export function addFiles(files: Iterable<File>): Promise<number> {
  return addBlobs([...files].map((f) => ({ blob: f, name: f.name, time: f.lastModified })));
}

export function patchSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch };
}

/** The user moved the shared band by hand: stop auto-detecting it. */
export function setBand(band: Band) {
  patchSettings({ band: normalizeBand(band), bandAuto: false });
}

export function autoBand() {
  patchSettings({ bandAuto: true });
  frames.value = frames.value.map((f) => (f.band ? { ...f, band: null } : f));
  const { bandFound } = reanalyse();
  if (bandFound) say('bandFound');
  else fail('bandNotFound');
}

export function setAutoTrim(on: boolean) {
  patchSettings({ autoTrim: on });
  if (on) frames.value = frames.value.map((f) => (f.cropAuto ? f : { ...f, cropAuto: true }));
  reanalyse();
}

function patchFrame(id: string, patch: Partial<Frame>) {
  frames.value = frames.value.map((f) => (f.id === id ? { ...f, ...patch } : f));
}

export function setFrameBand(id: string, band: Band | null) {
  patchFrame(id, { band: band && normalizeBand(band) });
}

export function setFull(id: string, full: boolean) {
  patchFrame(id, { full });
}

export function setCrop(id: string, crop: Rect, applyAll: boolean) {
  const src = frames.value.find((f) => f.id === id);
  if (!src) return;
  frames.value = frames.value.map((f) =>
    f.id === id || (applyAll && f.w === src.w && f.h === src.h) ? { ...f, crop, cropAuto: false } : f,
  );
  reanalyse();
}

export function moveFrame(id: string, delta: number) {
  const list = [...frames.value];
  const i = list.findIndex((f) => f.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  frames.value = list;
}

export function reorder(fromId: string, toIndex: number) {
  const list = [...frames.value];
  const i = list.findIndex((f) => f.id === fromId);
  if (i < 0) return;
  const [f] = list.splice(i, 1);
  list.splice(Math.min(list.length, Math.max(0, toIndex)), 0, f);
  frames.value = list;
}

export function removeFrame(id: string) {
  const before = frames.value;
  frames.value = before.filter((f) => f.id !== id);
  reanalyse();
  toast(t('removed'), { action: { label: t('undo'), run: () => restore(before) } });
}

export function clearAll() {
  const before = frames.value;
  const beforeStickers = stickers.value;
  if (before.length === 0) return;
  frames.value = [];
  stickers.value = [];
  activeSticker.value = null;
  toast(t('cleared'), {
    action: {
      label: t('undo'),
      run: () => {
        stickers.value = beforeStickers;
        restore(before);
      },
    },
  });
}

function restore(list: Frame[]) {
  frames.value = list;
  reanalyse();
}

/* ------------------------------------------------------------------ */
/* Stickers                                                            */
/* ------------------------------------------------------------------ */

/** A point in the finished image, in output pixels. */
export interface Point {
  cx: number;
  cy: number;
}

/** Place a sticker. Without a position it lands in a text area if there is one, else over the frames' upper right. */
export function addSticker(base: Pick<Sticker, 'kind' | 'emoji' | 'assetId' | 'aspect'>, at?: Point | null): void {
  const p = plan.value;
  if (!p) return;
  const l = p.layout;
  const footer = l.height - l.body.y - l.body.h;
  // Nudge each new sticker so several added in a row do not hide one another.
  const nudge = ((stickers.value.length % 5) - 2) * 0.035 * l.width;
  const point = at ?? {
    cx: l.width * 0.78,
    cy: footer > 0 ? l.body.y + l.body.h + footer / 2 : l.body.y > 0 ? l.body.y / 2 : l.body.y + l.body.h * 0.2,
  };
  const size = base.kind === 'emoji' ? 0.11 : Math.min(0.18, 0.18 * base.aspect);
  const sticker: Sticker = {
    id: newId(),
    ...base,
    ...anchorAt(point.cx + nudge, point.cy + nudge * 0.6, l),
    size,
    rot: 0,
  };
  stickers.value = [...stickers.value, sticker];
  activeSticker.value = sticker.id;
}

export function updateSticker(id: string, patch: Partial<Sticker>) {
  stickers.value = stickers.value.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

export function removeSticker(id: string) {
  stickers.value = stickers.value.filter((s) => s.id !== id);
  if (activeSticker.value === id) activeSticker.value = null;
}

/** Add pictures to the sticker library and place each one on the image. */
export async function addStickerFiles(files: Iterable<File>, at?: Point | null): Promise<void> {
  let failed = 0;
  busy.value++;
  try {
    for (const file of files) {
      try {
        const asset = await importStickerBlob(file, file.name);
        assets.value = [...assets.value, asset];
        addSticker({ kind: 'image', assetId: asset.id, aspect: asset.bitmap.width / asset.bitmap.height }, at);
      } catch {
        failed++;
      }
    }
  } finally {
    busy.value--;
  }
  if (failed) fail('importFailed', { n: failed });
}

/** Take a picture out of the library, together with the stickers that use it. */
export function removeAsset(id: string) {
  const beforeAssets = assets.value;
  const beforeStickers = stickers.value;
  assets.value = beforeAssets.filter((a) => a.id !== id);
  stickers.value = beforeStickers.filter((s) => s.assetId !== id);
  toast(t('stickerRemoved'), {
    action: {
      label: t('undo'),
      run: () => {
        assets.value = beforeAssets;
        stickers.value = beforeStickers;
      },
    },
  });
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

interface SavedFrame {
  id: string;
  name: string;
  crop: Rect;
  cropAuto: boolean;
  full: boolean | null;
  band: Band | null;
}

interface SavedSession {
  frames: SavedFrame[];
  stickers: Sticker[];
}

let restoring = true;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const storedBlobs = new Set<string>();

async function saveSession(list: Frame[], placed: Sticker[], library: StickerAsset[]) {
  try {
    for (const item of [...list, ...library]) {
      if (storedBlobs.has(item.id)) continue;
      await idbSet('blobs', item.id, item.blob);
      storedBlobs.add(item.id);
    }
    const session: SavedSession = {
      frames: list.map(({ id, name, crop, cropAuto, full, band }) => ({ id, name, crop, cropAuto, full, band })),
      stickers: placed,
    };
    await idbSet('kv', 'session', session);
    await idbSet('kv', 'stickerLib', library.map(({ id, name }) => ({ id, name })));
    const keep = new Set([...list, ...library].map((x) => x.id));
    for (const id of [...storedBlobs]) {
      if (keep.has(id)) continue;
      await idbDel('blobs', id);
      storedBlobs.delete(id);
    }
  } catch {
    /* private mode or quota: the session simply is not kept */
  }
}

/** Bring back the sticker library and the frames from the previous visit, if any. */
export async function restoreSession(): Promise<void> {
  try {
    for (const key of await idbKeys('blobs')) storedBlobs.add(String(key));

    const lib = (await idbGet<{ id: string; name: string }[]>('kv', 'stickerLib')) ?? [];
    const library: StickerAsset[] = [];
    for (const item of lib) {
      const blob = await idbGet<Blob>('blobs', item.id);
      if (!blob) continue;
      try {
        library.push(await importStickerBlob(blob, item.name, item.id));
      } catch {
        /* skip unreadable entries */
      }
    }
    if (library.length) assets.value = [...library, ...assets.value];

    // Sessions saved by earlier versions were a plain list of frames.
    const saved = await idbGet<SavedSession | SavedFrame[]>('kv', 'session');
    const session: SavedSession = Array.isArray(saved) ? { frames: saved, stickers: [] } : (saved ?? { frames: [], stickers: [] });
    if (session.frames.length) {
      const list: Frame[] = [];
      busy.value++;
      try {
        for (const m of session.frames) {
          const blob = await idbGet<Blob>('blobs', m.id);
          if (!blob) continue;
          try {
            const f = await importBlob(blob, m.name, m.id);
            list.push({ ...f, crop: m.crop, cropAuto: m.cropAuto, full: m.full, band: m.band });
          } catch {
            /* skip unreadable entries */
          }
        }
      } finally {
        busy.value--;
      }
      if (list.length && frames.value.length === 0) {
        frames.value = list;
        const known = new Set(assets.value.map((a) => a.id));
        stickers.value = (session.stickers ?? []).filter((s) => s.kind === 'emoji' || (s.assetId && known.has(s.assetId)));
        say('restored');
      }
    }
  } catch {
    /* no stored session */
  } finally {
    restoring = false;
  }
}

effect(() => {
  const s = settings.value;
  try {
    localStorage.setItem('captionstitch.settings', JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
});

effect(() => {
  const list = frames.value;
  const placed = stickers.value;
  const library = assets.value;
  if (restoring) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveSession(list, placed, library), 600);
});
