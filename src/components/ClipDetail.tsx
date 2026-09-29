import { useState } from 'react';
import { Copy, Star, Trash2, Check } from 'lucide-react';
import type { Category, Clip } from '../lib/types';
import { characterCount, formatBytes } from '../lib/utils';
import { Dialog } from './Dialog';
export function ClipDetail({
  clip,
  categories,
  onClose,
  onSave,
  onCopy,
  onDelete,
  copied,
}: {
  clip: Clip;
  categories: Category[];
  onClose: () => void;
  onSave: (patch: Partial<Clip>) => Promise<boolean>;
  onCopy: () => void;
  onDelete: () => void;
  copied: boolean;
}) {
  const [title, setTitle] = useState(clip.title);
  const [category, setCategory] = useState(clip.categoryId || '');
  const [favorite, setFavorite] = useState(clip.favorite);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    if (await onSave({ title, categoryId: category || null, favorite })) onClose();
    setBusy(false);
  }
  return (
    <Dialog title="Clip details" onClose={onClose} wide>
      <div className="detail-body">
        <label className="field">
          Title
          <input
            autoFocus
            value={title}
            maxLength={120}
            placeholder="Give this clip a name"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="detail-meta">
          <span>{characterCount(clip.content).toLocaleString()} characters</span>
          <span>{formatBytes(new TextEncoder().encode(clip.content).length)}</span>
          <span>Copied {clip.copyCount} times</span>
        </div>
        <pre className={`detail-content ${clip.kind === 'code' ? 'code-content' : ''}`}>
          {clip.content}
        </pre>
        <div className="detail-controls">
          <label className="field">
            Category
            <select
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className={`button ${favorite ? 'favorited' : ''}`}
            onClick={() => setFavorite(!favorite)}
            aria-pressed={favorite}
          >
            <Star size={16} fill={favorite ? 'currentColor' : 'none'} />
            {favorite ? 'Favorited' : 'Favorite'}
          </button>
        </div>
        <p className="muted detail-date">
          First captured {new Date(clip.createdAt).toLocaleString()}
          <br />
          Last captured {new Date(clip.updatedAt).toLocaleString()}
        </p>
      </div>
      <div className="dialog-footer">
        <button className="button danger-quiet" onClick={onDelete}>
          <Trash2 size={16} />
          Delete
        </button>
        <div className="button-group">
          <button className="button" onClick={onCopy}>
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy text'}
          </button>
          <button className="button primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
