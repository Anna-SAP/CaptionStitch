import type { Sticker } from '../types';
import type { Layout } from './layout';

export interface StickerBox {
  /** Centre and size in output pixels. */
  cx: number;
  cy: number;
  w: number;
  h: number;
}

interface Region {
  top: number;
  height: number;
}

function regions(l: Layout): Record<Sticker['anchor'], Region> {
  return {
    header: { top: 0, height: l.body.y },
    body: { top: l.body.y, height: l.body.h },
    footer: { top: l.body.y + l.body.h, height: l.height - l.body.y - l.body.h },
  };
}

/**
 * Where a sticker sits in the final image.
 * A sticker belongs to the text above, the frames, or the text below, and keeps its place
 * within that part when frames are added or the text grows.
 */
export function stickerBox(s: Sticker, l: Layout): StickerBox {
  const r = regions(l)[s.anchor];
  const w = s.size * l.width;
  return {
    cx: s.x * l.width,
    // Text areas scale with the width; the frame area scales with its own height.
    cy: r.top + (s.anchor === 'body' ? s.y * r.height : s.y * l.width),
    w,
    h: w / s.aspect,
  };
}

/** The reverse of stickerBox: turn a point in the image into an anchored position. */
export function anchorAt(cx: number, cy: number, l: Layout): Pick<Sticker, 'anchor' | 'x' | 'y'> {
  const rs = regions(l);
  const x = Math.min(1, Math.max(0, cx / l.width));
  const y = Math.min(l.height, Math.max(0, cy));
  let anchor: Sticker['anchor'] = 'body';
  if (rs.header.height > 0 && y < rs.body.top) anchor = 'header';
  else if (rs.footer.height > 0 && y >= rs.footer.top) anchor = 'footer';
  const r = rs[anchor];
  return {
    anchor,
    x,
    y: anchor === 'body' ? (r.height > 0 ? (y - r.top) / r.height : 0) : (y - r.top) / l.width,
  };
}
