import { useMemo, useRef, useState } from 'preact/hooks';
import { dominantColors } from '../core/color';
import { shareText } from '../core/export';
import { cropKey, sampleFrame } from '../core/image';
import { clamp } from '../core/layout';
import { textColors } from '../core/text';
import { t } from '../i18n';
import {
  addSticker,
  addStickerFiles,
  assets,
  autoBand,
  frames,
  modal,
  patchSettings,
  picker,
  removeAsset,
  say,
  setAutoTrim,
  setBand,
  settings,
} from '../state';
import type { LayoutMode, OutFormat } from '../types';
import { ColorField } from './ColorField';
import { EmojiPicker } from './EmojiPicker';
import { Section, Segmented, Slider, Toggle } from './controls';
import { Icon } from './icons';
import { fieldEls, revealActiveSticker, stickerSpot, type TextField } from './place';

const WIDTHS = [750, 1080, 1280, 1440, 1920];
const SIZES = [0, 500 * 1024, 1024 * 1024, 2 * 1024 * 1024, 5 * 1024 * 1024, 10 * 1024 * 1024];
const BACKGROUNDS = [
  '#111111', '#000000', '#2b2b2b', '#1f2a37', '#1e3a34', '#2d2440', '#3b2f2f',
  '#ffffff', '#f4efe6', '#ffd9e1', '#ffe8c2', '#fff3b0', '#d8f3dc', '#cdeafe', '#e2d9ff',
  '#ff6b81', '#ffb347', '#f2c14e', '#5ec4a8', '#4ea8de', '#9b7ede',
];
const TEXT_COLORS = ['#f5f3ee', '#191919', '#f2c14e', '#ff6b81', '#4ea8de', '#5ec4a8', '#9b7ede'];

/** A small button inside a text field's label that opens the emoji picker for that field. */
function EmojiButton({ field }: { field: TextField }) {
  return (
    <button
      type="button"
      class={`emoji-btn${picker.value === field ? ' on' : ''}`}
      title={t('emojiInsert')}
      aria-label={t('emojiInsert')}
      onClick={(e) => {
        e.preventDefault();
        picker.value = picker.value === field ? null : field;
      }}
    >
      <Icon name="smile" size={16} />
    </button>
  );
}

const sizeLabel = (n: number) => (n === 0 ? t('noLimit') : n < 1024 * 1024 ? `${n / 1024} KB` : `${n / 1024 / 1024} MB`);

export function Inspector() {
  const s = settings.value;
  const hasFrames = frames.value.length > 0;
  const customWidth = s.width !== 0 && !WIDTHS.includes(s.width);
  const [custom, setCustom] = useState(customWidth);
  const height = (s.band.bottom - s.band.top) * 100;
  const offset = (1 - s.band.bottom) * 100;
  const stickerInput = useRef<HTMLInputElement>(null);
  const first = frames.value[0];
  // Colours taken from the first screenshot, so the text card can match the scene.
  const fromFrames = useMemo(() => (first ? dominantColors(sampleFrame(first), 7) : []), [first?.id, first && cropKey(first.crop)]);

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
          <span class="field-head">
            {t('title')}
            <EmojiButton field="title" />
          </span>
          <input
            ref={(el) => {
              fieldEls.title = el;
            }}
            type="text"
            value={s.title}
            placeholder={t('titlePh')}
            onInput={(e) => patchSettings({ title: (e.target as HTMLInputElement).value })}
          />
        </label>
        {picker.value === 'title' && <EmojiPicker />}
        <label class="field">
          <span class="field-head">
            {t('note')}
            <EmojiButton field="note" />
          </span>
          <textarea
            ref={(el) => {
              fieldEls.note = el;
            }}
            rows={4}
            value={s.note}
            placeholder={t('notePh')}
            onInput={(e) => patchSettings({ note: (e.target as HTMLTextAreaElement).value })}
          />
        </label>
        {picker.value === 'note' && <EmojiPicker />}
        <label class="field">
          <span class="field-head">
            {t('credit')}
            <EmojiButton field="credit" />
          </span>
          <input
            ref={(el) => {
              fieldEls.credit = el;
            }}
            type="text"
            value={s.credit}
            placeholder={t('creditPh')}
            onInput={(e) => patchSettings({ credit: (e.target as HTMLInputElement).value })}
          />
        </label>
        {picker.value === 'credit' && <EmojiPicker />}
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
        <ColorField
          label={t('textColor')}
          value={s.textColor}
          fallback={textColors(s.bg).fg}
          presets={TEXT_COLORS}
          allowAuto
          onChange={(textColor) => patchSettings({ textColor })}
        />
      </Section>

      <Section title={t('stickers')}>
        <div class="row">
          <button type="button" class={`btn${picker.value === 'sticker' ? ' active' : ''}`} disabled={!hasFrames} onClick={() => (picker.value = picker.value === 'sticker' ? null : 'sticker')}>
            <Icon name="smile" size={16} />
            {t('addEmoji')}
          </button>
          <button type="button" class="btn" disabled={!hasFrames} onClick={() => stickerInput.current?.click()}>
            <Icon name="image" size={16} />
            {t('addImage')}
          </button>
          <input
            ref={stickerInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const input = e.target as HTMLInputElement;
              void addStickerFiles([...(input.files ?? [])], stickerSpot()).then(revealActiveSticker);
              input.value = '';
            }}
          />
        </div>
        {picker.value === 'sticker' && <EmojiPicker />}
        {assets.value.length > 0 && (
          <div class="sticker-lib" aria-label={t('myStickers')}>
            {assets.value.map((a) => (
              <div class="sticker-item" key={a.id}>
                <button
                  type="button"
                  class="sticker-add"
                  title={a.name}
                  disabled={!hasFrames}
                  onClick={() => {
                    addSticker({ kind: 'image', assetId: a.id, aspect: a.bitmap.width / a.bitmap.height }, stickerSpot());
                    revealActiveSticker();
                  }}
                >
                  <img src={a.thumb} alt={a.name} />
                </button>
                <button type="button" class="sticker-del" title={t('removeFromLib')} aria-label={t('removeFromLib')} onClick={() => removeAsset(a.id)}>
                  <Icon name="close" size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <p class="hint">{t('stickerTip')}</p>
      </Section>

      <Section title={t('style')}>
        <ColorField
          label={t('background')}
          value={s.bg}
          presets={BACKGROUNDS}
          suggested={fromFrames}
          defaultOpen
          onChange={(bg) => patchSettings({ bg })}
        />
        <Slider label={t('gap')} value={s.gap} min={0} max={40} onInput={(gap) => patchSettings({ gap })} />
        <Slider label={t('padding')} value={s.padding} min={0} max={80} onInput={(padding) => patchSettings({ padding })} />
        <Slider label={t('radius')} value={s.radius} min={0} max={48} onInput={(radius) => patchSettings({ radius })} />
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
