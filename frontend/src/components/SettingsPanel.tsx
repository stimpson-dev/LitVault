import { useState, useEffect } from 'react';
import { getAppSettings, updateAppSettings } from '@/lib/api';
import type { AppSettings } from '@/lib/types';
import { X, Plus, Minus } from 'lucide-react';

interface SettingsPanelProps {
  onClose: () => void;
}

interface DraftSettings {
  language: AppSettings['language'];
  theme: AppSettings['theme'];
  start_page: AppSettings['start_page'];
  results_per_page: number;
  default_sort: AppSettings['default_sort'];
  view_mode: AppSettings['view_mode'];
  show_favorites_sidebar: boolean;
  watch_folders: string[];
  poll_interval_seconds: number;
}

const selectClass =
  'w-full bg-zinc-800 text-zinc-100 rounded px-3 py-2 border border-zinc-700 text-sm focus:outline-none focus:border-zinc-500';
const inputClass = selectClass;
const sectionTitle =
  'text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3';

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [draft, setDraft] = useState<DraftSettings>({
    language: 'de',
    theme: 'dark',
    start_page: 'search',
    results_per_page: 25,
    default_sort: 'date_desc',
    view_mode: 'list',
    show_favorites_sidebar: true,
    watch_folders: [],
    poll_interval_seconds: 30,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAppSettings()
      .then((s) => {
        setSettings(s);
        setDraft({
          language: s.language,
          theme: s.theme,
          start_page: s.start_page,
          results_per_page: s.results_per_page,
          default_sort: s.default_sort,
          view_mode: s.view_mode,
          show_favorites_sidebar: s.show_favorites_sidebar,
          watch_folders: s.watch_folders,
          poll_interval_seconds: s.poll_interval_seconds,
        });
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateAppSettings(draft);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  function updateFolder(index: number, value: string) {
    setDraft((d) => {
      const folders = [...d.watch_folders];
      folders[index] = value;
      return { ...d, watch_folders: folders };
    });
  }

  function addFolder() {
    setDraft((d) => ({ ...d, watch_folders: [...d.watch_folders, ''] }));
  }

  function removeFolder(index: number) {
    setDraft((d) => ({
      ...d,
      watch_folders: d.watch_folders.filter((_, i) => i !== index),
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-lg max-h-[85vh] border border-zinc-800 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-zinc-100">Einstellungen</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {!settings ? (
          <p className="text-sm text-zinc-500">Laden...</p>
        ) : (
          <div className="overflow-y-auto space-y-6 pr-1">
            {/* --- Allgemein --- */}
            <section>
              <h3 className={sectionTitle}>Allgemein</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Sprache</label>
                  <select
                    value={draft.language}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, language: e.target.value as DraftSettings['language'] }))
                    }
                    className={selectClass}
                  >
                    <option value="de">Deutsch</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Theme</label>
                  <select
                    value={draft.theme}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, theme: e.target.value as DraftSettings['theme'] }))
                    }
                    className={selectClass}
                  >
                    <option value="dark">Dunkel</option>
                    <option value="light">Hell</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Startseite</label>
                  <select
                    value={draft.start_page}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, start_page: e.target.value as DraftSettings['start_page'] }))
                    }
                    className={selectClass}
                  >
                    <option value="search">Suche</option>
                    <option value="dashboard">Dashboard</option>
                    <option value="favorites">Favoriten</option>
                  </select>
                </div>
              </div>
            </section>

            {/* --- Darstellung --- */}
            <section>
              <h3 className={sectionTitle}>Darstellung</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Ergebnisse pro Seite</label>
                  <select
                    value={draft.results_per_page}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, results_per_page: parseInt(e.target.value, 10) }))
                    }
                    className={selectClass}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Standard-Sortierung</label>
                  <select
                    value={draft.default_sort}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, default_sort: e.target.value as DraftSettings['default_sort'] }))
                    }
                    className={selectClass}
                  >
                    <option value="date_desc">Datum (neueste)</option>
                    <option value="date_asc">Datum (älteste)</option>
                    <option value="name_asc">Name (A-Z)</option>
                    <option value="name_desc">Name (Z-A)</option>
                    <option value="relevance">Relevanz</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Ansicht</label>
                  <div className="flex gap-2">
                    {(['list', 'grid'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, view_mode: mode }))}
                        className={`flex-1 rounded px-3 py-2 text-sm transition-colors ${
                          draft.view_mode === mode
                            ? 'bg-blue-600 text-white'
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        {mode === 'list' ? 'Liste' : 'Kacheln'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm text-zinc-400">Favoriten in Sidebar</label>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({ ...d, show_favorites_sidebar: !d.show_favorites_sidebar }))
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      draft.show_favorites_sidebar ? 'bg-blue-600' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        draft.show_favorites_sidebar ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </section>

            {/* --- Ordner & Synchronisation --- */}
            <section>
              <h3 className={sectionTitle}>Ordner & Synchronisation</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm text-zinc-400">Überwachte Ordner</label>
                    <button
                      type="button"
                      onClick={addFolder}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Ordner hinzufügen"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {draft.watch_folders.map((folder, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          value={folder}
                          onChange={(e) => updateFolder(i, e.target.value)}
                          className={`flex-1 ${inputClass}`}
                          placeholder="C:\Pfad\zum\Ordner"
                        />
                        <button
                          type="button"
                          onClick={() => removeFolder(i)}
                          className="p-2 rounded hover:bg-zinc-800 text-zinc-600 hover:text-red-400 transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                      </div>
                    ))}
                    {draft.watch_folders.length === 0 && (
                      <p className="text-xs text-zinc-600">Keine Ordner konfiguriert</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">
                    Abfrageintervall (Sekunden)
                  </label>
                  <input
                    type="number"
                    value={draft.poll_interval_seconds}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        poll_interval_seconds: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    className={inputClass}
                    min={1}
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-zinc-800">
          {saved && <span className="text-green-400 text-sm mr-2">Gespeichert!</span>}
          <button
            type="button"
            onClick={onClose}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded text-sm transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !settings}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
