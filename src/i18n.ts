import { signal } from '@preact/signals';

export type Lang = 'zh' | 'en';

const zh = {
  tagline: '把截图和字幕拼成一张好分享的图',
  addShots: '添加截图',
  fromVideo: '视频取帧',
  record: '录屏取帧',
  copy: '复制图片',
  copied: '已复制，去粘贴吧',
  copyHint: '复制为 PNG，可直接粘贴到聊天或发帖框 (Ctrl/⌘+C)',
  download: '下载',
  downloadHint: '按导出设置保存文件 (Ctrl/⌘+S)',
  share: '分享',
  shareHint: '调用系统分享面板',
  saved: '已保存',
  working: '处理中…',

  emptyTitle: '拖入、粘贴或选择视频截图',
  emptyBody: '第一张保留完整画面，其余只保留字幕条。字幕位置和黑边会自动识别。',
  emptyPaste: '截图后直接按 Ctrl/⌘+V 即可',
  emptyPick: '选择截图',
  emptyDemo: '用示例试试',
  dropHere: '松开以添加',
  privacy: '所有处理都在本机浏览器内完成，图片不会上传。',

  frames: '截图',
  clearAll: '清空',
  cleared: '已清空',
  removed: '已删除 1 张',
  undo: '撤销',
  restored: '已恢复上次的内容',
  moveUp: '上移',
  moveDown: '下移',
  showFull: '显示完整画面',
  showStrip: '只留字幕条',
  cropThis: '裁剪',
  resetBand: '恢复统一字幕带',
  remove: '删除',
  fullTag: '全',
  stripTag: '条',
  dragTop: '拖动调整这一条的上沿',
  dragBottom: '拖动调整这一条的下沿',
  bandGuide: '字幕带',
  dragGuide: '拖动调整所有字幕条',

  layout: '版式',
  layoutCaptions: '字幕拼接',
  layoutStack: '长图',
  layoutGrid: '网格',
  columns: '列数',

  band: '字幕带',
  bandHeight: '高度',
  bandOffset: '距底部',
  bandAuto: '自动识别',
  bandAutoOn: '自动识别中',
  bandManual: '手动设置',
  bandTip: '也可以在预览里直接拖动首图上的两条虚线；拖动某一条的边缘只调整那一条。',
  bandNotFound: '没有识别到字幕，请手动调整',
  bandFound: '已识别字幕位置',

  trim: '画面',
  autoTrim: '自动去除黑边',
  cropAll: '手动裁剪…',
  guides: '显示字幕带参考线',

  text: '文字',
  title: '标题',
  titlePh: '片名 · 第几集',
  note: '想法',
  notePh: '写下这段台词带给你的收获…',
  credit: '署名',
  creditPh: '@你的名字',
  notePos: '想法位置',
  posTop: '图上方',
  posBottom: '图下方',
  font: '字体',
  fontSans: '黑体',
  fontSerif: '宋体',
  copyText: '复制文字',
  textCopied: '文字已复制',

  style: '样式',
  gap: '间距',
  padding: '边距',
  radius: '圆角',
  background: '背景',

  export: '导出',
  width: '宽度',
  widthSource: '原始',
  widthCustom: '自定义',
  format: '格式',
  quality: '质量',
  maxSize: '大小上限',
  noLimit: '不限',
  estimating: '计算中…',
  adjusted: '已自动压缩到上限以内',
  reduced: '图片过长，已自动缩小以适应浏览器限制',

  zoomFit: '适应',
  zoomActual: '100%',

  cropTitle: '裁剪画面',
  cropAuto: '自动识别黑边',
  cropReset: '整幅',
  cropApplyAll: '应用到所有同尺寸截图',
  cancel: '取消',
  apply: '应用',
  prev: '上一张',
  next: '下一张',

  videoTitle: '从视频取帧',
  liveTitle: '录屏取帧',
  liveTip: '正在录制所选窗口。可以随时截取当前画面，或停止后回看录像逐帧挑选。',
  capture: '截取当前帧',
  captured: '已截取',
  stopReview: '停止并回看',
  play: '播放',
  pause: '暂停',
  back1s: '后退 1 秒',
  fwd1s: '前进 1 秒',
  back1f: '上一帧',
  fwd1f: '下一帧',
  autoExtract: '自动提取字幕帧',
  autoExtractTip: '从当前位置播放到结尾，字幕每换一句自动截一张',
  stop: '停止',
  scanning: '正在扫描…',
  extracted: '自动提取了 {n} 帧',
  extractedNone: '没有识别到字幕变化',
  videoKeys: '空格 播放/暂停 · ←/→ 1 秒 · ,/. 逐帧 · Enter 截取',
  done: '完成',
  videoError: '这个视频无法播放，换一种格式试试（推荐 MP4 / WebM）',
  recordUnsupported: '当前浏览器不支持录屏',
  recordDenied: '没有获得录屏权限',

  importFailed: '有 {n} 个文件无法读取',
  copyFailed: '复制失败：浏览器不允许写入剪贴板，请改用下载',
  shareFailed: '分享未完成',
  language: 'English',
};

const en: typeof zh = {
  tagline: 'Stitch screenshots and subtitles into one shareable image',
  addShots: 'Add screenshots',
  fromVideo: 'Grab from video',
  record: 'Record screen',
  copy: 'Copy image',
  copied: 'Copied — ready to paste',
  copyHint: 'Copy as PNG, ready to paste into a chat or post (Ctrl/⌘+C)',
  download: 'Download',
  downloadHint: 'Save a file with the export settings (Ctrl/⌘+S)',
  share: 'Share',
  shareHint: 'Open the system share sheet',
  saved: 'Saved',
  working: 'Working…',

  emptyTitle: 'Drop, paste or choose video screenshots',
  emptyBody: 'The first one stays whole; the rest keep only their subtitle strip. Subtitle position and black bars are detected for you.',
  emptyPaste: 'After taking a screenshot, just press Ctrl/⌘+V',
  emptyPick: 'Choose screenshots',
  emptyDemo: 'Try a sample',
  dropHere: 'Drop to add',
  privacy: 'Everything runs in your browser. Images are never uploaded.',

  frames: 'Frames',
  clearAll: 'Clear',
  cleared: 'Cleared',
  removed: 'Removed 1 frame',
  undo: 'Undo',
  restored: 'Restored your last session',
  moveUp: 'Move up',
  moveDown: 'Move down',
  showFull: 'Show whole frame',
  showStrip: 'Subtitle strip only',
  cropThis: 'Crop',
  resetBand: 'Use the shared subtitle band',
  remove: 'Remove',
  fullTag: 'Full',
  stripTag: 'Strip',
  dragTop: 'Drag to adjust the top of this strip',
  dragBottom: 'Drag to adjust the bottom of this strip',
  bandGuide: 'Subtitle band',
  dragGuide: 'Drag to adjust every strip',

  layout: 'Layout',
  layoutCaptions: 'Subtitles',
  layoutStack: 'Stack',
  layoutGrid: 'Grid',
  columns: 'Columns',

  band: 'Subtitle band',
  bandHeight: 'Height',
  bandOffset: 'From bottom',
  bandAuto: 'Detect',
  bandAutoOn: 'Auto-detected',
  bandManual: 'Set by hand',
  bandTip: 'You can also drag the two dashed lines on the first frame in the preview; dragging the edge of one strip adjusts only that strip.',
  bandNotFound: 'No subtitles found — adjust by hand',
  bandFound: 'Subtitle position detected',

  trim: 'Picture',
  autoTrim: 'Remove black bars automatically',
  cropAll: 'Crop by hand…',
  guides: 'Show subtitle band guides',

  text: 'Text',
  title: 'Title',
  titlePh: 'Show · episode',
  note: 'Thoughts',
  notePh: 'What did this scene leave you with?',
  credit: 'Credit',
  creditPh: '@yourname',
  notePos: 'Thoughts go',
  posTop: 'Above',
  posBottom: 'Below',
  font: 'Typeface',
  fontSans: 'Sans',
  fontSerif: 'Serif',
  copyText: 'Copy text',
  textCopied: 'Text copied',

  style: 'Style',
  gap: 'Gap',
  padding: 'Padding',
  radius: 'Corners',
  background: 'Background',

  export: 'Export',
  width: 'Width',
  widthSource: 'Source',
  widthCustom: 'Custom',
  format: 'Format',
  quality: 'Quality',
  maxSize: 'Size limit',
  noLimit: 'None',
  estimating: 'Measuring…',
  adjusted: 'Compressed to fit the size limit',
  reduced: 'Too tall for the browser — scaled down to fit',

  zoomFit: 'Fit',
  zoomActual: '100%',

  cropTitle: 'Crop picture',
  cropAuto: 'Detect black bars',
  cropReset: 'Whole image',
  cropApplyAll: 'Apply to all screenshots of this size',
  cancel: 'Cancel',
  apply: 'Apply',
  prev: 'Previous',
  next: 'Next',

  videoTitle: 'Grab frames from a video',
  liveTitle: 'Record screen',
  liveTip: 'Recording the window you picked. Grab the current picture at any time, or stop and step through the recording.',
  capture: 'Grab this frame',
  captured: 'Grabbed',
  stopReview: 'Stop and review',
  play: 'Play',
  pause: 'Pause',
  back1s: 'Back 1 s',
  fwd1s: 'Forward 1 s',
  back1f: 'Previous frame',
  fwd1f: 'Next frame',
  autoExtract: 'Auto-grab subtitle frames',
  autoExtractTip: 'Plays from here to the end and grabs one frame each time the subtitle changes',
  stop: 'Stop',
  scanning: 'Scanning…',
  extracted: 'Grabbed {n} frames automatically',
  extractedNone: 'No subtitle changes found',
  videoKeys: 'Space play/pause · ←/→ 1 s · ,/. frame step · Enter grab',
  done: 'Done',
  videoError: 'This video cannot be played. Try another format (MP4 or WebM work best).',
  recordUnsupported: 'Screen recording is not supported in this browser',
  recordDenied: 'Screen recording was not allowed',

  importFailed: '{n} file(s) could not be read',
  copyFailed: 'Copy failed: the browser blocked clipboard access. Use Download instead.',
  shareFailed: 'Sharing did not complete',
  language: '中文',
};

export type Key = keyof typeof zh;
const dict: Record<Lang, typeof zh> = { zh, en };

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('captionstitch.lang');
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export const lang = signal<Lang>(initialLang());

export function setLang(l: Lang) {
  lang.value = l;
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  try {
    localStorage.setItem('captionstitch.lang', l);
  } catch {
    /* storage unavailable */
  }
}

/** Translate a key; `{n}`-style placeholders are filled from `vars`. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = dict[lang.value][key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
