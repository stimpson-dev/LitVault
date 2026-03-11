import { useState, useEffect, useRef, useCallback } from 'react';
import { searchDocuments } from '@/lib/api';
import type { SearchFilters, SearchResponse, SearchDocument, AppSettings } from '@/lib/types';

interface UseSearchOptions {
  resultsPerPage?: number;
  defaultSort?: AppSettings['default_sort'];
}

export function useSearch(options: UseSearchOptions = {}) {
  const { resultsPerPage = 25, defaultSort = 'date_desc' } = options;
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const [meta, setMeta] = useState<{ total: number; facets: SearchResponse['facets'] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset and fetch fresh when query/filters/limit/sort change
  useEffect(() => {
    setOffset(0);
    setDocuments([]);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      setLoading(true);
      searchDocuments(query, filters, 0, resultsPerPage, defaultSort)
        .then((data) => {
          setDocuments(data.documents);
          setMeta({ total: data.total, facets: data.facets });
        })
        .catch(() => {
          setDocuments([]);
          setMeta(null);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, filters, resultsPerPage, defaultSort]);

  // Load more: append results
  const loadMore = useCallback(() => {
    const nextOffset = documents.length;
    setLoading(true);
    searchDocuments(query, filters, nextOffset, resultsPerPage, defaultSort)
      .then((data) => {
        setDocuments((prev) => [...prev, ...data.documents]);
        setMeta({ total: data.total, facets: data.facets });
        setOffset(nextOffset);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [query, filters, documents.length, resultsPerPage, defaultSort]);

  // Force re-fetch current search from scratch
  const refresh = useCallback(() => {
    setOffset(0);
    setDocuments([]);
    setLoading(true);
    searchDocuments(query, filters, 0, resultsPerPage, defaultSort)
      .then((data) => {
        setDocuments(data.documents);
        setMeta({ total: data.total, facets: data.facets });
      })
      .catch(() => {
        setDocuments([]);
        setMeta(null);
      })
      .finally(() => setLoading(false));
  }, [query, filters, resultsPerPage, defaultSort]);

  const results: SearchResponse | null = meta
    ? { documents, total: meta.total, facets: meta.facets, query }
    : null;

  return { query, setQuery, filters, setFilters, results, loading, offset, setOffset: loadMore, refresh };
}
