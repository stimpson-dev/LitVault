import type { SearchDocument, SearchResponse, SearchFilters, DocumentDetail, SearchFacets, TagItem, AppSettings, Job, SavedSearch } from './types';

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

// Favorites
export async function toggleFavorite(docId: number): Promise<{ favorited: boolean }> {
  const res = await fetch(`${BASE}/documents/${docId}/favorite`, { method: 'POST' });
  if (!res.ok) throw new Error(`Toggle favorite failed: ${res.status}`);
  return res.json() as Promise<{ favorited: boolean }>;
}

export async function listFavorites(): Promise<SearchDocument[]> {
  const res = await fetch(`${BASE}/favorites`);
  if (!res.ok) throw new Error(`List favorites failed: ${res.status}`);
  return res.json() as Promise<SearchDocument[]>;
}

// Tags
export async function getDocumentTags(docId: number): Promise<TagItem[]> {
  const res = await fetch(`${BASE}/documents/${docId}/tags`);
  if (!res.ok) throw new Error(`Get tags failed: ${res.status}`);
  return res.json() as Promise<TagItem[]>;
}

export async function addDocumentTag(docId: number, name: string): Promise<TagItem> {
  const res = await fetch(`${BASE}/documents/${docId}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Add tag failed: ${res.status}`);
  return res.json() as Promise<TagItem>;
}

export async function removeDocumentTag(docId: number, tagId: number): Promise<void> {
  const res = await fetch(`${BASE}/documents/${docId}/tags/${tagId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Remove tag failed: ${res.status}`);
}

// Document update
export async function updateDocument(
  docId: number,
  updates: Partial<Pick<SearchDocument, 'title' | 'authors' | 'year' | 'doc_type' | 'source' | 'language' | 'summary'>>,
): Promise<DocumentDetail> {
  const res = await fetch(`${BASE}/documents/${docId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Update document failed: ${res.status}`);
  return res.json() as Promise<DocumentDetail>;
}

// Settings
export async function getAppSettings(): Promise<AppSettings> {
  const res = await fetch(`${BASE}/settings`);
  if (!res.ok) throw new Error(`Get settings failed: ${res.status}`);
  return res.json() as Promise<AppSettings>;
}

export async function updateAppSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Update settings failed: ${res.status}`);
  return res.json() as Promise<AppSettings>;
}

// Jobs
export async function listJobs(status?: string): Promise<Job[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const res = await fetch(`${BASE}/jobs?${params}`);
  if (!res.ok) throw new Error(`List jobs failed: ${res.status}`);
  return res.json() as Promise<Job[]>;
}

// Saved searches
export async function createSavedSearch(name: string, query: string): Promise<SavedSearch> {
  const res = await fetch(`${BASE}/saved-searches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, query }),
  });
  if (!res.ok) throw new Error(`Create saved search failed: ${res.status}`);
  return res.json() as Promise<SavedSearch>;
}

export async function listSavedSearches(): Promise<SavedSearch[]> {
  const res = await fetch(`${BASE}/saved-searches`);
  if (!res.ok) throw new Error(`List saved searches failed: ${res.status}`);
  return res.json() as Promise<SavedSearch[]>;
}

export async function deleteSavedSearch(id: number): Promise<void> {
  const res = await fetch(`${BASE}/saved-searches/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete saved search failed: ${res.status}`);
}

// CSV export
export function getExportUrl(query: string, filters: SearchFilters): string {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (filters.category) params.set('category', filters.category);
  if (filters.doc_type) params.set('doc_type', filters.doc_type);
  if (filters.year_min) params.set('year_min', String(filters.year_min));
  if (filters.year_max) params.set('year_max', String(filters.year_max));
  if (filters.language) params.set('language', filters.language);
  if (filters.author) params.set('author', filters.author);
  return `${BASE}/search/export?${params}`;
}
