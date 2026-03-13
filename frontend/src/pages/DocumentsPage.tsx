import { useState, useEffect, useCallback } from 'react';
import { useParams, useOutletContext, useSearchParams } from 'react-router-dom';
import { useSearch } from '@/hooks/useSearch';
import { excludeBatch, listSavedSearches } from '@/lib/api';
import { useSettings } from '@/hooks/useSettings';
import { FilterSidebar } from '@/components/FilterSidebar';
import { FilterChips } from '@/components/FilterChips';
import { FavoritesSidebar } from '@/components/FavoritesSidebar';
import { ResultsList } from '@/components/ResultsList';
import { DocumentDetail } from '@/components/DocumentDetail';
import type { SearchFilters } from '@/lib/types';

interface ShellContext {
  addRecent: (id: number, title: string) => void;
}

export function DocumentsPage() {
  const { settings } = useSettings();
  const { viewId } = useParams<{ viewId: string }>();
  const [searchParams] = useSearchParams();
  const context = useOutletContext<ShellContext | undefined>();
  const search = useSearch({
    resultsPerPage: settings.results_per_page,
    defaultSort: settings.default_sort,
  });
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Load saved view when navigating to /view/:viewId
  useEffect(() => {
    if (!viewId) return;
    listSavedSearches()
      .then((views) => {
        const view = views.find((v) => String(v.id) === viewId);
        if (!view) return;
        try {
          const parsed = JSON.parse(view.query) as { q?: string } & SearchFilters;
          search.setQuery(parsed.q || '');
          search.setFilters({
            category: parsed.category,
            doc_type: parsed.doc_type,
            year_min: parsed.year_min,
            year_max: parsed.year_max,
            language: parsed.language,
            author: parsed.author,
            file_type: parsed.file_type,
            processing_status: parsed.processing_status,
          });
        } catch { /* ignore parse errors */ }
      })
      .catch(() => {});
    // Only load on viewId change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId]);

  // Handle ?doc=id from sidebar recent docs click
  useEffect(() => {
    const docParam = searchParams.get('doc');
    if (docParam) {
      setSelectedDocId(Number(docParam));
    }
  }, [searchParams]);

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
    // Add to recent docs in sidebar
    const doc = search.results?.documents.find((d) => d.id === id);
    if (doc && context?.addRecent) {
      context.addRecent(id, doc.title || doc.file_path.split('/').pop() || `#${id}`);
    }
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

      {/* Center: results */}
      <main className="flex-1 overflow-y-auto">
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
