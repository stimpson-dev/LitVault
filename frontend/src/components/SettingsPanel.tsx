import { useState, useEffect } from 'react';
import { getAppSettings, updateAppSettings } from '@/lib/api';
import type { AppSettings } from '@/lib/types';
import { X, Plus, Minus } from 'lucide-react';

interface SettingsPanelProps {
  onClose: () => void;
}

interface DraftSettings {
  watch_folders: string[];
  ollama_url: string;
  ollama_model: string;
  poll_interval_seconds: number;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [draft, setDraft] = useState<DraftSettings>({
    watch_folders: [],
    ollama_url: '',
    ollama_model: '',
    poll_interval_seconds: 60,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAppSettings()
      .then((s) => {
        setSettings(s);
        setDraft({
          watch_folders: s.watch_folders,
          ollama_url: s.ollama_url,
          ollama_model: s.ollama_model,
          poll_interval_seconds: s.poll_interval_seconds,
        });
      })
      .catch(() => {
        // silently fail
      });
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
    setDraft((d) => {
      const folders = d.watch_folders.filter((_, i) => i !== index);
      return { ...d, watch_folders: folders };
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-lg border border-zinc-800 shadow-2xl">
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
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-zinc-400">Watch Folders</label>
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
                      className="flex-1 bg-zinc-800 text-zinc-100 rounded px-3 py-2 border border-zinc-700 text-sm focus:outline-none focus:border-zinc-500"
                      placeholder="/pfad/zum/ordner"
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
              <label className="block text-sm text-zinc-400 mb-1">Ollama URL</label>
              <input
                type="text"
                value={draft.ollama_url}
                onChange={(e) => setDraft((d) => ({ ...d, ollama_url: e.target.value }))}
                className="w-full bg-zinc-800 text-zinc-100 rounded px-3 py-2 border border-zinc-700 text-sm focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Ollama Modell</label>
              <input
                type="text"
                value={draft.ollama_model}
                onChange={(e) => setDraft((d) => ({ ...d, ollama_model: e.target.value }))}
                className="w-full bg-zinc-800 text-zinc-100 rounded px-3 py-2 border border-zinc-700 text-sm focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Poll-Intervall (Sekunden)</label>
              <input
                type="number"
                value={draft.poll_interval_seconds}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, poll_interval_seconds: parseInt(e.target.value, 10) || 0 }))
                }
                className="w-full bg-zinc-800 text-zinc-100 rounded px-3 py-2 border border-zinc-700 text-sm focus:outline-none focus:border-zinc-500"
                min={1}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-6">
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
