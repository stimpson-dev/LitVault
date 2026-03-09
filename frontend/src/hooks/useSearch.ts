import { useState, useEffect, useRef } from 'react';
import { searchDocuments } from '@/lib/api';
import type { SearchFilters, SearchResponse } from '@/lib/types';

export function useSearch() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      setLoading(true);
      searchDocuments(query, filters, offset)
        .then((data) => {
          setResults(data);
        })
        .catch(() => {
          setResults(null);
        })
        .finally(() => {
          setLoading(false);
        });
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [query, filters, offset]);

  return { query, setQuery, filters, setFilters, results, loading, offset, setOffset };
}
