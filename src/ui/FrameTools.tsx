import { t } from '../i18n';
import { modal, moveFrame, removeFrame, setFrameBand, setFull, settings } from '../state';
import type { Frame } from '../types';
import { Icon, type IconName } from './icons';

function Tool(props: { label: string; icon: IconName; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      class={`tool${props.danger ? ' danger' : ''}`}
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
    >
      <Icon name={props.icon} size={15} />
    </button>
  );
}

/** Actions for one frame: reorder, whole/strip, crop, reset its own band, remove. */
export function FrameTools({ frame, index, count, full }: { frame: Frame; index: number; count: number; full: boolean }) {
  const captions = settings.value.layout === 'captions';
  return (
    <div class="tools">
      <Tool label={t('moveUp')} icon="up" disabled={index === 0} onClick={() => moveFrame(frame.id, -1)} />
      <Tool label={t('moveDown')} icon="down" disabled={index === count - 1} onClick={() => moveFrame(frame.id, 1)} />
      {captions && (
        <Tool label={full ? t('showStrip') : t('showFull')} icon={full ? 'collapse' : 'expand'} onClick={() => setFull(frame.id, !full)} />
      )}
      <Tool label={t('cropThis')} icon="crop" onClick={() => (modal.value = { kind: 'crop', id: frame.id })} />
      {captions && frame.band && <Tool label={t('resetBand')} icon="reset" onClick={() => setFrameBand(frame.id, null)} />}
      <Tool label={t('remove')} icon="trash" danger onClick={() => removeFrame(frame.id)} />
    </div>
  );
}
