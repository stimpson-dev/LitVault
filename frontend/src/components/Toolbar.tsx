import { Bookmark, ClipboardCheck, Settings } from 'lucide-react';
import { ExportButton } from '@/components/ExportButton';
import type { SearchFilters } from '@/lib/types';

interface ToolbarProps {
  onOpenSettings: () => void;
  onOpenReviewQueue: () => void;
  onOpenSavedSearches: () => void;
  query: string;
  filters: SearchFilters;
  resultCount?: number;
}

export function Toolbar({
  onOpenSettings,
  onOpenReviewQueue,
  onOpenSavedSearches,
  query,
  filters,
  resultCount,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-4 py-1.5 border-b border-zinc-800">
      <button
        onClick={onOpenSavedSearches}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
        title="Gespeicherte Suchen"
      >
        <Bookmark size={14} />
        <span>Suchen</span>
      </button>

      <button
        onClick={onOpenReviewQueue}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
        title="Überprüfung"
      >
        <ClipboardCheck size={14} />
        <span>Review</span>
      </button>

      <ExportButton
        query={query}
        filters={filters}
        disabled={!resultCount}
      />

      <div className="ml-auto">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
          title="Einstellungen"
        >
          <Settings size={14} />
          <span>Einstellungen</span>
        </button>
      </div>
    </div>
  );
}
