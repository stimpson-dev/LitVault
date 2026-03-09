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
}

export interface FacetItem {
  name: string;
  count: number;
}

export interface SearchFacets {
  categories: FacetItem[];
  doc_types: FacetItem[];
  years: FacetItem[];
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
  doi: string | null;
  updated_at: string;
  indexed_at: string | null;
}
