import type { SearchResponse, SearchFilters, DocumentDetail, SearchFacets } from './types';

const BASE = '/api';

export async function searchDocuments(
  query: string,
  filters: SearchFilters = {},
  offset = 0,
  limit = 50,
): Promise<SearchResponse> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (filters.category) params.set('category', filters.category);
  if (filters.doc_type) params.set('doc_type', filters.doc_type);
  if (filters.year_min) params.set('year_min', String(filters.year_min));
  if (filters.year_max) params.set('year_max', String(filters.year_max));
  if (filters.language) params.set('language', filters.language);
  if (filters.author) params.set('author', filters.author);
  params.set('offset', String(offset));
  params.set('limit', String(limit));

  const res = await fetch(`${BASE}/search?${params}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json() as Promise<SearchResponse>;
}

export async function getDocument(id: number): Promise<DocumentDetail> {
  const res = await fetch(`${BASE}/documents/${id}`);
  if (!res.ok) throw new Error(`Document fetch failed: ${res.status}`);
  return res.json() as Promise<DocumentDetail>;
}

export async function getFacets(filters: SearchFilters = {}): Promise<SearchFacets> {
  const params = new URLSearchParams();
  if (filters.category) params.set('category', filters.category);
  if (filters.doc_type) params.set('doc_type', filters.doc_type);
  const res = await fetch(`${BASE}/search/facets?${params}`);
  if (!res.ok) throw new Error(`Facets failed: ${res.status}`);
  return res.json() as Promise<SearchFacets>;
}
