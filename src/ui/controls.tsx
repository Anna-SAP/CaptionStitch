import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';

export function Section({ title, aside, children }: { title: string; aside?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="section">
      <header class="section-head">
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onInput: (v: number) => void;
}) {
  const { label, value, min, max, step = 1, unit = '', onInput } = props;
  const shown = step < 1 ? value.toFixed(1) : Math.round(value);
  return (
    <label class="slider">
      <span class="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) => onInput(Number((e.target as HTMLInputElement).value))}
      />
      <output>
        {shown}
        {unit}
      </output>
    </label>
  );
}

export function Segmented<T extends string | number>(props: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="seg-row">
      {props.label && <span class="seg-label">{props.label}</span>}
      <div class="seg" role="radiogroup" aria-label={props.label}>
        {props.options.map((o) => (
          <button
            type="button"
            role="radio"
            aria-checked={o.value === props.value}
            class={o.value === props.value ? 'on' : ''}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span class="toggle-track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

/**
 * Pointer dragging with capture. `onStart` returns the per-move handler,
 * which receives the pointer's travel since the drag began.
 */
export function useDrag(onStart: (e: PointerEvent) => ((dx: number, dy: number, e: PointerEvent) => void) | void) {
  const state = useRef<{ x: number; y: number; move: (dx: number, dy: number, e: PointerEvent) => void } | null>(null);
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const move = onStart(e);
      if (!move) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      state.current = { x: e.clientX, y: e.clientY, move };
    },
    onPointerMove: (e: PointerEvent) => {
      const s = state.current;
      if (s) s.move(e.clientX - s.x, e.clientY - s.y, e);
    },
    onPointerUp: (e: PointerEvent) => {
      state.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    },
    onPointerCancel: () => {
      state.current = null;
    },
  };
}
