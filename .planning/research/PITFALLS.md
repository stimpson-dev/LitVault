# LitVault Critical Pitfalls

## Day-1 Requirements (before any feature code)
1. Enable WAL mode + timeout=30 on every SQLite connection
2. Per-page OCR classification (scanned vs text) before extraction
3. Enable Windows long path support (registry)
4. Ollama structured output with JSON schema from day 1
5. File operation timeouts (ThreadPoolExecutor, 30s max)
6. FTS5 query sanitization (hyphens = NOT operator!)
7. unicode61 tokenizer with remove_diacritics for German text
8. NFC normalization + hyphenation rejoining for German text

## PDF Parsing
- Hybrid PDFs: some pages text, some scanned → per-page detection
- GlyphlessFont = already-OCR'd → don't re-OCR
- Multi-column: pymupdf4llm handles better than raw PyMuPDF
- Encrypted PDFs: try empty password first, log to review queue
- Corrupted files: ThreadPoolExecutor timeout, never block pipeline
- Large PDFs (100+ pages): process page-by-page, never accumulate

## SQLite
- FTS5 external content: MUST use triggers for sync
- ORDER BY rank performance degrades at 50k+ docs
- WAL checkpoint after bulk imports: PRAGMA wal_checkpoint(TRUNCATE)
- FTS5 optimize after bulk: INSERT INTO fts(fts) VALUES('optimize')
- Single writer only — route all writes through asyncio.Queue

## German Text
- FTS5 unicode61 tokenizer handles ä/ö/ü/ß case folding
- Hyphenated line breaks: rejoin "Zahn-\nrad" → "Zahnrad"
- Tesseract needs deu+eng language packs
- JSON config: ensure_ascii=False for German paths

## Network Drives
- os.walk() on disconnected SMB hangs indefinitely → timeout wrapper
- Use UNC paths (\\server\share) not drive letters (Z:\)
- watchfiles PollingObserver for network, normal for local
- Heartbeat check before each processing batch

## AI Classification
- Truncate to first 1500-2000 chars before sending to Qwen
- Set keep_alive=-1 during batch processing
- temperature=0 for deterministic output
- Min 30 words before attempting classification
- Filename-based rules as fallback for short/garbled docs
