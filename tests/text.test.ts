import { describe, expect, it } from 'vitest';
import { footerBlock, headerBlock, textColors, tokenize, wrapText, type Measure } from '../src/core/text';
import { DEFAULT_SETTINGS } from '../src/types';

// Every character is 10 units wide: easy to reason about.
const measure: Measure = (text) => [...text].length * 10;

describe('wrapText', () => {
  it('breaks CJK text between characters', () => {
    expect(wrapText('好台词值得被记住', 40, 'f', measure)).toEqual(['好台词值', '得被记住']);
  });

  it('breaks Latin text between words', () => {
    expect(wrapText('a good line stays', 90, 'f', measure)).toEqual(['a good', 'line', 'stays']);
  });

  it('never starts a line with closing punctuation', () => {
    const lines = wrapText('好台词值，得被记住。', 40, 'f', measure);
    for (const line of lines) expect(line).not.toMatch(/^[，。]/);
  });

  it('keeps explicit line breaks and splits over-long words', () => {
    expect(wrapText('一\n二', 100, 'f', measure)).toEqual(['一', '二']);
    expect(wrapText('abcdefghij', 40, 'f', measure)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('tokenizes mixed text', () => {
    expect(tokenize('看 the 电影')).toEqual(['看', ' ', 'the ', '电', '影']);
  });
});

describe('text blocks', () => {
  it('are empty without text', () => {
    expect(headerBlock(DEFAULT_SETTINGS, 1080, 1, 0, measure).height).toBe(0);
    expect(footerBlock(DEFAULT_SETTINGS, 1080, 1, 0, measure).height).toBe(0);
  });

  it('place the note above or below as chosen', () => {
    const s = { ...DEFAULT_SETTINGS, title: '片名', note: '想法', credit: '@me' };
    expect(headerBlock(s, 1080, 1, 0, measure).lines.map((l) => l.text)).toEqual(['片名']);
    expect(footerBlock(s, 1080, 1, 0, measure).lines.map((l) => l.text)).toEqual(['想法', '@me']);
    const top = { ...s, notePos: 'top' as const };
    expect(headerBlock(top, 1080, 1, 0, measure).lines.map((l) => l.text)).toEqual(['片名', '想法']);
    expect(footerBlock(top, 1080, 1, 0, measure).lines.map((l) => l.text)).toEqual(['@me']);
  });

  it('scale with the output width', () => {
    const s = { ...DEFAULT_SETTINGS, title: '片名' };
    const a = headerBlock(s, 1080, 1, 0, measure);
    const b = headerBlock(s, 2160, 2, 0, measure);
    expect(Math.abs(b.height - a.height * 2)).toBeLessThanOrEqual(2);
  });
});

describe('textColors', () => {
  it('picks light text on dark backgrounds and dark text on light ones', () => {
    expect(textColors('#111111').fg).toBe('#f5f3ee');
    expect(textColors('#ffffff').fg).toBe('#191919');
  });
});
