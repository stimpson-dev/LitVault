import { X, Trash2, Sparkles, Download } from 'lucide-react';
import { useTranslation } from '@/i18n';

interface BulkEditorProps {
  selectedCount: number;
  totalCount: number;
  onDeselectAll: () => void;
  onExcludeSelected: () => void;
  onClassifySelected: () => void;
  onExportSelected: () => void;
}

export function BulkEditor({
  selectedCount,
  totalCount,
  onDeselectAll,
  onExcludeSelected,
  onClassifySelected,
  onExportSelected,
}: BulkEditorProps) {
  const { t } = useTranslation();

  return (
    <div className="sticky top-14 z-30 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
      <div className="flex items-center gap-3 px-4 py-2">
        {/* Left: selected badge + deselect */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-900/60 px-2.5 py-0.5 text-xs font-medium text-blue-200 border border-blue-800">
            {selectedCount} {t('results.selected')}
          </span>
          <button
            type="button"
            onClick={onDeselectAll}
            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            aria-label={t('results.deselectAll')}
          >
            <X size={14} />
          </button>
        </div>

        {/* Center: action buttons */}
        <div className="flex items-center gap-2 flex-1 justify-center">
          <button
            type="button"
            onClick={onExcludeSelected}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-red-900/60 hover:bg-red-800/70 text-red-200 transition-colors"
          >
            <Trash2 size={12} />
            {t('bulk.exclude')}
          </button>
          <button
            type="button"
            onClick={onClassifySelected}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            <Sparkles size={12} />
            {t('bulk.classify')}
          </button>
          <button
            type="button"
            onClick={onExportSelected}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            <Download size={12} />
            {t('bulk.export')}
          </button>
        </div>

        {/* Right: count */}
        <div className="shrink-0 text-xs text-zinc-500">
          {selectedCount} {t('bulk.of')} {totalCount} {t('bulk.documents')}
        </div>
      </div>
    </div>
  );
}
