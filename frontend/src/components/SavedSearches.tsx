import { useState, useEffect } from 'react';
import { createSavedSearch, listSavedSearches, deleteSavedSearch } from '@/lib/api';
import type { SavedSearch, SearchFilters } from '@/lib/types';
import { Trash2, X, Bookmark } from 'lucide-react';

interface SavedSearchesProps {
  currentQuery: string;
  currentFilters: SearchFilters;
  onLoadSearch: (query: string, filters: SearchFilters) => void;
  onClose: () => void;
}

export function SavedSearches({ currentQuery, currentFilters, onLoadSearch, onClose }: SavedSearchesProps) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  async function fetchSearches() {
    try {
      const result = await listSavedSearches();
      setSearches(result);
    } catch {
      // silently fail
    }
  }

  useEffect(() => {
    fetchSearches();
  }, []);

  async function handleSave() {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const payload = JSON.stringify({ q: currentQuery, ...currentFilters });
      await createSavedSearch(saveName.trim(), payload);
      setSaveName('');
      await fetchSearches();
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteSavedSearch(id);
      await fetchSearches();
    } catch {
      // silently fail
    }
  }

  function handleLoad(search: SavedSearch) {
    try {
      const parsed = JSON.parse(search.query) as { q?: string } & SearchFilters;
      onLoadSearch(parsed.q || '', {
        category: parsed.category,
        doc_type: parsed.doc_type,
        year_min: parsed.year_min,
        year_max: parsed.year_max,
        language: parsed.language,
        author: parsed.author,
      });
      onClose();
    } catch {
      // silently fail
    }
  }

  function formatDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 w-80">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-200">
          <Bookmark size={14} />
          <span>Gespeicherte Suchen</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder="Name..."
          className="flex-1 bg-zinc-800 text-zinc-100 rounded px-2 py-1.5 text-sm border border-zinc-700 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !saveName.trim()}
          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Speichern
        </button>
      </div>

      <div>
        {searches.length === 0 ? (
          <p className="text-xs text-zinc-500 py-2">Keine gespeicherten Suchen</p>
        ) : (
          <ul>
            {searches.map((search) => (
              <li
                key={search.id}
                className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0 hover:bg-zinc-800/50 cursor-pointer rounded px-1 transition-colors"
                onClick={() => handleLoad(search)}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-sm text-zinc-200 truncate">{search.name}</span>
                  <span className="text-xs text-zinc-500">{formatDate(search.created_at)}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(search.id); }}
                  className="p-1 rounded hover:bg-zinc-700 text-zinc-600 hover:text-red-400 transition-colors ml-2 flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
