import { useState, useEffect, useCallback } from 'react';
import { useSearch } from '@/hooks/useSearch';
import { excludeBatch } from '@/lib/api';
import { useSettings } from '@/hooks/useSettings';
import { FilterSidebar } from '@/components/FilterSidebar';
import { FilterChips } from '@/components/FilterChips';
import { FavoritesSidebar } from '@/components/FavoritesSidebar';
import { ResultsList } from '@/components/ResultsList';
import { DocumentDetail } from '@/components/DocumentDetail';
import { ReviewQueue } from '@/components/ReviewQueue';

interface DocumentsPageProps {
  activePanel: 'review' | null;
  onSelectDoc?: (id: number) => void;
  onCloseReview?: () => void;
}

export function DocumentsPage({ activePanel, onSelectDoc, onCloseReview }: DocumentsPageProps) {
  const { settings } = useSettings();
  const search = useSearch({
    resultsPerPage: settings.results_per_page,
    defaultSort: settings.default_sort,
  });
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!search.results?.documents) return;
    setSelectedIds(new Set(search.results.documents.map((d) => d.id)));
  }, [search.results?.documents]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleExcludeSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      await excludeBatch([...selectedIds]);
      setSelectedIds(new Set());
      setSelectedDocId(null);
      search.refresh();
    } catch { /* ignore */ }
  }, [selectedIds, search]);

  // Clear selection when search results change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search.results?.documents]);

  const handleDocSelect = (id: number) => {
    setSelectedDocId(id);
    onSelectDoc?.(id);
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Left sidebar: favorites + filters */}
      <aside className="w-72 border-r border-zinc-800 overflow-y-auto shrink-0 hidden lg:block">
        {settings.show_favorites_sidebar && (
          <FavoritesSidebar onSelect={handleDocSelect} />
        )}
        <FilterSidebar
          facets={search.results?.facets}
          filters={search.filters}
          onFilterChange={search.setFilters}
        />
      </aside>

      {/* Center: results or review queue */}
      <main className="flex-1 overflow-y-auto">
        {activePanel === 'review' ? (
          <ReviewQueue
            onSelectDoc={(id) => {
              handleDocSelect(id);
              onCloseReview?.();
            }}
            onClose={() => onCloseReview?.()}
          />
        ) : (
          <>
            <FilterChips
              filters={search.filters}
              onFilterChange={search.setFilters}
            />
            <ResultsList
              documents={search.results?.documents}
              total={search.results?.total}
              loading={search.loading}
              offset={search.offset}
              onLoadMore={() => search.setOffset()}
              onSelect={handleDocSelect}
              viewMode={settings.view_mode}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onExcludeSelected={handleExcludeSelected}
            />
          </>
        )}
      </main>

      {/* Right panel: document detail */}
      {selectedDocId !== null && (
        <aside className="w-[400px] border-l border-zinc-800 overflow-y-auto shrink-0 hidden xl:block">
          <DocumentDetail
            docId={selectedDocId}
            onClose={() => setSelectedDocId(null)}
          />
        </aside>
      )}
    </div>
  );
}
