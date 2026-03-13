import { ResultRow } from './ResultRow';
import { GridCard } from './GridCard';
import { LargeCard } from './LargeCard';
import { Skeleton } from './ui/Skeleton';
import type { SearchDocument, AppSettings, SearchFilters } from '@/lib/types';
import { useTranslation } from '@/i18n';

type FilterAddHandler = (type: keyof SearchFilters, value: string) => void;

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
  onFilterAdd?: FilterAddHandler;
}

export function ResultsList({ documents, total, loading, offset: _offset, onLoadMore, onSelect, viewMode = 'table', selectedIds, onToggleSelect, onFilterAdd }: ResultsListProps) {
  const { t } = useTranslation();

  if (loading && (!documents || documents.length === 0)) {
    return (
      <div className="flex flex-col gap-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4 border-b border-zinc-800">
            <Skeleton className="size-4 rounded" />
            <div className="flex-1 flex flex-col gap-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
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

  const loadMoreButton = hasMore && (
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
  );

  if (viewMode === 'grid') {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 p-4">
          {documents.map((doc) => (
            <GridCard key={doc.id} doc={doc} onSelect={onSelect} selected={selectedIds?.has(doc.id)} onToggleSelect={onToggleSelect} onFilterAdd={onFilterAdd} />
          ))}
        </div>
        {loadMoreButton}
      </div>
    );
  }

  if (viewMode === 'large') {
    return (
      <div className="flex flex-col gap-3 p-4">
        {documents.map((doc) => (
          <LargeCard key={doc.id} doc={doc} onSelect={onSelect} selected={selectedIds?.has(doc.id)} onToggleSelect={onToggleSelect} onFilterAdd={onFilterAdd} />
        ))}
        {loadMoreButton}
      </div>
    );
  }

  // 'table' view (default)
  return (
    <div className="flex flex-col">
      {documents.map((doc) => (
        <ResultRow key={doc.id} doc={doc} onSelect={onSelect} selected={selectedIds?.has(doc.id)} onToggleSelect={onToggleSelect} onFilterAdd={onFilterAdd} />
      ))}
      {loadMoreButton}
    </div>
  );
}
