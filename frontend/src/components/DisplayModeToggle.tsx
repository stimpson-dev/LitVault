import { List, LayoutGrid, Rows3 } from 'lucide-react';
import type { AppSettings } from '@/lib/types';
import { useTranslation } from '@/i18n';

type ViewMode = AppSettings['view_mode'];

interface DisplayModeToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function DisplayModeToggle({ viewMode, onViewModeChange }: DisplayModeToggleProps) {
  const { t } = useTranslation();

  const modes: { value: ViewMode; icon: React.ReactNode; label: string }[] = [
    { value: 'table', icon: <List size={14} />, label: t('toolbar.displayTable') },
    { value: 'grid', icon: <LayoutGrid size={14} />, label: t('toolbar.displayGrid') },
    { value: 'large', icon: <Rows3 size={14} />, label: t('toolbar.displayLarge') },
  ];

  return (
    <div className="flex items-center rounded border border-zinc-700 overflow-hidden">
      {modes.map(({ value, icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onViewModeChange(value)}
          title={label}
          className={`flex items-center justify-center px-2 py-1 transition-colors ${
            viewMode === value
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
