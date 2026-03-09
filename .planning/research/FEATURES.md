# LitVault Feature Research Summary

## MoSCoW Prioritization

### Must-Have (v1 core loop)
- Incremental folder crawl with SHA-256 dedup
- Text extraction: PDF (pymupdf4llm), DOCX, PPTX
- Per-page OCR detection + Tesseract fallback
- SQLite FTS5 full-text search with snippet highlighting
- Faceted filter sidebar (category, doc type, year range, language, author)
- AI classification via Ollama/Qwen (structured JSON output)
- Confidence-tiered auto-apply (≥0.85 auto, 0.55-0.84 review, <0.55 unclassified)
- Tagging workflow: AI suggests → User confirms/corrects
- Document detail view with PDF preview (iframe)
- Thumbnail generation (PyMuPDF page 1 → JPEG)
- Active filter chips with clear-all
- Result count display
- Basic duplicate detection (SHA-256 hash match)

### Should-Have (v1.1)
- Saved searches (stored as JSON filter state)
- File watcher (watchfiles awatch)
- DOI-based duplicate detection
- Export to CSV/Excel
- Favorites / reading list
- Search query sanitization (German hyphens, FTS5 operators)
- Network drive graceful degradation (heartbeat + timeout)

### Could-Have (v1.2+)
- Title-similarity near-duplicate detection (MinHash)
- Autocomplete / search suggestions
- Bulk re-classification
- DOCX/PPTX preview (LibreOffice headless)
- German stemming for better search recall

### Out of Scope (v2+)
- RAG / Chat over archive
- Semantic similarity search ("ähnliche Dokumente")
- Multi-user support
- Cloud sync

## Key UX Patterns from Research
- Paperless-ngx consume-queue pattern for ingest
- Zotero dual-organization: collections + tags
- Faceted search with dynamic filter counts
- Confidence as colored dot (green/yellow/red), not raw percentage
- Result cards: title (highlighted), authors+year, type badge, category tags, snippet, file icon
