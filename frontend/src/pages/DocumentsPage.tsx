import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useSearch } from '@/hooks/useSearch';
import { excludeBatch, classifyBatch, getExportUrl, listSavedSearches } from '@/lib/api';
import { useSettings } from '@/hooks/useSettings';
import { FilterBar } from '@/components/filters/FilterBar';
import { FilterChips } from '@/components/FilterChips';
import { BulkEditor } from '@/components/BulkEditor';
import { ResultsList } from '@/components/ResultsList';
import { DocumentToolbar } from '@/components/DocumentToolbar';
import type { SearchFilters, AppSettings } from '@/lib/types';

type SortOption = AppSettings['default_sort'];
type ViewMode = AppSettings['view_mode'];

export function DocumentsPage() {
  const { settings } = useSettings();
  const { viewId } = useParams<{ viewId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [sort, setSort] = useState<SortOption>(settings.default_sort);
  const [viewMode, setViewMode] = useState<ViewMode>(settings.view_mode);

  // Sync sort/viewMode when settings load
  useEffect(() => {
    setSort(settings.default_sort);
  }, [settings.default_sort]);

  useEffect(() => {
    setViewMode(settings.view_mode);
  }, [settings.view_mode]);

  const search = useSearch({
    resultsPerPage: settings.results_per_page,
    defaultSort: sort,
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // On mount: read URL params and initialize filters (only once)
  useEffect(() => {
    const q = searchParams.get('q');
    const category = searchParams.get('category');
    const doc_type = searchParams.get('doc_type');
    const year_min = searchParams.get('year_min');
    const year_max = searchParams.get('year_max');
    const file_type = searchParams.get('file_type');
    const processing_status = searchParams.get('processing_status');
    const created_after = searchParams.get('created_after');
    const created_before = searchParams.get('created_before');

    if (q) search.setQuery(q);

    const initialFilters: SearchFilters = {};
    if (category) initialFilters.category = category;
    if (doc_type) initialFilters.doc_type = doc_type;
    if (year_min) initialFilters.year_min = Number(year_min);
    if (year_max) initialFilters.year_max = Number(year_max);
    if (file_type) initialFilters.file_type = file_type;
    if (processing_status) initialFilters.processing_status = processing_status;
    if (created_after) initialFilters.created_after = created_after;
    if (created_before) initialFilters.created_before = created_before;

    if (Object.keys(initialFilters).length > 0) {
      search.setFilters(initialFilters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On filter/query change: update URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (search.query) params.set('q', search.query);
    if (search.filters.category) params.set('category', search.filters.category);
    if (search.filters.doc_type) params.set('doc_type', search.filters.doc_type);
    if (search.filters.year_min !== undefined) params.set('year_min', String(search.filters.year_min));
    if (search.filters.year_max !== undefined) params.set('year_max', String(search.filters.year_max));
    if (search.filters.file_type) params.set('file_type', search.filters.file_type);
    if (search.filters.processing_status) params.set('processing_status', search.filters.processing_status);
    if (search.filters.created_after) params.set('created_after', search.filters.created_after);
    if (search.filters.created_before) params.set('created_before', search.filters.created_before);
    setSearchParams(params, { replace: true });
  }, [search.filters, search.query, setSearchParams]);

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

  // Handle ?doc=id from sidebar recent docs click — navigate to full-page detail
  useEffect(() => {
    const docParam = searchParams.get('doc');
    if (docParam) {
      navigate(`/documents/${docParam}`, { replace: true });
    }
  }, [searchParams, navigate]);

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleExcludeSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      await excludeBatch([...selectedIds]);
      setSelectedIds(new Set());
      search.refresh();
    } catch { /* ignore */ }
  }, [selectedIds, search]);

  const handleClassifySelected = useCallback(async () => {
    try {
      await classifyBatch();
    } catch { /* ignore */ }
  }, []);

  const handleExportSelected = useCallback(() => {
    // TODO: future API will support exporting specific IDs; for now exports all matching the current search
    const url = getExportUrl(search.query, search.filters);
    window.open(url, '_blank');
  }, [search.query, search.filters]);

  const handleFilterAdd = useCallback((type: keyof SearchFilters, value: string) => {
    if (type === 'year_min' || type === 'year_max') {
      const year = Number(value);
      search.setFilters({ ...search.filters, year_min: year, year_max: year });
    } else {
      search.setFilters({ ...search.filters, [type]: value });
    }
  }, [search]);

  // Clear selection when search results change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search.results?.documents]);

  const handleDocSelect = (id: number) => {
    navigate(`/documents/${id}`);
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Center: filter bar + results */}
      <main className="flex-1 overflow-y-auto">
        {selectedIds.size > 0 ? (
          <BulkEditor
            selectedCount={selectedIds.size}
            totalCount={search.results?.total ?? 0}
            onDeselectAll={handleDeselectAll}
            onExcludeSelected={handleExcludeSelected}
            onClassifySelected={handleClassifySelected}
            onExportSelected={handleExportSelected}
          />
        ) : (
          <FilterBar
            facets={search.results?.facets}
            filters={search.filters}
            onFilterChange={search.setFilters}
          />
        )}
        <FilterChips
          filters={search.filters}
          onFilterChange={search.setFilters}
        />
        <DocumentToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sort={sort}
          onSortChange={setSort}
        />
        <ResultsList
          documents={search.results?.documents}
          total={search.results?.total}
          loading={search.loading}
          offset={search.offset}
          onLoadMore={() => search.setOffset()}
          onSelect={handleDocSelect}
          viewMode={viewMode}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onFilterAdd={handleFilterAdd}
        />
      </main>

    </div>
  );
}
