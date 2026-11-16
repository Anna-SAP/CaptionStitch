import { useEffect, useMemo, useState } from 'preact/hooks';
import { EMOJI_DATA, EMOJI_GROUPS } from '../data/emoji';
import { lang, t } from '../i18n';
import { addSticker, picker } from '../state';
import { Icon } from './icons';
import { insertIntoField, revealActiveSticker, stickerSpot } from './place';

interface Entry {
  group: number;
  emoji: string;
  zh: string;
  en: string;
  /** Lower-case keywords in both languages, for searching. */
  words: string;
}

let parsed: Entry[] | null = null;
function entries(): Entry[] {
  parsed ??= EMOJI_DATA.split('\n').map((line) => {
    const [group, emoji, zh, en] = line.split('\t');
    return { group: Number(group), emoji, zh, en, words: `${zh} ${en}` };
  });
  return parsed;
}

const RECENT_KEY = 'captionstitch.emoji';
const RECENT = -1;
function loadRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, 32) : [];
  } catch {
    return [];
  }
}

/**
 * Emoji browser with search and categories. It opens inside the settings panel, right under the
 * control that asked for it, and feeds that text field or the sticker layer.
 */
export function EmojiPicker() {
  const target = picker.value;
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(loadRecent);
  const [group, setGroup] = useState<number>(() => (loadRecent().length ? RECENT : 0));
  const zh = lang.value === 'zh';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (picker.value = null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const all = entries();
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return all.filter((e) => e.words.includes(q) || e.emoji === q).slice(0, 400);
    if (group === RECENT) {
      const byEmoji = new Map(all.map((e) => [e.emoji, e]));
      return recent.map((r) => byEmoji.get(r)).filter((e): e is Entry => !!e);
    }
    return all.filter((e) => e.group === group);
  }, [query, group, recent]);

  if (!target) return null;

  const pick = (emoji: string) => {
    if (target === 'sticker') {
      addSticker({ kind: 'emoji', emoji, aspect: 1 }, stickerSpot());
      revealActiveSticker();
    } else insertIntoField(target, emoji);
    const next = [emoji, ...recent.filter((r) => r !== emoji)].slice(0, 32);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div class="emoji-panel" role="dialog" aria-label={t('emojiTitle')}>
      <div class="emoji-filters">
        <input
          type="search"
          value={query}
          placeholder={`${t('emojiSearch')} (${list.length})`}
          aria-label={t('emojiSearch')}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        <select
          value={String(group)}
          aria-label={t('emojiTitle')}
          onChange={(e) => {
            setGroup(Number((e.target as HTMLSelectElement).value));
            setQuery('');
          }}
        >
          {recent.length > 0 && <option value={String(RECENT)}>{t('emojiRecent')}</option>}
          {EMOJI_GROUPS.map((g) => (
            <option value={String(g.id)}>{zh ? g.zh : g.en}</option>
          ))}
        </select>
        <button type="button" class="icon-btn" aria-label={t('close')} title={t('close')} onClick={() => (picker.value = null)}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div class="emoji-grid">
        {list.map((e) => (
          <button
            type="button"
            key={e.emoji}
            title={(zh ? e.zh : e.en).split(' ')[0]}
            // Keep the caret in the text field while picking.
            onPointerDown={(ev) => ev.preventDefault()}
            onClick={() => pick(e.emoji)}
          >
            {e.emoji}
          </button>
        ))}
        {list.length === 0 && <p class="hint">{t('emojiNone')}</p>}
      </div>
    </div>
  );
}
