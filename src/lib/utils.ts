import type { Clip, Kind, View } from './types';
export function selectClips(
  clips: Clip[],
  view: View,
  query: string,
  kind: Kind | 'all',
  order: string,
): Clip[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return clips
    .filter(
      (c) =>
        (view !== 'favorites' || c.favorite) &&
        (view !== 'uncategorized' || !c.categoryId) &&
        (!view.startsWith('category:') || c.categoryId === view.slice(9)) &&
        (kind === 'all' || c.kind === kind) &&
        words.every((word) => `${c.title}\n${c.content}`.toLocaleLowerCase().includes(word)),
    )
    .sort((a, b) =>
      order === 'oldest'
        ? a.updatedAt - b.updatedAt
        : order === 'copied'
          ? b.copyCount - a.copyCount || b.updatedAt - a.updatedAt
          : b.updatedAt - a.updatedAt,
    );
}
export function clipTitle(clip: Clip) {
  return clip.title || clip.content.trim().split('\n')[0].slice(0, 90) || 'Untitled clip';
}
export function relativeTime(timestamp: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function characterCount(content: string) {
  return Array.from(content).length;
}
export function formatBytes(bytes: number) {
  return bytes < 1000
    ? `${bytes} B`
    : bytes < 1000000
      ? `${(bytes / 1000).toFixed(1)} KB`
      : `${(bytes / 1000000).toFixed(1)} MB`;
}
