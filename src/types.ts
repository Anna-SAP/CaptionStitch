/** A rectangle expressed as fractions (0..1) of an image's width and height. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The subtitle band, as fractions (0..1) of the cropped content height. */
export interface Band {
  top: number;
  bottom: number;
}

/** Per-frame analysis that is computed once at import and reused. */
export interface FrameStats {
  /** 1 where an entire source row is uniformly dark (letterbox candidate). */
  rowDark: Uint8Array;
  /** 1 where an entire source column is uniformly dark (pillarbox candidate). */
  colDark: Uint8Array;
}

export interface Frame {
  id: string;
  name: string;
  /** The original file, kept for persistence and full-resolution export. */
  blob: Blob;
  /** Original pixel size. */
  w: number;
  h: number;
  /** A decoded working copy, at most WORK_MAX_WIDTH wide. */
  work: ImageBitmap;
  thumb: string;
  stats: FrameStats;
  /** The visible content area (black bars and player chrome removed). */
  crop: Rect;
  /** True while the crop is still managed by auto-detection. */
  cropAuto: boolean;
  /** Show the whole frame (true), only its subtitle band (false), or decide by position (null). */
  full: boolean | null;
  /** Subtitle band override for this frame only. */
  band: Band | null;
}

export type LayoutMode = 'captions' | 'stack' | 'grid';
export type OutFormat = 'jpeg' | 'png' | 'webp';
export type FontStyle = 'sans' | 'serif';

export interface Settings {
  layout: LayoutMode;
  band: Band;
  /** True while the band follows auto-detection. */
  bandAuto: boolean;
  autoTrim: boolean;
  columns: number;
  /** Spacing values are in output pixels at a 1080px-wide image and scale with the width. */
  gap: number;
  padding: number;
  radius: number;
  bg: string;
  title: string;
  note: string;
  credit: string;
  notePos: 'top' | 'bottom';
  font: FontStyle;
  /** Text colour as #rrggbb; empty picks black or white to suit the background. */
  textColor: string;
  /** 0 means "source width". */
  width: number;
  format: OutFormat;
  quality: number;
  /** Upper bound for the exported file in bytes; 0 disables it. */
  maxBytes: number;
}

export const DEFAULT_BAND: Band = { top: 0.8, bottom: 1 };

export const DEFAULT_SETTINGS: Settings = {
  layout: 'captions',
  band: DEFAULT_BAND,
  bandAuto: true,
  autoTrim: true,
  columns: 2,
  gap: 0,
  padding: 0,
  radius: 0,
  bg: '#111111',
  title: '',
  note: '',
  credit: '',
  notePos: 'bottom',
  font: 'sans',
  textColor: '',
  width: 1080,
  format: 'jpeg',
  quality: 90,
  maxBytes: 0,
};

export const FULL_RECT: Rect = { x: 0, y: 0, w: 1, h: 1 };

/** A decoration placed on top of the finished image: an emoji or one of the user's own pictures. */
export interface Sticker {
  id: string;
  kind: 'emoji' | 'image';
  /** The emoji character(s), for kind 'emoji'. */
  emoji?: string;
  /** The picture in the sticker library, for kind 'image'. */
  assetId?: string;
  /** Width divided by height. */
  aspect: number;
  /** Which part of the image the sticker belongs to. */
  anchor: 'header' | 'body' | 'footer';
  /** Centre: fraction of the image width. */
  x: number;
  /** Centre: fraction of the frame area's height (body), or of the image width below the top of a text area. */
  y: number;
  /** Width as a fraction of the image width. */
  size: number;
  /** Rotation in degrees. */
  rot: number;
}

/** A picture the user added to their sticker library. */
export interface StickerAsset {
  id: string;
  name: string;
  blob: Blob;
  bitmap: ImageBitmap;
  thumb: string;
}
