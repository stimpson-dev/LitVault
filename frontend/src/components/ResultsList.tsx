import { Loader2 } from 'lucide-react';
import { ResultRow } from './ResultRow';
import type { SearchDocument } from '@/lib/types';

interface ResultsListProps {
  documents?: SearchDocument[];
  total?: number;
  loading: boolean;
  offset: number;
  onLoadMore: () => void;
  onSelect: (id: number) => void;
}

export function ResultsList({ documents, total, loading, offset: _offset, onLoadMore, onSelect }: ResultsListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="py-12 text-center text-zinc-500 text-sm">
        Keine Ergebnisse
      </div>
    );
  }

  const hasMore = total !== undefined && total > documents.length;

  return (
    <div className="flex flex-col">
      {documents.map((doc) => (
        <ResultRow key={doc.id} doc={doc} onSelect={onSelect} />
      ))}
      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            type="button"
            onClick={onLoadMore}
            className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors"
          >
            Mehr laden
          </button>
        </div>
      )}
    </div>
  );
}
