import { useEffect, useState } from 'react';
import {
  Download,
  Upload,
  ShieldCheck,
  Monitor,
  Sun,
  Moon,
  Trash2,
  Database,
  SlidersHorizontal,
  Keyboard,
  Check,
} from 'lucide-react';
import { desktop } from '../lib/api';
import type { Settings } from '../lib/types';
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={`switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}
export function SettingsPanel({
  settings,
  onSave,
  onClear,
  onExport,
  onImport,
}: {
  settings: Settings;
  onSave: (s: Settings) => Promise<boolean>;
  onClear: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [phrases, setPhrases] = useState(settings.ignoredPhrases.join('\n'));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const serialized = JSON.stringify(settings);
  useEffect(() => {
    const next = JSON.parse(serialized) as Settings;
    setDraft(next);
    setPhrases(next.ignoredPhrases.join('\n'));
  }, [serialized]);
  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((s) => ({ ...s, [key]: value }));
    setSaved(false);
  }
  const next = {
    ...draft,
    ignoredPhrases: phrases
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  };
  const dirty = JSON.stringify(next) !== serialized;
  async function save() {
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    setSaved(ok);
  }
  return (
    <div className="settings-layout">
      <div className="settings-main">
        <section className="settings-section">
          <div className="section-heading">
            <Monitor size={19} />
            <div>
              <h2>Make it feel like home</h2>
              <p>Choose the appearance of your workspace.</p>
            </div>
          </div>
          <div className="theme-options">
            {(
              [
                { id: 'light', label: 'Light', Icon: Sun },
                { id: 'dark', label: 'Dark', Icon: Moon },
                { id: 'system', label: 'System', Icon: Monitor },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`theme-option ${draft.theme === id ? 'chosen' : ''}`}
                aria-pressed={draft.theme === id}
                onClick={() => set('theme', id)}
              >
                <span className={`theme-preview ${id}`}>
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <Icon size={15} />
                  {label}
                  {draft.theme === id && <Check size={14} />}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="settings-section">
          <div className="section-heading">
            <ShieldCheck size={19} />
            <div>
              <h2>Privacy & capture</h2>
              <p>You decide what stays in your history.</p>
            </div>
          </div>
          <Toggle
            checked={draft.filterSensitive}
            onChange={(v) => set('filterSensitive', v)}
            label="Filter likely sensitive content"
            description="Skip common API keys, private keys, numeric codes, and card numbers."
          />
          <p className="notice">
            Detection is a best-effort filter. It cannot recognize every password or secret. Pause
            capture before copying anything confidential.
          </p>
          <label className="field">
            Ignored phrases
            <textarea
              rows={4}
              placeholder={'One phrase per line\nInternal use only'}
              value={phrases}
              onChange={(e) => {
                setPhrases(e.target.value);
                setSaved(false);
              }}
            />
            <small>
              Skip text containing these phrases, ignoring letter case. Up to 50 phrases, 200 bytes
              each.
            </small>
          </label>
          <label className="setting-row">
            <div>
              <strong>Maximum clip size</strong>
              <p>Larger text is skipped automatically.</p>
            </div>
            <select
              aria-label="Maximum clip size"
              value={draft.maxTextBytes}
              onChange={(e) => set('maxTextBytes', Number(e.target.value))}
            >
              <option value={10000}>10 KB</option>
              <option value={100000}>100 KB</option>
              <option value={1000000}>1 MB</option>
            </select>
          </label>
        </section>
        <section className="settings-section">
          <div className="section-heading">
            <Database size={19} />
            <div>
              <h2>History & storage</h2>
              <p>Favorites are kept until you delete them.</p>
            </div>
          </div>
          <label className="setting-row">
            <div>
              <strong>History limit</strong>
              <p>Maximum number of non-favorite clips.</p>
            </div>
            <select
              aria-label="History limit"
              value={draft.historyLimit}
              onChange={(e) => set('historyLimit', Number(e.target.value))}
            >
              {[50, 100, 250, 500, 1000, 2500, 5000].map((v) => (
                <option key={v} value={v}>
                  {v.toLocaleString()} clips
                </option>
              ))}
            </select>
          </label>
          <label className="setting-row">
            <div>
              <strong>Keep history for</strong>
              <p>Older non-favorite clips are removed.</p>
            </div>
            <select
              aria-label="Keep history for"
              value={draft.retentionDays}
              onChange={(e) => set('retentionDays', Number(e.target.value))}
            >
              {[1, 7, 14, 30, 90, 180, 365].map((v) => (
                <option key={v} value={v}>
                  {v} days
                </option>
              ))}
            </select>
          </label>
          <p className="notice">
            Reducing these limits deletes matching history when you save. Export a backup first if
            you need to keep it.
          </p>
        </section>
        <section className="settings-section">
          <div className="section-heading">
            <SlidersHorizontal size={19} />
            <div>
              <h2>Desktop behavior</h2>
              <p>Keep ClipNest close, without getting in the way.</p>
            </div>
          </div>
          <Toggle
            checked={draft.closeToTray}
            onChange={(v) => set('closeToTray', v)}
            label="Keep running when closed"
            description="The close button hides the window. Quit from the tray menu to stop capture."
          />
          <Toggle
            checked={draft.startMinimized}
            onChange={(v) => set('startMinimized', v)}
            label="Start in the tray"
            description="Hide the window on the next launch. This does not enable Windows autostart."
          />
        </section>
        <div className="settings-save">
          <span>
            {saved
              ? 'Settings saved'
              : dirty
                ? 'You have unsaved changes'
                : 'Everything is up to date'}
          </span>
          <button
            className="button primary"
            disabled={saving || !dirty}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
      <aside className="settings-aside">
        <div className="info-box">
          <ShieldCheck size={24} />
          <h3>
            On your device.
            <br />
            Under your control.
          </h3>
          <p>
            ClipNest has no account, cloud sync, analytics, or remote content loading. Your desktop
            history lives in a local SQLite database.
          </p>
          <p>
            History and exported backups are not encrypted. Your Windows account and disk encryption
            protect access to these files.
          </p>
        </div>
        <div className="info-box">
          <h3>Your data, portable</h3>
          <p>
            Export an unencrypted JSON backup or merge a previous backup. Imports respect your
            current privacy and retention settings.
          </p>
          <button className="button full" onClick={onExport} disabled={!desktop}>
            <Download size={16} />
            Export backup
          </button>
          <button className="button full" onClick={onImport} disabled={!desktop}>
            <Upload size={16} />
            Import backup
          </button>
          {!desktop && <small>Available in the desktop app.</small>}
        </div>
        <div className="info-box">
          <Keyboard size={20} />
          <h3>A few handy shortcuts</h3>
          <dl className="shortcuts">
            <div>
              <dt>Open ClipNest</dt>
              <dd>Ctrl Shift V</dd>
            </div>
            <div>
              <dt>Search</dt>
              <dd>Ctrl K</dd>
            </div>
            <div>
              <dt>Pause / resume</dt>
              <dd>Ctrl Shift P</dd>
            </div>
            <div>
              <dt>Close dialog</dt>
              <dd>Esc</dd>
            </div>
          </dl>
        </div>
        <button className="button danger-quiet full" onClick={onClear}>
          <Trash2 size={16} />
          Clear history
        </button>
        <p className="credit">Made by Narayan Om</p>
      </aside>
    </div>
  );
}
