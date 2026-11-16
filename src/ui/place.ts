import { patchSettings, plan, settings, type Point } from '../state';

/** The middle of the part of the image that is currently on screen, in output pixels. */
export function previewCentre(): Point | null {
  const sheet = document.querySelector('.sheet');
  const scroll = document.querySelector('.preview-scroll');
  const p = plan.value;
  if (!sheet || !scroll || !p) return null;
  const r = sheet.getBoundingClientRect();
  const v = scroll.getBoundingClientRect();
  const top = Math.max(r.top, v.top, 0);
  const bottom = Math.min(r.bottom, v.bottom, window.innerHeight);
  if (bottom <= top || r.width === 0) return null;
  return { cx: p.layout.width / 2, cy: ((top + bottom) / 2 - r.top) * (p.layout.width / r.width) };
}

/**
 * Where a new sticker should go: null lets it land in the text area (the usual place for decoration);
 * with no text on the image it goes to the middle of what is on screen.
 */
export function stickerSpot(): Point | null {
  const l = plan.value?.layout;
  if (!l) return null;
  const hasText = l.body.y > l.pad || l.height - l.body.y - l.body.h > l.pad;
  return hasText ? null : previewCentre();
}

/** Scroll the preview so the sticker that was just added can be seen. */
export function revealActiveSticker() {
  requestAnimationFrame(() => document.querySelector('.sticker.active')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
}

export type TextField = 'title' | 'note' | 'credit';

/** The text inputs, so emoji can be inserted where the caret is. */
export const fieldEls: Partial<Record<TextField, HTMLInputElement | HTMLTextAreaElement | null>> = {};

/** Insert text at the caret of one of the text fields (or at its end). */
export function insertIntoField(field: TextField, text: string) {
  const el = fieldEls[field];
  const current = settings.value[field];
  const start = Math.min(el?.selectionStart ?? current.length, current.length);
  const end = Math.min(el?.selectionEnd ?? start, current.length);
  patchSettings({ [field]: current.slice(0, start) + text + current.slice(end) });
  const caret = start + text.length;
  requestAnimationFrame(() => el?.setSelectionRange(caret, caret));
}
