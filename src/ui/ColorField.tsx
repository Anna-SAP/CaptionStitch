import { useEffect, useRef, useState } from 'preact/hooks';
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from '../core/color';
import { t } from '../i18n';
import { Icon } from './icons';

interface Props {
  label: string;
  /** #rrggbb, or '' for "automatic" when `allowAuto` is set. */
  value: string;
  /** Shown in the picker while the value is automatic. */
  fallback?: string;
  onChange: (hex: string) => void;
  presets: string[];
  /** Extra suggestions, e.g. colours taken from the screenshots. */
  suggested?: string[];
  allowAuto?: boolean;
  defaultOpen?: boolean;
}

interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}
const EyeDropperCtor = (globalThis as { EyeDropper?: new () => EyeDropperLike }).EyeDropper;

/** A colour control: quick swatches plus a full picker (any hue, saturation and brightness, or a hex code). */
export function ColorField(props: Props) {
  const { label, value, onChange, presets, suggested = [], allowAuto, fallback = '#111111' } = props;
  const [open, setOpen] = useState(!!props.defaultOpen);
  const shown = normalizeHex(value) ?? fallback;
  // The picker keeps its own hue/saturation so they survive passing through black, white and grey.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(shown));
  const [text, setText] = useState(shown);
  const area = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (hsvToHex(hsv) !== shown) setHsv(hexToHsv(shown));
    setText(shown);
  }, [shown]);

  const apply = (next: Hsv) => {
    setHsv(next);
    onChange(hsvToHex(next));
  };
  const fromPointer = (e: PointerEvent) => {
    const r = area.current!.getBoundingClientRect();
    apply({
      h: hsv.h,
      s: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      v: 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    });
  };
  const is = (c: string) => !!value && c.toLowerCase() === shown;

  return (
    <div class="color-field">
      <div class="seg-row">
        <span class="seg-label">{label}</span>
        <button type="button" class={`color-chip${open ? ' on' : ''}`} aria-expanded={open} title={t('customColor')} onClick={() => setOpen(!open)}>
          <i style={{ background: shown }} />
          <span>{value ? shown.toUpperCase() : t('auto')}</span>
        </button>
      </div>
      <div class="swatches">
        {allowAuto && (
          <button type="button" class={`swatch auto${value ? '' : ' on'}`} title={t('auto')} aria-label={t('auto')} onClick={() => onChange('')}>
            A
          </button>
        )}
        {presets.map((c) => (
          <button type="button" key={c} class={`swatch${is(c) ? ' on' : ''}`} style={{ background: c }} aria-label={c} title={c} onClick={() => onChange(c)} />
        ))}
        <button type="button" class={`swatch rainbow${open ? ' on' : ''}`} title={t('customColor')} aria-label={t('customColor')} onClick={() => setOpen(!open)} />
      </div>
      {suggested.length > 0 && (
        <div class="swatches">
          <span class="swatch-note">{t('fromFrames')}</span>
          {suggested.map((c) => (
            <button type="button" key={c} class={`swatch${is(c) ? ' on' : ''}`} style={{ background: c }} aria-label={c} title={c} onClick={() => onChange(c)} />
          ))}
        </div>
      )}
      {open && (
        <div class="picker">
          <div
            ref={area}
            class="picker-area"
            style={{ background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
            onPointerDown={(e) => {
              dragging.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              fromPointer(e);
            }}
            onPointerMove={(e) => dragging.current && fromPointer(e)}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
          >
            <i style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: shown }} />
          </div>
          <input
            type="range"
            class="hue"
            min={0}
            max={360}
            step={1}
            value={hsv.h}
            aria-label="hue"
            onInput={(e) => {
              const h = Number((e.target as HTMLInputElement).value);
              // A grey has no visible hue; give it some colour so moving the slider does something.
              apply({ h, s: hsv.s < 0.02 ? 0.6 : hsv.s, v: hsv.v < 0.02 ? 0.8 : hsv.v });
            }}
          />
          <div class="row">
            <input
              type="text"
              class="hex"
              value={text}
              spellcheck={false}
              maxLength={7}
              aria-label="hex"
              onInput={(e) => {
                const raw = (e.target as HTMLInputElement).value;
                setText(raw);
                const hex = raw.trim().length >= 6 ? normalizeHex(raw) : null;
                if (hex) onChange(hex);
              }}
              onBlur={() => setText(shown)}
            />
            {EyeDropperCtor && (
              <button
                type="button"
                class="btn"
                onClick={async () => {
                  try {
                    const hex = normalizeHex((await new EyeDropperCtor().open()).sRGBHex);
                    if (hex) onChange(hex);
                  } catch {
                    /* cancelled */
                  }
                }}
              >
                <Icon name="pipette" size={16} />
                {t('pickScreen')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
