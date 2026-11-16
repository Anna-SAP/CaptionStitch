import { computed, effect, signal } from '@preact/signals';
import { combineBands, detectCrop } from './core/detect';
import { analyseBand, importBlob } from './core/image';
import { normalizeBand } from './core/layout';
import { planRender } from './core/render';
import { idbDel, idbGet, idbKeys, idbSet } from './core/store';
import { t, type Key } from './i18n';
import { DEFAULT_SETTINGS, FULL_RECT, type Band, type Frame, type Rect, type Settings } from './types';

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

export type Modal =
  | null
  | { kind: 'crop'; id: string }
  | { kind: 'video'; file?: Blob; stream?: MediaStream };
export const modal = signal<Modal>(null);

export const plan = computed(() => (frames.value.length ? planRender(frames.value, settings.value) : null));

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
  if (before.length === 0) return;
  frames.value = [];
  toast(t('cleared'), { action: { label: t('undo'), run: () => restore(before) } });
}

function restore(list: Frame[]) {
  frames.value = list;
  reanalyse();
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

let restoring = true;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const storedBlobs = new Set<string>();

async function saveSession(list: Frame[]) {
  try {
    for (const f of list) {
      if (storedBlobs.has(f.id)) continue;
      await idbSet('blobs', f.id, f.blob);
      storedBlobs.add(f.id);
    }
    const meta: SavedFrame[] = list.map(({ id, name, crop, cropAuto, full, band }) => ({ id, name, crop, cropAuto, full, band }));
    await idbSet('kv', 'session', meta);
    const keep = new Set(list.map((f) => f.id));
    for (const id of [...storedBlobs]) {
      if (keep.has(id)) continue;
      await idbDel('blobs', id);
      storedBlobs.delete(id);
    }
  } catch {
    /* private mode or quota: the session simply is not kept */
  }
}

/** Bring back the frames from the previous visit, if any. */
export async function restoreSession(): Promise<void> {
  try {
    const meta = await idbGet<SavedFrame[]>('kv', 'session');
    for (const key of await idbKeys('blobs')) storedBlobs.add(String(key));
    if (meta?.length) {
      const list: Frame[] = [];
      busy.value++;
      try {
        for (const m of meta) {
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
  if (restoring) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveSession(list), 600);
});
