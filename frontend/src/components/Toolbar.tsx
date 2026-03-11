import { Bookmark, ClipboardCheck, Settings, BarChart3, Activity } from 'lucide-react';
import { ExportButton } from '@/components/ExportButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { SearchFilters } from '@/lib/types';

interface ToolbarProps {
  onOpenSettings: () => void;
  onOpenReviewQueue: () => void;
  onOpenSavedSearches: () => void;
  onOpenStats: () => void;
  onOpenJobs: () => void;
  hasActiveJob?: boolean;
  query: string;
  filters: SearchFilters;
  resultCount?: number;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function Toolbar({
  onOpenSettings,
  onOpenReviewQueue,
  onOpenSavedSearches,
  onOpenStats,
  onOpenJobs,
  hasActiveJob,
  query,
  filters,
  resultCount,
  theme,
  onToggleTheme,
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
        <span>Prüfung</span>
      </button>

      <button
        onClick={onOpenStats}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
        title="Dashboard"
      >
        <BarChart3 size={14} />
        <span>Dashboard</span>
      </button>

      <button
        onClick={onOpenJobs}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
        title="Jobs"
      >
        <Activity size={14} />
        <span>Jobs</span>
        {hasActiveJob && (
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
        )}
      </button>

      <ExportButton
        query={query}
        filters={filters}
        disabled={!resultCount}
      />

      <div className="ml-auto flex items-center">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
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
