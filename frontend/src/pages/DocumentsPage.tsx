import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, useOutletContext } from 'react-router-dom';
import { excludeBatch, classifyBatch, getExportUrl, listSavedSearches } from '@/lib/api';
import { useSettings } from '@/hooks/useSettings';
import { FilterBar } from '@/components/filters/FilterBar';
import { FilterChips } from '@/components/FilterChips';
import { BulkEditor } from '@/components/BulkEditor';
import { ResultsList } from '@/components/ResultsList';
import { DocumentToolbar } from '@/components/DocumentToolbar';
import type { SearchFilters, AppSettings } from '@/lib/types';
import type { ShellContext } from '@/components/layout/AppShell';

type ViewMode = AppSettings['view_mode'];

export function DocumentsPage() {
  const { settings, loaded: settingsLoaded } = useSettings();
  const { viewId } = useParams<{ viewId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { search } = useOutletContext<ShellContext>();

  const viewModeInitialized = useRef(false);
  const [viewMode, setViewMode] = useState<ViewMode>(settings.view_mode);

  // Sync viewMode once when settings finish loading from API
  useEffect(() => {
    if (settingsLoaded && !viewModeInitialized.current) {
      viewModeInitialized.current = true;
      setViewMode(settings.view_mode);
    }
  }, [settingsLoaded, settings.view_mode]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // On mount: reset search state and apply URL params (only once)
  useEffect(() => {
    const q = searchParams.get('q');
    const category = searchParams.get('category');
    const doc_type = searchParams.get('doc_type');
    const year_min = searchParams.get('year_min');
    const year_max = searchParams.get('year_max');
    const file_type = searchParams.get('file_type');
    const processing_status = searchParams.get('processing_status');
    const has_text = searchParams.get('has_text');
    const classification_source = searchParams.get('classification_source');
    const created_after = searchParams.get('created_after');
    const created_before = searchParams.get('created_before');

    // Always reset to URL state (shared search persists across navigations)
    search.setQuery(q ?? '');

    const initialFilters: SearchFilters = {};
    if (category) initialFilters.category = category;
    if (doc_type) initialFilters.doc_type = doc_type;
    if (year_min) initialFilters.year_min = Number(year_min);
    if (year_max) initialFilters.year_max = Number(year_max);
    if (file_type) initialFilters.file_type = file_type;
    if (processing_status) initialFilters.processing_status = processing_status;
    if (has_text !== null) initialFilters.has_text = has_text === 'true';
    if (classification_source) initialFilters.classification_source = classification_source;
    if (created_after) initialFilters.created_after = created_after;
    if (created_before) initialFilters.created_before = created_before;

    search.setFilters(initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On filter/query change: update URL params
  // Use ref for setSearchParams to avoid re-triggering on reference change (React Router v7)
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;

  useEffect(() => {
    const params = new URLSearchParams();
    if (search.query) params.set('q', search.query);
    if (search.filters.category) params.set('category', search.filters.category);
    if (search.filters.doc_type) params.set('doc_type', search.filters.doc_type);
    if (search.filters.year_min !== undefined) params.set('year_min', String(search.filters.year_min));
    if (search.filters.year_max !== undefined) params.set('year_max', String(search.filters.year_max));
    if (search.filters.file_type) params.set('file_type', search.filters.file_type);
    if (search.filters.processing_status) params.set('processing_status', search.filters.processing_status);
    if (search.filters.has_text !== undefined) params.set('has_text', String(search.filters.has_text));
    if (search.filters.classification_source) params.set('classification_source', search.filters.classification_source);
    if (search.filters.created_after) params.set('created_after', search.filters.created_after);
    if (search.filters.created_before) params.set('created_before', search.filters.created_before);
    setSearchParamsRef.current(params, { replace: true });
  }, [search.filters, search.query]);

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
  }, [selectedIds, search.refresh]);

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
  }, [search.filters, search.setFilters]);

  // Clear selection when search results change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search.results?.documents]);

  const handleDocSelect = (id: number) => {
    if (search.results?.documents) {
      sessionStorage.setItem('docListIds', JSON.stringify(search.results.documents.map((d) => d.id)));
    }
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
          sort={search.sort}
          onSortChange={search.setSort}
        />
        <ResultsList
          documents={search.results?.documents}
          total={search.results?.total}
          loading={search.loading}
          offset={search.offset}
          onLoadMore={search.loadMore}
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
