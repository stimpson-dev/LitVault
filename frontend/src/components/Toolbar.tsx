import { Bookmark, ClipboardCheck, Settings, BarChart3, Activity } from 'lucide-react';
import { ExportButton } from '@/components/ExportButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { SearchFilters } from '@/lib/types';
import { useTranslation } from '@/i18n';

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
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1 px-4 py-1.5 border-b border-zinc-800">
      <button
        onClick={onOpenSavedSearches}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
        title={t('toolbar.savedSearches')}
      >
        <Bookmark size={14} />
        <span>{t('toolbar.search')}</span>
      </button>

      <button
        onClick={onOpenReviewQueue}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
        title={t('toolbar.reviewTitle')}
      >
        <ClipboardCheck size={14} />
        <span>{t('toolbar.review')}</span>
      </button>

      <button
        onClick={onOpenStats}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
        title={t('toolbar.dashboard')}
      >
        <BarChart3 size={14} />
        <span>{t('toolbar.dashboard')}</span>
      </button>

      <button
        onClick={onOpenJobs}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
        title={t('toolbar.jobs')}
      >
        <Activity size={14} />
        <span>{t('toolbar.jobs')}</span>
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
          title={t('toolbar.settings')}
        >
          <Settings size={14} />
          <span>{t('toolbar.settings')}</span>
        </button>
      </div>
    </div>
  );
}
