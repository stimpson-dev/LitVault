import { SortControls } from '@/components/SortControls';
import { DisplayModeToggle } from '@/components/DisplayModeToggle';
import type { AppSettings } from '@/lib/types';

type SortOption = AppSettings['default_sort'];
type ViewMode = AppSettings['view_mode'];

interface DocumentToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
}

export function DocumentToolbar({
  viewMode,
  onViewModeChange,
  sort,
  onSortChange,
}: DocumentToolbarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800">
      <div className="flex items-center gap-3 ml-auto shrink-0">
        <SortControls value={sort} onSortChange={onSortChange} />
        <DisplayModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
      </div>
    </div>
  );
}
