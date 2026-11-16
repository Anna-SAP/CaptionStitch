import { useEffect, useRef, useState } from 'preact/hooks';
import { makeDemoFrames } from './core/demo';
import {
  canCopyImage,
  canShareFiles,
  copyCanvas,
  downloadBlob,
  encodeCanvas,
  fileName,
  needsOriginals,
  renderFinal,
  renderTo,
  shareText,
} from './core/export';
import { isImageFile, isVideoFile } from './core/image';
import { planRender } from './core/render';
import { lang, setLang, t } from './i18n';
import { addBlobs, addFiles, busy, fail, frames, modal, say, settings } from './state';
import { CropModal } from './ui/CropModal';
import { FrameRail } from './ui/FrameRail';
import { Icon } from './ui/icons';
import { Inspector } from './ui/Inspector';
import { Preview } from './ui/Preview';
import { Toasts } from './ui/Toasts';
import { VideoModal } from './ui/VideoModal';

/** Route dropped, pasted or picked files: images become frames, a video opens the frame grabber. */
function takeFiles(files: File[]) {
  const images = files.filter(isImageFile);
  const video = files.find(isVideoFile);
  if (images.length) void addFiles(images);
  else if (video) modal.value = { kind: 'video', file: video };
  else if (files.length) fail('importFailed', { n: files.length });
}

async function copyImage() {
  if (!frames.value.length) return;
  try {
    const plan = planRender(frames.value, settings.value);
    let canvas: HTMLCanvasElement;
    if (needsOriginals(plan, frames.value)) {
      canvas = (await renderFinal(frames.value, settings.value)).canvas;
    } else {
      // Stay synchronous up to the clipboard call so the user gesture is still valid.
      canvas = document.createElement('canvas');
      renderTo(canvas, plan, frames.value);
    }
    await copyCanvas(canvas);
    say('copied');
  } catch {
    fail('copyFailed');
  }
}

async function exportBlob() {
  const s = settings.value;
  const { canvas } = await renderFinal(frames.value, s);
  return encodeCanvas(canvas, s.format, s.quality, s.maxBytes);
}

async function download() {
  if (!frames.value.length) return;
  busy.value++;
  try {
    const { blob } = await exportBlob();
    downloadBlob(blob, fileName(settings.value, blob.type));
    say('saved');
  } finally {
    busy.value--;
  }
}

async function share() {
  if (!frames.value.length) return;
  try {
    const { blob } = await exportBlob();
    const file = new File([blob], fileName(settings.value, blob.type), { type: blob.type });
    await navigator.share({ files: [file], text: shareText(settings.value) || undefined });
  } catch (e) {
    if ((e as DOMException)?.name !== 'AbortError') fail('shareFailed');
  }
}

async function startRecording() {
  if (!navigator.mediaDevices?.getDisplayMedia) return fail('recordUnsupported');
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    modal.value = { kind: 'video', stream };
  } catch {
    fail('recordDenied');
  }
}

const typing = (el: EventTarget | null) => {
  const tag = (el as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

export function App() {
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);
  const has = frames.value.length > 0;
  const m = modal.value;
  // Read so the whole tree re-renders when the language changes.
  void lang.value;

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      e.preventDefault();
      // Pasted screenshots have no useful name or date; keep the order they arrive in.
      const now = Date.now();
      const images = files.filter(isImageFile);
      if (images.length) void addBlobs(images.map((f, i) => ({ blob: f, name: f.name || `pasted-${i + 1}.png`, time: now + i })));
      else takeFiles(files);
    };
    const onKey = (e: KeyboardEvent) => {
      if (modal.value || !(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        void download();
      } else if (key === 'c' && !typing(e.target) && !window.getSelection()?.toString()) {
        e.preventDefault();
        void copyImage();
      }
    };
    let depth = 0;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDropping(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      if (--depth <= 0) {
        depth = 0;
        setDropping(false);
      }
    };
    const onOver = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDropping(false);
      takeFiles([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const pickImages = () => imageInput.current?.click();
  const pickVideo = () => videoInput.current?.click();
  const onPicked = (e: Event) => {
    const input = e.target as HTMLInputElement;
    takeFiles([...(input.files ?? [])]);
    input.value = '';
  };

  return (
    <div class={`app${has ? '' : ' empty'}`}>
      <header class="topbar">
        <div class="brand">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--brand-tile)" />
            <rect x="6" y="6" width="20" height="10" rx="2" fill="var(--accent)" />
            <rect x="6" y="18" width="20" height="3.5" rx="1.2" fill="var(--accent)" opacity=".75" />
            <rect x="6" y="23" width="20" height="3.5" rx="1.2" fill="var(--accent)" opacity=".5" />
          </svg>
          <h1>CaptionStitch</h1>
        </div>
        <nav class="sources" aria-label={t('addShots')}>
          <button type="button" class="btn" onClick={pickImages}>
            <Icon name="image" size={16} />
            <span>{t('addShots')}</span>
          </button>
          <button type="button" class="btn" onClick={pickVideo}>
            <Icon name="film" size={16} />
            <span>{t('fromVideo')}</span>
          </button>
          {!!navigator.mediaDevices?.getDisplayMedia && (
            <button type="button" class="btn" onClick={() => void startRecording()}>
              <Icon name="record" size={16} />
              <span>{t('record')}</span>
            </button>
          )}
        </nav>
        <div class="spacer" />
        {busy.value > 0 && <span class="working">{t('working')}</span>}
        <div class="outputs">
          {canCopyImage() && (
            <button type="button" class="btn primary" disabled={!has} title={t('copyHint')} onClick={() => void copyImage()}>
              <Icon name="copy" size={16} />
              <span>{t('copy')}</span>
            </button>
          )}
          <button type="button" class={`btn${canCopyImage() ? '' : ' primary'}`} disabled={!has} title={t('downloadHint')} onClick={() => void download()}>
            <Icon name="download" size={16} />
            <span>{t('download')}</span>
          </button>
          {canShareFiles() && (
            <button type="button" class="btn" disabled={!has} title={t('shareHint')} onClick={() => void share()}>
              <Icon name="share" size={16} />
              <span>{t('share')}</span>
            </button>
          )}
          <button type="button" class="btn ghost" onClick={() => setLang(lang.value === 'zh' ? 'en' : 'zh')}>
            <Icon name="globe" size={16} />
            <span>{t('language')}</span>
          </button>
        </div>
      </header>

      {has ? (
        <main class="workspace">
          <FrameRail onAdd={pickImages} />
          <section class="stage" aria-label="preview">
            <Preview />
          </section>
          <Inspector />
        </main>
      ) : (
        <main class="welcome">
          <div class="dropzone">
            <div class="welcome-art" aria-hidden="true">
              <span class="art-full" />
              <span class="art-strip" />
              <span class="art-strip" />
              <span class="art-strip" />
            </div>
            <h2>{t('emptyTitle')}</h2>
            <p>{t('emptyBody')}</p>
            <div class="row center">
              <button type="button" class="btn primary large" onClick={pickImages}>
                <Icon name="image" size={18} />
                {t('emptyPick')}
              </button>
              <button type="button" class="btn large" disabled={busy.value > 0} onClick={async () => void addBlobs(await makeDemoFrames())}>
                {t('emptyDemo')}
              </button>
            </div>
            <p class="hint">{t('emptyPaste')}</p>
            <p class="privacy">{t('privacy')}</p>
          </div>
        </main>
      )}

      <input ref={imageInput} type="file" accept="image/*,video/*" multiple hidden onChange={onPicked} />
      <input ref={videoInput} type="file" accept="video/*" hidden onChange={onPicked} />
      {dropping && (
        <div class="drop-veil">
          <div>{t('dropHere')}</div>
        </div>
      )}
      {m?.kind === 'crop' && <CropModal key={m.id} id={m.id} />}
      {m?.kind === 'video' && <VideoModal file={m.file} stream={m.stream} />}
      <Toasts />
    </div>
  );
}
