import { useState } from 'preact/hooks';
import { shareText } from '../core/export';
import { clamp } from '../core/layout';
import { t } from '../i18n';
import { autoBand, frames, modal, patchSettings, say, setAutoTrim, setBand, settings } from '../state';
import type { LayoutMode, OutFormat } from '../types';
import { Section, Segmented, Slider, Toggle } from './controls';
import { Icon } from './icons';

const WIDTHS = [750, 1080, 1280, 1440, 1920];
const SIZES = [0, 500 * 1024, 1024 * 1024, 2 * 1024 * 1024, 5 * 1024 * 1024, 10 * 1024 * 1024];
const BACKGROUNDS = ['#111111', '#000000', '#ffffff', '#f4efe6', '#1f2a37', '#3b2f2f'];

const sizeLabel = (n: number) => (n === 0 ? t('noLimit') : n < 1024 * 1024 ? `${n / 1024} KB` : `${n / 1024 / 1024} MB`);

export function Inspector() {
  const s = settings.value;
  const hasFrames = frames.value.length > 0;
  const customWidth = s.width !== 0 && !WIDTHS.includes(s.width);
  const [custom, setCustom] = useState(customWidth);
  const height = (s.band.bottom - s.band.top) * 100;
  const offset = (1 - s.band.bottom) * 100;

  return (
    <aside class="inspector">
      <Section title={t('layout')}>
        <Segmented<LayoutMode>
          value={s.layout}
          options={[
            { value: 'captions', label: t('layoutCaptions') },
            { value: 'stack', label: t('layoutStack') },
            { value: 'grid', label: t('layoutGrid') },
          ]}
          onChange={(layout) => patchSettings({ layout })}
        />
        {s.layout === 'grid' && (
          <Slider label={t('columns')} value={s.columns} min={1} max={6} onInput={(columns) => patchSettings({ columns })} />
        )}
      </Section>

      {s.layout === 'captions' && (
        <Section
          title={t('band')}
          aside={<span class={`badge${s.bandAuto ? ' on' : ''}`}>{s.bandAuto ? t('bandAutoOn') : t('bandManual')}</span>}
        >
          <Slider
            label={t('bandHeight')}
            value={height}
            min={2}
            max={60}
            step={0.5}
            unit="%"
            onInput={(v) => {
              const h = clamp(v / 100, 0.02, 1);
              const bottom = Math.max(s.band.bottom, h);
              setBand({ top: bottom - h, bottom });
            }}
          />
          <Slider
            label={t('bandOffset')}
            value={offset}
            min={0}
            max={60}
            step={0.5}
            unit="%"
            onInput={(v) => {
              const h = s.band.bottom - s.band.top;
              const bottom = clamp(1 - v / 100, h, 1);
              setBand({ top: bottom - h, bottom });
            }}
          />
          <div class="row">
            <button type="button" class="btn" disabled={!hasFrames} onClick={autoBand}>
              <Icon name="wand" size={16} />
              {t('bandAuto')}
            </button>
          </div>
          <p class="hint">{t('bandTip')}</p>
        </Section>
      )}

      <Section title={t('trim')}>
        <Toggle label={t('autoTrim')} checked={s.autoTrim} onChange={setAutoTrim} />
        <div class="row">
          <button
            type="button"
            class="btn"
            disabled={!hasFrames}
            onClick={() => (modal.value = { kind: 'crop', id: frames.value[0].id })}
          >
            <Icon name="crop" size={16} />
            {t('cropAll')}
          </button>
        </div>
      </Section>

      <Section
        title={t('text')}
        aside={
          shareText(s) && (
            <button
              type="button"
              class="link"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareText(s));
                  say('textCopied');
                } catch {
                  /* clipboard blocked */
                }
              }}
            >
              {t('copyText')}
            </button>
          )
        }
      >
        <label class="field">
          <span>{t('title')}</span>
          <input type="text" value={s.title} placeholder={t('titlePh')} onInput={(e) => patchSettings({ title: (e.target as HTMLInputElement).value })} />
        </label>
        <label class="field">
          <span>{t('note')}</span>
          <textarea rows={4} value={s.note} placeholder={t('notePh')} onInput={(e) => patchSettings({ note: (e.target as HTMLTextAreaElement).value })} />
        </label>
        <label class="field">
          <span>{t('credit')}</span>
          <input type="text" value={s.credit} placeholder={t('creditPh')} onInput={(e) => patchSettings({ credit: (e.target as HTMLInputElement).value })} />
        </label>
        <Segmented
          label={t('notePos')}
          value={s.notePos}
          options={[
            { value: 'top', label: t('posTop') },
            { value: 'bottom', label: t('posBottom') },
          ]}
          onChange={(notePos) => patchSettings({ notePos })}
        />
        <Segmented
          label={t('font')}
          value={s.font}
          options={[
            { value: 'sans', label: t('fontSans') },
            { value: 'serif', label: t('fontSerif') },
          ]}
          onChange={(font) => patchSettings({ font })}
        />
      </Section>

      <Section title={t('style')}>
        <Slider label={t('gap')} value={s.gap} min={0} max={40} onInput={(gap) => patchSettings({ gap })} />
        <Slider label={t('padding')} value={s.padding} min={0} max={80} onInput={(padding) => patchSettings({ padding })} />
        <Slider label={t('radius')} value={s.radius} min={0} max={48} onInput={(radius) => patchSettings({ radius })} />
        <div class="seg-row">
          <span class="seg-label">{t('background')}</span>
          <div class="swatches">
            {BACKGROUNDS.map((c) => (
              <button
                type="button"
                class={`swatch${s.bg.toLowerCase() === c ? ' on' : ''}`}
                style={{ background: c }}
                aria-label={c}
                title={c}
                onClick={() => patchSettings({ bg: c })}
              />
            ))}
            <input type="color" value={s.bg} aria-label={t('background')} onInput={(e) => patchSettings({ bg: (e.target as HTMLInputElement).value })} />
          </div>
        </div>
      </Section>

      <Section title={t('export')}>
        <label class="field inline">
          <span>{t('width')}</span>
          <select
            value={custom ? 'custom' : String(s.width)}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              setCustom(v === 'custom');
              if (v !== 'custom') patchSettings({ width: Number(v) });
            }}
          >
            {WIDTHS.map((w) => (
              <option value={w}>{w} px</option>
            ))}
            <option value="0">{t('widthSource')}</option>
            <option value="custom">{t('widthCustom')}</option>
          </select>
        </label>
        {custom && (
          <label class="field inline">
            <span>px</span>
            <input
              type="number"
              min={200}
              max={8000}
              step={10}
              value={s.width || 1080}
              onChange={(e) => patchSettings({ width: clamp(Math.round(Number((e.target as HTMLInputElement).value) || 1080), 200, 8000) })}
            />
          </label>
        )}
        <Segmented<OutFormat>
          label={t('format')}
          value={s.format}
          options={[
            { value: 'jpeg', label: 'JPG' },
            { value: 'png', label: 'PNG' },
            { value: 'webp', label: 'WebP' },
          ]}
          onChange={(format) => patchSettings({ format })}
        />
        {s.format !== 'png' && (
          <Slider label={t('quality')} value={s.quality} min={40} max={100} onInput={(quality) => patchSettings({ quality })} />
        )}
        <label class="field inline">
          <span>{t('maxSize')}</span>
          <select value={String(s.maxBytes)} onChange={(e) => patchSettings({ maxBytes: Number((e.target as HTMLSelectElement).value) })}>
            {SIZES.map((n) => (
              <option value={n}>{sizeLabel(n)}</option>
            ))}
          </select>
        </label>
      </Section>
      <p class="privacy">{t('privacy')}</p>
    </aside>
  );
}
