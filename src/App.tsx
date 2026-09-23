import { createPortal } from 'react-dom';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowDownUp,
  ArrowRight,
  Check,
  CheckSquare,
  ChevronRight,
  Clipboard,
  Copy,
  Folder,
  HardDrive,
  Inbox,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
  AlertCircle,
  Keyboard,
} from 'lucide-react';
import { command, desktop } from './lib/api';
import { useWorkspace } from './lib/useWorkspace';
import { selectClips } from './lib/utils';
import type { Category, Clip, Color, Kind, Settings, View } from './lib/types';
import { ClipCard } from './components/ClipCard';
import { ClipDetail } from './components/ClipDetail';
import { Dialog } from './components/Dialog';
import { SettingsPanel } from './components/SettingsPanel';

type Confirmation = {
  title: string;
  description: string;
  label: string;
  danger?: boolean;
  run: () => Promise<boolean>;
};
export default function App() {
  const { data, error, refresh } = useWorkspace();
  const [view, setView] = useState<View>('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [order, setOrder] = useState('recent');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [openId, setOpenId] = useState<string | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<Category | 'new' | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; error: boolean; id: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(60);
  const [help, setHelp] = useState(false);
  const [clearAll, setClearAll] = useState(false);
  const [showClear, setShowClear] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const report = useCallback(
    (message: string, error = false) => setToast({ message, error, id: Date.now() }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(id);
  }, [copied]);
  const act = useCallback(
    async (name: string, args?: Record<string, unknown>, message?: string) => {
      if (busy.current) return false;
      busy.current = true;
      try {
        await command(name, args);
        await refresh();
        if (message) report(message);
        return true;
      } catch (e) {
        report(String(e), true);
        return false;
      } finally {
        busy.current = false;
      }
    },
    [refresh, report],
  );
  const saveSettings = useCallback(
    (settings: Settings) => act('save_settings', { settings }),
    [act],
  );
  const pause = useCallback(() => {
    if (data) void saveSettings({ ...data.settings, paused: !data.settings.paused });
  }, [data, saveSettings]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = data?.settings.theme || 'system';
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [data?.settings.theme]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (view === 'settings') setView('all');
        setTimeout(() => search.current?.focus(), 0);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        pause();
      }
      if (e.key === 'Escape') {
        setSelecting(false);
        setSelected(new Set());
        setQuery('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pause, view]);
  useEffect(() => {
    setLimit(60);
    setSelected(new Set());
    setSelecting(false);
  }, [view, deferredQuery, kind, order]);
  useEffect(() => {
    if (data) {
      const ids = new Set(data.clips.map((c) => c.id));
      setSelected((old) => new Set([...old].filter((id) => ids.has(id))));
      if (openId && !ids.has(openId)) setOpenId(null);
    }
  }, [data, openId]);
  const filtered = useMemo(
    () => selectClips(data?.clips || [], view, deferredQuery, kind, order),
    [data?.clips, view, deferredQuery, kind, order],
  );
  const categoryMap = useMemo(
    () => new Map(data?.categories.map((c) => [c.id, c])),
    [data?.categories],
  );
  const currentCategory = view.startsWith('category:') ? categoryMap.get(view.slice(9)) : undefined;
  const openClip = data?.clips.find((c) => c.id === openId);
  function go(next: View) {
    setView(next);
    setQuery('');
    setKind('all');
  }
  async function copy(clip: Clip) {
    if (await act('copy_clip', { id: clip.id })) {
      setCopied(clip.id);
      report('Copied to clipboard');
    }
  }
  function update(clip: Clip, patch: Partial<Clip>) {
    return act('update_clip', {
      id: clip.id,
      favorite: clip.favorite,
      categoryId: clip.categoryId,
      title: clip.title,
      ...patch,
    });
  }
  function deleteClips(ids: string[]) {
    setOpenId(null);
    setConfirmation({
      title: ids.length === 1 ? 'Delete this clip?' : `Delete ${ids.length} clips?`,
      description:
        'This removes the selected text from ClipNest. It will not clear your system clipboard. This cannot be undone.',
      label: 'Delete',
      danger: true,
      run: () => act('delete_clips', { ids }, 'Clips deleted'),
    });
  }
  async function exportBackup() {
    setConfirmation({
      title: 'Export your history?',
      description:
        'The JSON file contains your clipboard text without encryption. Save it somewhere private.',
      label: 'Export backup',
      run: async () => {
        try {
          const saved = await command<boolean>('export_backup');
          if (saved) report('Backup exported');
          return true;
        } catch (e) {
          report(String(e), true);
          return false;
        }
      },
    });
  }
  async function importBackup() {
    setConfirmation({
      title: 'Merge a backup?',
      description:
        'Existing clips are kept. Duplicate text is skipped, and your current privacy filters, history limit, and retention rules apply. Files must be under 350 MB.',
      label: 'Choose backup',
      run: async () => {
        try {
          const count = await command<number | null>('import_backup');
          await refresh();
          if (count !== null) report(`${count} clips imported before retention rules`);
          return true;
        } catch (e) {
          report(String(e), true);
          return false;
        }
      },
    });
  }
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState<Color>('mint');
  function editCategory(c: Category | 'new') {
    setCategoryName(c === 'new' ? '' : c.name);
    setCategoryColor(c === 'new' ? 'mint' : c.color);
    setCategoryDialog(c);
  }
  if (!data)
    return (
      <div className="loading">
        <div className="brand-mark">
          <Clipboard />
        </div>
        <h1>ClipNest</h1>
        <p>{error || 'Opening your workspace…'}</p>
        {error && (
          <button className="button primary" onClick={() => void refresh()}>
            Try again
          </button>
        )}
      </div>
    );
  const title =
    view === 'settings'
      ? 'Your preferences'
      : view === 'favorites'
        ? 'The keepers'
        : view === 'uncategorized'
          ? 'Uncategorized'
          : currentCategory?.name || 'Your clipboard, collected.';
  const subtitle =
    view === 'settings'
      ? 'A little fine-tuning for the way you work.'
      : view === 'favorites'
        ? 'The useful things you wanted to hold on to.'
        : currentCategory
          ? 'Everything for this corner of your work.'
          : 'Good ideas, useful links, and everything in between.';
  const favoriteCount = data.clips.filter((c) => c.favorite).length;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => go('all')} aria-label="ClipNest home">
          <span className="brand-mark">
            <Clipboard size={22} />
          </span>
          <span>
            ClipNest<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation" className="nav-main">
          <button className={view === 'all' ? 'active' : ''} onClick={() => go('all')}>
            <Inbox size={18} />
            <span>All clips</span>
            <b>{data.clips.length}</b>
          </button>
          <button className={view === 'favorites' ? 'active' : ''} onClick={() => go('favorites')}>
            <Star size={18} />
            <span>Favorites</span>
            <b>{favoriteCount}</b>
          </button>
          <button
            className={view === 'uncategorized' ? 'active' : ''}
            onClick={() => go('uncategorized')}
          >
            <Archive size={18} />
            <span>Uncategorized</span>
          </button>
        </nav>
        <div className="category-heading">
          <span>CATEGORIES</span>
          <button
            className="icon-button"
            aria-label="New category"
            title="New category"
            onClick={() => editCategory('new')}
          >
            <Plus size={17} />
          </button>
        </div>
        <nav className="category-nav" aria-label="Categories">
          {data.categories.map((c) => (
            <div
              key={c.id}
              className={`category-nav-row ${view === `category:${c.id}` ? 'active' : ''}`}
            >
              <button onClick={() => go(`category:${c.id}`)}>
                <span className={`category-dot ${c.color}`} />
                <span>{c.name}</span>
                <small>{data.clips.filter((clip) => clip.categoryId === c.id).length}</small>
              </button>
              <button
                className="icon-button category-edit"
                aria-label={`Edit category ${c.name}`}
                onClick={() => editCategory(c)}
              >
                <MoreHorizontal size={15} />
              </button>
            </div>
          ))}
          {data.categories.length === 0 && (
            <p className="empty-categories">
              A little order goes a long way.
              <button onClick={() => editCategory('new')}>
                Create a category <Plus size={13} />
              </button>
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="local-icon">
              <ShieldCheck size={20} />
            </span>
            <strong>A little more private.</strong>
            <p>
              Your clips stay on this device.
              <br />
              No account. No cloud.
            </p>
            <span>
              <i />
              Local storage
            </span>
          </div>
          <button
            className={`settings-nav ${view === 'settings' ? 'active' : ''}`}
            onClick={() => go('settings')}
          >
            <Settings2 size={18} />
            Settings<span>⌘</span>
          </button>
          <div className="profile">
            <span className="avatar">N</span>
            <div>
              <strong>My workspace</strong>
              <small>Personal & private</small>
            </div>
            <HardDrive size={15} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {view === 'settings'
                ? 'Settings'
                : view === 'favorites'
                  ? 'Favorites'
                  : currentCategory?.name || 'Clipboard'}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className={`capture-badge ${data.settings.paused ? 'paused' : ''}`}>
              <i />
              {desktop
                ? data.settings.paused
                  ? 'Capture paused'
                  : 'Capture active'
                : 'Browser preview'}
            </span>
            <button
              className="icon-button"
              aria-label="Keyboard shortcuts"
              onClick={() => setHelp(true)}
            >
              <Keyboard size={18} />
            </button>
          </div>
        </header>
        {!desktop && (
          <div className="demo-banner">
            <MonitorIcon />
            <span>
              <strong>Preview workspace</strong> · Sample clips only. Changes reset when you reload.
              Install the desktop app for automatic capture.
            </span>
            <button onClick={() => void act('reset_demo', undefined, 'Preview reset')}>
              Reset
            </button>
          </div>
        )}
        {(error || data.captureError) && (
          <div className="error-banner" role="alert">
            <AlertCircle size={17} />
            <span>{error || data.captureError}</span>
            <button onClick={() => void refresh()}>Refresh</button>
          </div>
        )}
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === 'settings' ? 'MAKE IT YOURS' : 'A SMALL SPACE FOR USEFUL THINGS'}
              </div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            {view !== 'settings' && (
              <button
                className="button capture-toggle"
                onClick={pause}
                disabled={!data.settings.onboardingComplete}
              >
                {data.settings.paused ? <Play size={15} /> : <Pause size={15} />}{' '}
                {data.settings.paused ? 'Resume capture' : 'Pause capture'}
              </button>
            )}
          </div>
          {view === 'settings' ? (
            <SettingsPanel
              settings={data.settings}
              onSave={saveSettings}
              onClear={() => {
                setClearAll(false);
                setShowClear(true);
              }}
              onExport={() => void exportBackup()}
              onImport={() => void importBackup()}
            />
          ) : (
            <>
              <section className="workspace-summary" aria-label="Workspace overview">
                <div>
                  <span className="summary-icon">
                    <Copy size={19} />
                  </span>
                  <div>
                    <strong>{data.clips.length.toLocaleString()}</strong>
                    <span>saved clips</span>
                  </div>
                </div>
                <div>
                  <span className="summary-icon gold">
                    <Star size={19} />
                  </span>
                  <div>
                    <strong>{favoriteCount.toLocaleString()}</strong>
                    <span>favorites</span>
                  </div>
                </div>
                <div>
                  <span className="summary-icon purple">
                    <Folder size={19} />
                  </span>
                  <div>
                    <strong>{data.categories.length}</strong>
                    <span>categories</span>
                  </div>
                </div>
                <div className="summary-note">
                  <span className="mini-leaf">✳</span>
                  <span>
                    A clearer mind.
                    <br />
                    <strong>One less thing to remember.</strong>
                  </span>
                </div>
              </section>
              <div className="mobile-categories">
                <select
                  aria-label="Browse categories"
                  value={view.startsWith('category:') ? view : ''}
                  onChange={(e) => go(e.target.value ? (e.target.value as View) : 'all')}
                >
                  <option value="">Browse categories</option>
                  {data.categories.map((c) => (
                    <option key={c.id} value={`category:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {currentCategory && (
                  <button
                    className="icon-button"
                    aria-label="Edit current category"
                    onClick={() => editCategory(currentCategory)}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label="Create category"
                  onClick={() => editCategory('new')}
                >
                  <Plus size={18} />
                </button>
              </div>
              <div className="search-toolbar">
                <div className="search-box">
                  <Search size={19} />
                  <input
                    ref={search}
                    type="search"
                    aria-label="Search clips"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find that thing you copied…"
                  />
                  <kbd>Ctrl K</kbd>
                </div>
                <div className="layout-control">
                  <button
                    aria-label="Grid view"
                    aria-pressed={layout === 'grid'}
                    className={layout === 'grid' ? 'active' : ''}
                    onClick={() => setLayout('grid')}
                  >
                    <LayoutGrid size={18} />
                  </button>
                  <button
                    aria-label="List view"
                    aria-pressed={layout === 'list'}
                    className={layout === 'list' ? 'active' : ''}
                    onClick={() => setLayout('list')}
                  >
                    <List size={19} />
                  </button>
                </div>
              </div>
              <div className="filter-toolbar">
                <div className="filter-tabs" role="group" aria-label="Filter clip type">
                  {(['all', 'text', 'link', 'code'] as const).map((k) => (
                    <button
                      key={k}
                      aria-pressed={kind === k}
                      className={kind === k ? 'active' : ''}
                      onClick={() => setKind(k)}
                    >
                      {k === 'all'
                        ? 'All types'
                        : k === 'link'
                          ? 'Links'
                          : k === 'code'
                            ? 'Code'
                            : 'Text'}
                      {k === 'all' && <span>{filtered.length}</span>}
                    </button>
                  ))}
                </div>
                <div className="filter-right">
                  <button
                    className={`icon-button ${selecting ? 'active' : ''}`}
                    aria-label={selecting ? 'Cancel selection' : 'Select clips'}
                    aria-pressed={selecting}
                    onClick={() => {
                      setSelecting(!selecting);
                      setSelected(new Set());
                    }}
                  >
                    <CheckSquare size={17} />
                  </button>
                  <label className="sort-label">
                    <ArrowDownUp size={14} />
                    <select
                      aria-label="Sort clips"
                      value={order}
                      onChange={(e) => setOrder(e.target.value)}
                    >
                      <option value="recent">Most recent</option>
                      <option value="oldest">Oldest first</option>
                      <option value="copied">Most copied</option>
                    </select>
                  </label>
                </div>
              </div>
              {selecting && (
                <div className="selection-bar">
                  <label>
                    <input
                      type="checkbox"
                      aria-label="Select all matching clips"
                      checked={filtered.length > 0 && filtered.every((c) => selected.has(c.id))}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? new Set(filtered.map((c) => c.id)) : new Set(),
                        )
                      }
                    />{' '}
                    {selected.size} selected
                  </label>
                  <button
                    className="button danger-quiet"
                    disabled={!selected.size}
                    onClick={() => deleteClips([...selected])}
                  >
                    <Trash2 size={15} />
                    Delete selected
                  </button>
                </div>
              )}
              {filtered.length ? (
                <>
                  <div className="results-heading">
                    <span>
                      {query
                        ? 'SEARCH RESULTS'
                        : view === 'favorites'
                          ? 'SAVED FOR LATER'
                          : order === 'recent'
                            ? 'RECENTLY COLLECTED'
                            : 'YOUR COLLECTION'}
                    </span>
                    <span>
                      {filtered.length} {filtered.length === 1 ? 'clip' : 'clips'}
                    </span>
                  </div>
                  <div className={`clip-grid ${layout === 'list' ? 'list-view' : ''}`}>
                    {filtered.slice(0, limit).map((clip) => (
                      <ClipCard
                        key={clip.id}
                        clip={clip}
                        category={categoryMap.get(clip.categoryId || '')}
                        selected={selected.has(clip.id)}
                        selecting={selecting}
                        copied={copied === clip.id}
                        onOpen={() => setOpenId(clip.id)}
                        onCopy={() => void copy(clip)}
                        onFavorite={() => void update(clip, { favorite: !clip.favorite })}
                        onSelect={() =>
                          setSelected((old) => {
                            const next = new Set(old);
                            if (next.has(clip.id)) next.delete(clip.id);
                            else next.add(clip.id);
                            return next;
                          })
                        }
                      />
                    ))}
                  </div>
                  {filtered.length > limit && (
                    <button className="button load-more" onClick={() => setLimit(limit + 60)}>
                      Show more clips ({filtered.length - limit} remaining)
                    </button>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <span>
                    <Search size={32} />
                  </span>
                  <h2>
                    {query
                      ? 'Nothing here just yet.'
                      : view === 'favorites'
                        ? 'Keep the good stuff.'
                        : 'Room for your next idea.'}
                  </h2>
                  <p>
                    {query
                      ? 'Try a different word or change the type filter.'
                      : view === 'favorites'
                        ? 'Tap the star on a clip to save it here. Favorites stay until you delete them.'
                        : currentCategory
                          ? 'Assign clips to this category from their details.'
                          : 'Copy some text in another app after enabling capture. It will find a home here.'}
                  </p>
                  {(query || kind !== 'all') && (
                    <button
                      className="button"
                      onClick={() => {
                        setQuery('');
                        setKind('all');
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
              <div className="collection-footer">
                <ShieldCheck size={14} />
                <span>
                  {desktop
                    ? 'Stored on your device. Ready when you need it.'
                    : 'Sample workspace. Your system clipboard is not monitored.'}
                </span>
              </div>
            </>
          )}
        </main>
        <footer className="statusbar">
          <span>
            <i className={data.settings.paused ? 'status-paused' : ''} />
            {desktop
              ? data.settings.paused
                ? 'Monitoring paused'
                : 'Listening for text'
              : 'Interactive preview'}
          </span>
          <span>
            {desktop ? 'Ctrl + Shift + V to open' : 'ClipNest by Narayan Om'}
            <span className="status-divider">/</span> Local-first, always.
          </span>
        </footer>
      </div>
      {toast &&
        createPortal(
          <div
            className={`toast ${toast.error ? 'error' : ''}`}
            role={toast.error ? 'alert' : 'status'}
          >
            {toast.error ? <AlertCircle size={17} /> : <Check size={17} />}
            <span>{toast.message}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => setToast(null)}
            >
              <X size={15} />
            </button>
          </div>,
          document.querySelector('dialog[open]') || document.body,
        )}
      {!data.settings.onboardingComplete && (
        <Dialog title="A home for your clipboard." onClose={() => {}} dismissible={false}>
          <div className="welcome">
            <span className="welcome-icon">
              <Clipboard size={38} />
            </span>
            <p>
              Keep useful text, links, and code close at hand. ClipNest watches for new text you
              copy while it is running.
            </p>
            <ul>
              <li>
                <ShieldCheck size={19} />
                History stays on this device, unencrypted.
              </li>
              <li>
                <Pause size={19} />
                Pause anytime before copying confidential text.
              </li>
              <li>
                <Star size={19} />
                Save favorites and organize with categories.
              </li>
            </ul>
            <p className="notice">
              Sensitive-content filtering is enabled by default, but cannot identify every secret.
              Capture begins with the next clipboard change after activation.
            </p>
          </div>
          <div className="dialog-footer">
            <button
              className="button"
              onClick={() =>
                void saveSettings({ ...data.settings, onboardingComplete: true, paused: true })
              }
            >
              Keep capture paused
            </button>
            <button
              className="button primary"
              onClick={() =>
                void saveSettings({ ...data.settings, onboardingComplete: true, paused: false })
              }
            >
              Enable capture <ArrowRight size={16} />
            </button>
          </div>
        </Dialog>
      )}
      {openClip && (
        <ClipDetail
          key={openClip.id}
          clip={openClip}
          categories={data.categories}
          onClose={() => setOpenId(null)}
          onSave={(patch) => update(openClip, patch)}
          onCopy={() => void copy(openClip)}
          onDelete={() => deleteClips([openClip.id])}
          copied={copied === openClip.id}
        />
      )}
      {categoryDialog && (
        <Dialog
          title={categoryDialog === 'new' ? 'A new category' : 'Edit category'}
          onClose={() => setCategoryDialog(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                'save_category',
                {
                  id: categoryDialog === 'new' ? null : categoryDialog.id,
                  name: categoryName,
                  color: categoryColor,
                },
                'Category saved',
              ).then((ok) => {
                if (ok) setCategoryDialog(null);
              });
            }}
          >
            <div className="dialog-body">
              <label className="field">
                Category name
                <input
                  autoFocus
                  required
                  maxLength={40}
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="Something worth collecting"
                />
              </label>
              <fieldset className="color-picker">
                <legend>Choose a color</legend>
                {(['mint', 'blue', 'violet', 'amber', 'rose'] as Color[]).map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    aria-pressed={categoryColor === color}
                    className={`color-choice ${color}`}
                    onClick={() => setCategoryColor(color)}
                  >
                    {categoryColor === color && <Check size={18} />}
                  </button>
                ))}
              </fieldset>
            </div>
            <div className="dialog-footer">
              {categoryDialog !== 'new' ? (
                <button
                  type="button"
                  className="button danger-quiet"
                  onClick={() => {
                    const category = categoryDialog;
                    setCategoryDialog(null);
                    setConfirmation({
                      title: 'Delete category?',
                      description: 'Your clips will be kept and moved to Uncategorized.',
                      label: 'Delete category',
                      danger: true,
                      run: async () => {
                        const ok = await act(
                          'delete_category',
                          { id: category.id },
                          'Category deleted',
                        );
                        if (ok && view === `category:${category.id}`) go('all');
                        return ok;
                      },
                    });
                  }}
                >
                  Delete category
                </button>
              ) : (
                <span />
              )}
              <button className="button primary" type="submit">
                Save category
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {confirmation && (
        <Dialog
          title={confirmation.title}
          onClose={() => {
            if (!confirmBusy) setConfirmation(null);
          }}
        >
          <div className="dialog-body">
            <p>{confirmation.description}</p>
          </div>
          <div className="dialog-footer">
            <button className="button" disabled={confirmBusy} onClick={() => setConfirmation(null)}>
              Cancel
            </button>
            <button
              className={`button ${confirmation.danger ? 'danger' : 'primary'}`}
              disabled={confirmBusy}
              onClick={() => {
                setConfirmBusy(true);
                void confirmation
                  .run()
                  .then((ok) => {
                    if (ok) setConfirmation(null);
                  })
                  .finally(() => setConfirmBusy(false));
              }}
            >
              {confirmBusy ? 'Working…' : confirmation.label}
            </button>
          </div>
        </Dialog>
      )}
      {showClear && (
        <Dialog title="Make a little space?" onClose={() => setShowClear(false)}>
          <div className="dialog-body">
            <p>
              Delete your clipboard history from ClipNest. Your system clipboard is unchanged. This
              cannot be undone.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={clearAll}
                onChange={(e) => setClearAll(e.target.checked)}
              />
              Also delete favorites
            </label>
            <p className="muted">
              {clearAll ? data.clips.length : data.clips.length - favoriteCount} clips will be
              deleted.
            </p>
          </div>
          <div className="dialog-footer">
            <button className="button" onClick={() => setShowClear(false)}>
              Cancel
            </button>
            <button
              className="button danger"
              onClick={() =>
                void act('clear_history', { includeFavorites: clearAll }, 'History cleared').then(
                  (ok) => {
                    if (ok) setShowClear(false);
                  },
                )
              }
            >
              Clear history
            </button>
          </div>
        </Dialog>
      )}
      {help && (
        <Dialog title="Less clicking, more doing." onClose={() => setHelp(false)}>
          <div className="dialog-body">
            <dl className="shortcuts large">
              <div>
                <dt>Open the desktop app</dt>
                <dd>Ctrl + Shift + V</dd>
              </div>
              <div>
                <dt>Search your clips</dt>
                <dd>Ctrl + K</dd>
              </div>
              <div>
                <dt>Pause or resume capture</dt>
                <dd>Ctrl + Shift + P</dd>
              </div>
              <div>
                <dt>Close dialog / clear search</dt>
                <dd>Esc</dd>
              </div>
            </dl>
            <p className="muted">
              Only “Open the desktop app” works while another app is focused. Copying a clip puts it
              on your clipboard; paste with Ctrl + V.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function MonitorIcon() {
  return <Sparkles size={15} />;
}
