import { Code2, Copy, FileText, Link2, Star, Check } from 'lucide-react';
import type { Category, Clip } from '../lib/types';
import { clipTitle, relativeTime } from '../lib/utils';
export const kindIcons = { text: FileText, code: Code2, link: Link2 };
export function ClipCard({
  clip,
  category,
  selected,
  selecting,
  copied,
  onOpen,
  onCopy,
  onFavorite,
  onSelect,
}: {
  clip: Clip;
  category?: Category;
  selected: boolean;
  selecting: boolean;
  copied: boolean;
  onOpen: () => void;
  onCopy: () => void;
  onFavorite: () => void;
  onSelect: () => void;
}) {
  const Icon = kindIcons[clip.kind] || FileText;
  return (
    <article className={`clip-card ${selected ? 'selected' : ''} kind-${clip.kind}`}>
      <div className="card-top">
        <span className={`type-icon ${clip.kind}`}>
          <Icon size={17} />
        </span>
        <span className="type-name">
          {clip.kind === 'link' ? 'Link' : clip.kind === 'code' ? 'Code snippet' : 'Text'}
        </span>
        <div className="card-top-actions">
          {selecting && (
            <input
              type="checkbox"
              aria-label={`Select ${clipTitle(clip)}`}
              checked={selected}
              onChange={onSelect}
            />
          )}
          <button
            className={`icon-button favorite ${clip.favorite ? 'active' : ''}`}
            title={clip.favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-label={`${clip.favorite ? 'Unfavorite' : 'Favorite'} ${clipTitle(clip)}`}
            aria-pressed={clip.favorite}
            onClick={onFavorite}
          >
            <Star size={16} fill={clip.favorite ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
      <button className="card-open" onClick={onOpen} aria-label={`Open ${clipTitle(clip)}`}>
        <h3>{clipTitle(clip)}</h3>
        <div className={`card-content ${clip.kind === 'code' ? 'monospace' : ''}`}>
          {clip.content.slice(0, 700)}
        </div>
      </button>
      <div className="card-bottom">
        <div className="card-meta">
          {category && (
            <span className={`category-label ${category.color}`}>
              <i />
              {category.name}
            </span>
          )}
          <time
            dateTime={new Date(clip.updatedAt).toISOString()}
            title={new Date(clip.updatedAt).toLocaleString()}
          >
            {relativeTime(clip.updatedAt)}
          </time>
        </div>
        <button
          className={`icon-button copy-button ${copied ? 'copied' : ''}`}
          aria-label={`Copy ${clipTitle(clip)}`}
          title="Copy to clipboard"
          onClick={onCopy}
        >
          {copied ? <Check size={17} /> : <Copy size={17} />}
        </button>
      </div>
    </article>
  );
}
