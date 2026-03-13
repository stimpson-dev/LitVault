import type { AppSettings } from '@/lib/types';
import { useTranslation } from '@/i18n';

type SortOption = AppSettings['default_sort'];

interface SortControlsProps {
  value: SortOption;
  onSortChange: (sort: SortOption) => void;
}

export function SortControls({ value, onSortChange }: SortControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-500 shrink-0">{t('toolbar.sortBy')}</span>
      <select
        value={value}
        onChange={(e) => onSortChange(e.target.value as SortOption)}
        className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1 focus:outline-none focus:border-zinc-500 cursor-pointer"
      >
        <option value="relevance">{t('sort.relevance')}</option>
        <option value="date_desc">{t('sort.dateDesc')}</option>
        <option value="date_asc">{t('sort.dateAsc')}</option>
        <option value="name_asc">{t('sort.nameAsc')}</option>
        <option value="name_desc">{t('sort.nameDesc')}</option>
      </select>
    </div>
  );
}
