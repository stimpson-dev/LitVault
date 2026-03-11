import { Loader2, Trash2, X, CheckSquare, Square } from 'lucide-react';
import { ResultRow } from './ResultRow';
import { GridCard } from './GridCard';
import type { SearchDocument, AppSettings } from '@/lib/types';
import { useTranslation } from '@/i18n';

interface ResultsListProps {
  documents?: SearchDocument[];
  total?: number;
  loading: boolean;
  offset: number;
  onLoadMore: () => void;
  onSelect: (id: number) => void;
  viewMode?: AppSettings['view_mode'];
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onExcludeSelected?: () => void;
}

export function ResultsList({ documents, total, loading, offset: _offset, onLoadMore, onSelect, viewMode = 'list', selectedIds, onToggleSelect, onSelectAll, onDeselectAll, onExcludeSelected }: ResultsListProps) {
  const { t } = useTranslation();
  const selectionCount = selectedIds?.size ?? 0;

  if (loading && (!documents || documents.length === 0)) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="py-12 text-center text-zinc-500 text-sm">
        {t('results.noResults')}
      </div>
    );
  }

  const hasMore = total !== undefined && total > documents.length;

  const selectionBar = selectionCount > 0 && (
    <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-2 bg-blue-950/80 border-b border-blue-800 backdrop-blur-sm">
      <span className="text-sm text-blue-200 font-medium">
        {selectionCount} {t('results.selected')}
      </span>
      <button
        type="button"
        onClick={onSelectAll}
        className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors flex items-center gap-1"
      >
        <CheckSquare size={12} />
        {t('results.selectAll')}
      </button>
      <button
        type="button"
        onClick={onExcludeSelected}
        className="text-xs px-3 py-1 rounded bg-red-900/60 hover:bg-red-800/70 text-red-200 transition-colors flex items-center gap-1.5"
      >
        <Trash2 size={12} />
        {t('results.excludeSelected')}
      </button>
      <button
        type="button"
        onClick={onDeselectAll}
        className="ml-auto text-xs p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
        aria-label={t('results.deselectAll')}
      >
        <X size={14} />
      </button>
    </div>
  );

  if (viewMode === 'grid') {
    return (
      <div className="flex flex-col gap-4">
        {selectionBar}
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 p-4">
          {documents.map((doc) => (
            <GridCard key={doc.id} doc={doc} onSelect={onSelect} selected={selectedIds?.has(doc.id)} onToggleSelect={onToggleSelect} />
          ))}
        </div>
        {hasMore && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              {loading ? t('results.loading') : t('results.loadMore')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {selectionBar}
      {documents.map((doc) => (
        <ResultRow key={doc.id} doc={doc} onSelect={onSelect} selected={selectedIds?.has(doc.id)} onToggleSelect={onToggleSelect} />
      ))}
      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            {loading ? t('results.loading') : t('results.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}
