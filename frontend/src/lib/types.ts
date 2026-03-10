export interface SearchDocument {
  id: number;
  file_path: string;
  file_hash: string;
  file_type: string;
  file_size: number | null;
  title: string | null;
  authors: string | null; // JSON array as string
  year: number | null;
  doc_type: string | null;
  source: string | null;
  language: string | null;
  summary: string | null;
  has_text: boolean;
  processing_status: string;
  classification_confidence: number | null;
  classification_source: string | null;
  created_at: string;
  title_snippet: string | null;
  text_snippet: string | null;
  rank: number;
}

export interface SearchFilters {
  category?: string;
  doc_type?: string;
  year_min?: number;
  year_max?: number;
  language?: string;
  author?: string;
  file_type?: string;
  processing_status?: string;
}

export interface FacetItem {
  name: string;
  count: number;
}

export interface SearchFacets {
  categories: FacetItem[];
  doc_types: FacetItem[];
  years: FacetItem[];
  file_types: FacetItem[];
  statuses: FacetItem[];
}

export interface SearchResponse {
  documents: SearchDocument[];
  total: number;
  facets: SearchFacets;
  query: string;
}

export interface DocumentDetail extends SearchDocument {
  file_hash: string;
  mtime: number | null;
  page_count: number | null;
  doi: string | null;
  updated_at: string;
  indexed_at: string | null;
}

export interface TagItem {
  id: number;
  name: string;
  source?: string;
}

export interface AppSettings {
  watch_folders: string[];
  ollama_url: string;
  ollama_model: string;
  db_path: string;
  thumbnails_dir: string;
  log_level: string;
  poll_interval_seconds: number;
}

export interface JobProgress {
  status: string;
  current: number;
  total: number;
  message: string;
  result: unknown;
  error: string | null;
}

export interface Job {
  id: string;
  type: string;
  status: string;
  progress_current: number;
  progress_total: number;
  progress_message: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

export interface DashboardStats {
  total: number;
  by_status: { done: number; error: number; processing: number };
  by_classification: { ai: number; filename: number; user: number; none: number };
  has_text: { yes: number; no: number };
  needs_ai: number;
  needs_ocr: number;
  errors: number;
}

export interface SavedSearch {
  id: number;
  name: string;
  query: string;
  created_at: string;
}
