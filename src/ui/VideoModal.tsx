import { useEffect, useRef, useState } from 'preact/hooks';
import { signatureDistance, subtitleSignature } from '../core/detect';
import { toBlob } from '../core/export';
import { t } from '../i18n';
import { addBlobs, fail, modal, toast, type Incoming } from '../state';
import { Icon } from './icons';

const FRAME = 1 / 30;
/** Fingerprints closer than this are the same subtitle line. */
const SAME_LINE = 0.4;

function clock(sec: number): string {
  if (!isFinite(sec)) return '0:00.0';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function snapshot(v: HTMLVideoElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
  return c;
}

/**
 * Pick frames from a video file, or from a live screen recording.
 * A recording is kept in memory; after stopping it can be stepped through like any video.
 */
export function VideoModal({ file, stream }: { file?: Blob; stream?: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const liveStream = useRef<MediaStream | null>(stream ?? null);
  const startedAt = useRef(0);
  const scanStop = useRef<(() => void) | null>(null);
  const [live, setLive] = useState(!!stream);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(0);
  const [scanning, setScanning] = useState<number | null>(null);

  const close = () => (modal.value = null);

  const stopLive = () => {
    const rec = recorder.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  };

  // Source setup and teardown.
  useEffect(() => {
    const v = videoRef.current!;
    let url: string | null = null;
    if (stream) {
      v.srcObject = stream;
      v.muted = true;
      void v.play().catch(() => {});
      const chunks: Blob[] = [];
      try {
        const rec = new MediaRecorder(stream);
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.onstop = () => {
          stream.getTracks().forEach((tr) => tr.stop());
          liveStream.current = null;
          v.srcObject = null;
          const recorded = new Blob(chunks, { type: rec.mimeType || 'video/webm' });
          setDuration((Date.now() - startedAt.current) / 1000);
          url = URL.createObjectURL(recorded);
          setSrc(url);
          setLive(false);
        };
        rec.start(1000);
        startedAt.current = Date.now();
        recorder.current = rec;
        stream.getVideoTracks()[0]?.addEventListener('ended', stopLive);
      } catch {
        fail('recordUnsupported');
      }
    } else if (file) {
      url = URL.createObjectURL(file);
      setSrc(url);
    }
    return () => {
      scanStop.current?.();
      const rec = recorder.current;
      if (rec && rec.state !== 'inactive') {
        rec.onstop = null;
        rec.stop();
      }
      liveStream.current?.getTracks().forEach((tr) => tr.stop());
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  // Live timer.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setTime((Date.now() - startedAt.current) / 1000), 200);
    return () => clearInterval(id);
  }, [live]);

  const onMeta = () => {
    const v = videoRef.current!;
    if (isFinite(v.duration)) {
      setDuration(v.duration);
      return;
    }
    // Recordings made in the browser carry no duration; seeking far ahead makes the browser work it out.
    const fix = () => {
      if (!isFinite(v.duration)) return;
      v.removeEventListener('durationchange', fix);
      setDuration(v.duration);
      v.currentTime = 0;
    };
    v.addEventListener('durationchange', fix);
    v.currentTime = 1e7;
  };

  const seek = (to: number) => {
    const v = videoRef.current!;
    if (live) return;
    v.pause();
    v.currentTime = Math.min(Math.max(0, to), duration || v.duration || 0);
  };
  const toggle = () => {
    const v = videoRef.current!;
    if (live) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const capture = async () => {
    const v = videoRef.current!;
    if (!v.videoWidth) return;
    const c = snapshot(v);
    setFlash((n) => n + 1);
    const at = live ? (Date.now() - startedAt.current) / 1000 : v.currentTime;
    const blob = await toBlob(c, 'image/jpeg', 0.95);
    const added = await addBlobs([{ blob, name: `frame-${clock(at).replace(':', 'm')}s.jpg` }]);
    setCount((n) => n + added);
  };

  /** Play through the rest of the video and grab one frame each time the subtitle line changes. */
  const autoExtract = async () => {
    const v = videoRef.current!;
    if (live || !v.videoWidth) return;
    const aw = Math.min(640, v.videoWidth);
    const ah = Math.round((v.videoHeight / v.videoWidth) * aw);
    const probe = document.createElement('canvas');
    probe.width = aw;
    probe.height = ah;
    const pctx = probe.getContext('2d', { willReadFrequently: true })!;
    const jobs: Promise<Incoming>[] = [];
    let current: Float32Array | null = null;
    let stable = 0;
    let taken = false;
    let lastTaken: Float32Array | null = null;
    let lastT = -1;
    let stopped = false;

    const inspect = () => {
      if (Math.abs(v.currentTime - lastT) < 0.1) return;
      lastT = v.currentTime;
      pctx.drawImage(v, 0, 0, aw, ah);
      const sig = subtitleSignature(pctx.getImageData(0, 0, aw, ah));
      if (!sig) {
        current = null;
        stable = 0;
        taken = false;
        return;
      }
      if (current && signatureDistance(sig, current) < SAME_LINE) stable++;
      else {
        current = sig;
        stable = 1;
        taken = false;
      }
      // Wait for a second matching sample so fades and flickers are not captured.
      if (stable >= 2 && !taken) {
        taken = true;
        if (lastTaken && signatureDistance(sig, lastTaken) < SAME_LINE) return;
        lastTaken = sig;
        const index = jobs.length;
        const name = `frame-${clock(v.currentTime).replace(':', 'm')}s.jpg`;
        jobs.push(toBlob(snapshot(v), 'image/jpeg', 0.95).then((blob) => ({ blob, name, time: index })));
        setScanning(jobs.length);
      }
    };

    const wasMuted = v.muted;
    v.muted = true;
    v.playbackRate = 2;
    setScanning(0);
    await new Promise<void>((resolve) => {
      const finish = () => {
        if (stopped) return;
        stopped = true;
        v.removeEventListener('ended', finish);
        clearInterval(timer);
        resolve();
      };
      scanStop.current = finish;
      v.addEventListener('ended', finish);
      const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback?.bind(v);
      const onFrame = () => {
        if (stopped) return;
        inspect();
        rvfc?.(onFrame);
      };
      rvfc?.(onFrame);
      // Fallback (and safety net) for browsers without per-frame callbacks.
      const timer = setInterval(() => {
        if (!rvfc) inspect();
        if (v.ended) finish();
      }, 60);
      void v.play().catch(finish);
    });
    scanStop.current = null;
    v.pause();
    v.playbackRate = 1;
    v.muted = wasMuted;
    setScanning(null);
    const found = await Promise.all(jobs);
    if (found.length === 0) {
      fail('extractedNone');
      return;
    }
    const added = await addBlobs(found);
    setCount((n) => n + added);
    toast(t('extracted', { n: added }));
  };

  // Keyboard: space, arrows, frame steps, capture.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      if (e.key === 'Escape') return close();
      if ((e.target as HTMLElement).tagName === 'INPUT' && e.key !== 'Enter') return;
      if (scanning !== null) return;
      const handled = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (e.key === ' ') handled(toggle);
      else if (e.key === 'Enter' || e.key === 's' || e.key === 'S') handled(() => void capture());
      else if (e.key === 'ArrowLeft') handled(() => seek(v.currentTime - 1));
      else if (e.key === 'ArrowRight') handled(() => seek(v.currentTime + 1));
      else if (e.key === ',') handled(() => seek(v.currentTime - FRAME));
      else if (e.key === '.') handled(() => seek(v.currentTime + FRAME));
    };
    // A focused button would also "click" on space/enter release; the shortcut already handled it.
    const onKeyUp = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && (e.target as HTMLElement).tagName === 'BUTTON') e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  });

  const busyScan = scanning !== null;
  const total = duration || 0;
  return (
    <div class="modal-backdrop">
      <div class="modal wide" role="dialog" aria-modal="true" aria-label={live ? t('liveTitle') : t('videoTitle')}>
        <header class="modal-head">
          <h2>{live ? t('liveTitle') : t('videoTitle')}</h2>
          {live && (
            <span class="rec">
              <i /> REC {clock(time)}
            </span>
          )}
          {count > 0 && (
            <span class="muted">
              {t('captured')} {count}
            </span>
          )}
          <button type="button" class="icon-btn" aria-label={t('done')} onClick={close}>
            <Icon name="close" />
          </button>
        </header>
        <div class="video-stage">
          <video
            ref={videoRef}
            src={src ?? undefined}
            playsInline
            preload="auto"
            onLoadedMetadata={onMeta}
            onTimeUpdate={(e) => !live && setTime((e.target as HTMLVideoElement).currentTime)}
            onSeeked={(e) => !live && setTime((e.target as HTMLVideoElement).currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => src && fail('videoError')}
            onClick={toggle}
          />
          {flash > 0 && <div key={flash} class="flash" />}
        </div>
        {live ? (
          <p class="hint center">{t('liveTip')}</p>
        ) : (
          <div class="scrub">
            <span class="time">{clock(time)}</span>
            <input
              type="range"
              min={0}
              max={total || 1}
              step={0.01}
              value={Math.min(time, total || 1)}
              disabled={busyScan}
              aria-label="timeline"
              onInput={(e) => seek(Number((e.target as HTMLInputElement).value))}
            />
            <span class="time">{clock(total)}</span>
          </div>
        )}
        <footer class="modal-foot">
          {live ? (
            <div class="row">
              <button type="button" class="btn" onClick={stopLive}>
                <Icon name="stop" size={16} />
                {t('stopReview')}
              </button>
            </div>
          ) : (
            <div class="row wrap">
              <button type="button" class="icon-btn" title={t('back1s')} aria-label={t('back1s')} disabled={busyScan} onClick={() => seek(time - 1)}>
                <Icon name="skipBack" />
              </button>
              <button type="button" class="icon-btn" title={t('back1f')} aria-label={t('back1f')} disabled={busyScan} onClick={() => seek(time - FRAME)}>
                <Icon name="stepBack" />
              </button>
              <button type="button" class="icon-btn" title={playing ? t('pause') : t('play')} aria-label={playing ? t('pause') : t('play')} disabled={busyScan} onClick={toggle}>
                <Icon name={playing ? 'pause' : 'play'} />
              </button>
              <button type="button" class="icon-btn" title={t('fwd1f')} aria-label={t('fwd1f')} disabled={busyScan} onClick={() => seek(time + FRAME)}>
                <Icon name="stepFwd" />
              </button>
              <button type="button" class="icon-btn" title={t('fwd1s')} aria-label={t('fwd1s')} disabled={busyScan} onClick={() => seek(time + 1)}>
                <Icon name="skipFwd" />
              </button>
              {busyScan ? (
                <button type="button" class="btn" onClick={() => scanStop.current?.()}>
                  <Icon name="stop" size={16} />
                  {t('stop')} · {t('scanning')} {scanning}
                </button>
              ) : (
                <button type="button" class="btn" title={t('autoExtractTip')} onClick={() => void autoExtract()}>
                  <Icon name="wand" size={16} />
                  {t('autoExtract')}
                </button>
              )}
            </div>
          )}
          <div class="row">
            <button type="button" class="btn primary" disabled={busyScan} onClick={() => void capture()}>
              <Icon name="camera" size={16} />
              {t('capture')}
            </button>
            <button type="button" class="btn" onClick={close}>
              {t('done')}
            </button>
          </div>
        </footer>
        {!live && <p class="hint center keys">{t('videoKeys')}</p>}
      </div>
    </div>
  );
}
