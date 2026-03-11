import type { SearchDocument, SearchResponse, SearchFilters, DocumentDetail, SearchFacets, TagItem, AppSettings, Job, SavedSearch, DashboardStats } from './types';

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
  if (filters.file_type) params.set('file_type', filters.file_type);
  if (filters.processing_status) params.set('processing_status', filters.processing_status);
  if (filters.file_size_min) params.set('file_size_min', String(filters.file_size_min));
  if (filters.file_size_max) params.set('file_size_max', String(filters.file_size_max));
  if (filters.created_after) params.set('created_after', filters.created_after);
  if (filters.created_before) params.set('created_before', filters.created_before);
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
  if (filters.year_min) params.set('year_min', String(filters.year_min));
  if (filters.year_max) params.set('year_max', String(filters.year_max));
  if (filters.language) params.set('language', filters.language);
  if (filters.author) params.set('author', filters.author);
  if (filters.file_type) params.set('file_type', filters.file_type);
  if (filters.processing_status) params.set('processing_status', filters.processing_status);
  if (filters.file_size_min) params.set('file_size_min', String(filters.file_size_min));
  if (filters.file_size_max) params.set('file_size_max', String(filters.file_size_max));
  if (filters.created_after) params.set('created_after', filters.created_after);
  if (filters.created_before) params.set('created_before', filters.created_before);
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

export async function cancelJob(jobId: string): Promise<{ cancelled: boolean }> {
  const res = await fetch(`${BASE}/jobs/${jobId}/cancel`, { method: 'POST' });
  if (!res.ok) throw new Error(`Cancel job failed: ${res.status}`);
  return res.json() as Promise<{ cancelled: boolean }>;
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

// Classify
export async function classifyDocument(docId: number): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/documents/${docId}/classify`, { method: 'POST' });
  if (!res.ok) throw new Error('Classify failed');
  return res.json() as Promise<{ job_id: string }>;
}

export async function classifyBatch(): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/documents/classify-batch`, { method: 'POST' });
  if (!res.ok) throw new Error('Batch classify failed');
  return res.json() as Promise<{ job_id: string }>;
}

// Rescan
export async function rescanDocument(docId: number): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/documents/${docId}/rescan`, { method: 'POST' });
  if (!res.ok) throw new Error('Rescan failed');
  return res.json() as Promise<{ job_id: string }>;
}

export async function openDocument(docId: number): Promise<{ opened: boolean }> {
  const res = await fetch(`${BASE}/documents/${docId}/open`, { method: 'POST' });
  if (!res.ok) throw new Error(`Open failed: ${res.status}`);
  return res.json();
}

export async function rescanAllErrors(): Promise<{ queued: number }> {
  const res = await fetch(`${BASE}/documents/rescan-errors`, { method: 'POST' });
  if (!res.ok) throw new Error('Batch rescan failed');
  return res.json() as Promise<{ queued: number }>;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${BASE}/stats`);
  if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`);
  return res.json() as Promise<DashboardStats>;
}

export async function rescanNoText(): Promise<{ queued: number }> {
  const res = await fetch(`${BASE}/documents/rescan-no-text`, { method: 'POST' });
  if (!res.ok) throw new Error('Rescan no-text failed');
  return res.json() as Promise<{ queued: number }>;
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
  if (filters.file_type) params.set('file_type', filters.file_type);
  if (filters.processing_status) params.set('processing_status', filters.processing_status);
  if (filters.file_size_min) params.set('file_size_min', String(filters.file_size_min));
  if (filters.file_size_max) params.set('file_size_max', String(filters.file_size_max));
  if (filters.created_after) params.set('created_after', filters.created_after);
  if (filters.created_before) params.set('created_before', filters.created_before);
  return `${BASE}/search/export?${params}`;
}
