import { describe, expect, it } from 'vitest';
import { selectClips, characterCount, relativeTime } from './utils';
import type { Clip } from './types';
const clip = (id: string, patch: Partial<Clip> = {}): Clip => ({
  id,
  content: 'Some content',
  kind: 'text',
  title: '',
  favorite: false,
  categoryId: null,
  createdAt: 10,
  updatedAt: 10,
  copyCount: 0,
  ...patch,
});
const data = [
  clip('a', { title: 'Client notes', content: 'Review the green design', categoryId: 'work' }),
  clip('b', { content: 'const green = true', kind: 'code', favorite: true, updatedAt: 30 }),
  clip('c', { content: 'https://example.com', kind: 'link', updatedAt: 20, copyCount: 4 }),
];
describe('clipboard search', () => {
  it('matches all words across title and content without case sensitivity', () =>
    expect(selectClips(data, 'all', 'CLIENT green', 'all', 'recent').map((c) => c.id)).toEqual([
      'a',
    ]));
  it('combines category, query and type filters', () =>
    expect(selectClips(data, 'category:work', 'review', 'code', 'recent')).toEqual([]));
  it('favorites and uncategorized views stay independent', () => {
    expect(selectClips(data, 'favorites', '', 'all', 'recent').map((c) => c.id)).toEqual(['b']);
    expect(selectClips(data, 'uncategorized', '', 'all', 'recent').length).toBe(2);
  });
  it('sorts by recency, age and copy count without mutating input', () => {
    expect(selectClips(data, 'all', '', 'all', 'recent').map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(selectClips(data, 'all', '', 'all', 'oldest')[0].id).toBe('a');
    expect(selectClips(data, 'all', '', 'all', 'copied')[0].id).toBe('c');
    expect(data[0].id).toBe('a');
  });
  it('handles whitespace queries', () =>
    expect(selectClips(data, 'all', '   ', 'all', 'recent').length).toBe(3));
});
describe('metadata', () => {
  it('counts unicode code points', () => expect(characterCount('a😀')).toBe(2));
  it('clamps clock skew and formats elapsed time', () => {
    expect(relativeTime(200, 100)).toBe('Just now');
    expect(relativeTime(0, 3600000)).toBe('1h ago');
  });
});
