import { Trash2, X, CheckSquare } from 'lucide-react';
import { SortControls } from '@/components/SortControls';
import { DisplayModeToggle } from '@/components/DisplayModeToggle';
import type { AppSettings } from '@/lib/types';
import { useTranslation } from '@/i18n';

type SortOption = AppSettings['default_sort'];
type ViewMode = AppSettings['view_mode'];

interface DocumentToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  selectedCount: number;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onExcludeSelected?: () => void;
}

export function DocumentToolbar({
  viewMode,
  onViewModeChange,
  sort,
  onSortChange,
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onExcludeSelected,
}: DocumentToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800">
      {/* Left: selection controls */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {selectedCount > 0 ? (
          <>
            <span className="text-sm text-blue-200 font-medium shrink-0">
              {selectedCount} {t('results.selected')}
            </span>
            <button
              type="button"
              onClick={onSelectAll}
              className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors flex items-center gap-1 shrink-0"
            >
              <CheckSquare size={12} />
              {t('results.selectAll')}
            </button>
            <button
              type="button"
              onClick={onExcludeSelected}
              className="text-xs px-3 py-1 rounded bg-red-900/60 hover:bg-red-800/70 text-red-200 transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Trash2 size={12} />
              {t('results.excludeSelected')}
            </button>
            <button
              type="button"
              onClick={onDeselectAll}
              className="text-xs p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
              aria-label={t('results.deselectAll')}
            >
              <X size={14} />
            </button>
          </>
        ) : null}
      </div>

      {/* Right: sort + display mode */}
      <div className="flex items-center gap-3 shrink-0">
        <SortControls value={sort} onSortChange={onSortChange} />
        <DisplayModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
      </div>
    </div>
  );
}
