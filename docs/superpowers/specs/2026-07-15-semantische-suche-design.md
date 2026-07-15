# LitVault: Semantische Suche (Embeddings)

**Datum:** 2026-07-15
**Status:** Freigegeben (Ansatz A — sentence-transformers in-process + numpy-Brute-Force, Dokument-Level)
**Scope:** Semantischer Suchmodus als Umschalter neben der FTS-Suche + „Ähnliche Dokumente" in der Detailansicht. Chunk-Level-Embeddings, sqlite-vec, Hybrid-Ranking (RRF) und RAG/Chat sind explizit **ausgeklammert** (siehe unten).

## Kontext & Motivation

Die semantische Suche war beim Performance-Umbau (Spec 2026-07-02) bewusst als eigenes Folgepaket ausgeklammert. Die Vorarbeiten existieren bereits:

- Tabelle `embeddings(document_id PK, model, vector BLOB, created_at)` — 0 Zeilen
- Config-Key `embedding_model: "nomic-ai/nomic-embed-text-v1.5"`
- Dependency `sentence-transformers` (+ torch, CPU-Variante) im venv installiert

**Bestand (2026-07-15):** 4.336 Dokumente, davon 3.999 mit Text, Ø ~77.000 Zeichen Volltext. Das Embedding-Modell verarbeitet max. 8.192 Tokens — ein Dokument passt nicht komplett in einen Vektor.

**Gewählter Funktionsumfang (Nutzerentscheidung):**
1. **Semantischer Suchmodus** — Freitextsuche nach Bedeutung statt exakter Wörter, als umschaltbarer Modus neben FTS
2. **Ähnliche Dokumente** — inhaltlich verwandte Dokumente zu einem gegebenen Dokument, ohne Query

## Entscheidungen

| # | Entscheidung | Begründung |
|---|-------------|------------|
| 1 | **Dokument-Level**: ein Vektor pro Dokument | Passt exakt zur vorbereiteten Tabelle; für thematische Suche und „Ähnliche Dokumente" ausreichend; Detailpassagen deckt weiterhin FTS ab. Chunk-Level (~150–200k Vektoren, Schema-Änderung, sqlite-vec) wäre nur für RAG nötig — eigenes Paket. |
| 2 | **sentence-transformers in-process (CPU)** statt Ollama | Suche bleibt self-contained (kein laufendes Ollama als Voraussetzung für eine Kernfunktion); nutzt die vorhandene Dependency und den Config-Key. Kosten: ~600 MB RAM fürs Modell, Erst-Indexierung auf CPU grob 30–90 min (Hintergrund-Job, unkritisch). torch ist CPU-only installiert (2.10.0+cpu). |
| 3 | **numpy-Brute-Force** statt sqlite-vec | 4.336 Vektoren × 768 float32 ≈ 13 MB; Cosine per Matrixmultiplikation < 50 ms. Ein Vektorindex ist bei dieser Bestandsgröße unnötig. BLOB-Format bleibt kompatibel, falls später (Chunk-Level/RAG) sqlite-vec kommt. |
| 4 | **`embedding_max_chars = 8000`** (neuer Config-Key, Default) | ≈ 2k Tokens — Kompromiss aus Qualität und CPU-Indexierungszeit; per Config auf ~30.000 (≈ 8k Tokens, Modellgrenze) erhöhbar. Titel + Summary tragen zusätzlich. |

## Datenmodell

Unverändert. `embeddings.vector` = float32[768], **L2-normalisiert gespeichert** (Cosine wird damit zum reinen Skalarprodukt). Die Spalte `model` dient der Modellwechsel-Erkennung: Weicht sie von `settings.embedding_model` ab, gilt das Embedding als veraltet und wird neu erzeugt.

## Komponenten

### EmbeddingService (neu: `app/search/embedding_service.py`)

- Lädt den SentenceTransformer **lazy** beim ersten Bedarf (App-Start bleibt schnell); `trust_remote_code=True` ist für nomic-Modelle erforderlich (zieht ggf. `einops` als Dependency nach — im Plan prüfen).
- Encoding läuft im **Threadpool** (`asyncio.to_thread` / run_in_executor) — torch gibt den GIL frei, der Event-Loop bleibt frei.
- Nomic-Task-Prefixe: `search_document: ` beim Indexieren, `search_query: ` bei Suchanfragen.
- Einbett-Text pro Dokument: `Titel + Summary + full_text[:embedding_max_chars]` (Felder mit Zeilenumbruch verbunden, fehlende Felder übersprungen).
- Gibt L2-normalisierte float32-Vektoren zurück.

### VectorIndex (neu, In-Memory)

- Hält `(doc_ids: np.ndarray[int], matrix: np.ndarray[N×768])` aller Embeddings des aktuellen Modells; lazy geladen beim ersten semantischen Request.
- **Invalidierung über Generation-Counter** — gleiches Muster wie `FACET_CACHE`: Jede Embedding-Schreiboperation (EMBED-Job, Rescan-Löschung) inkrementiert die Generation; bei Mismatch wird die Matrix neu aus der DB geladen.
- `top_k(query_vec, k)` → Skalarprodukt über die Matrix, argsort, `(doc_id, score)`-Liste.

### Indexierung: `JobType.EMBED` (Erweiterung `app/jobs/`)

- Neuer Job-Typ neben CRAWL/CLASSIFY/RESCAN, mit SSE-Progress wie gehabt.
- Verarbeitet alle Dokumente mit `has_text = 1`, die **kein** Embedding haben **oder** deren `embeddings.model != settings.embedding_model`.
- Commit pro Dokument, damit ein Abbruch keinen Fortschritt verliert; Fehler pro Dokument werden gezählt und geloggt, brechen den Job nicht ab.
- **Auto-Trigger:** Nach einem Crawl wird automatisch ein EMBED-Job für neue/geänderte Dokumente eingereiht (gleiches Muster wie der Classify-Anschluss). Manuell startbar über das Jobs-Panel.
- **Rescan:** Ändert sich der Text eines Dokuments, wird sein Embedding gelöscht; der nächste EMBED-Lauf erzeugt es neu.

### Suche: `mode=semantic` (Erweiterung `GET /api/search`)

Ablauf bei `mode=semantic` und nicht-leerer Query:

1. Query embedden (`search_query: `-Prefix), im Threadpool.
2. `VectorIndex.top_k(query_vec, 200)` → Kandidaten `(doc_id, score)`.
3. Bestehende Metadaten-Filter (Kategorie, Jahr, doc_type, Sprache, …) per SQL **über die Kandidaten-IDs** anwenden (`d.id IN (…)` + vorhandene `filter_clauses`, inkl. `excluded = 0`).
4. Sortierung nach Score absteigend (Sortierung ist im semantischen Modus auf Relevanz fixiert), normale Pagination (`limit`/`offset` auf der gefilterten Kandidatenliste), Score im Feld `rank`.
5. Facetten werden über die gefilterte Kandidatenmenge berechnet (IN-Liste statt FTS-CTE); Facetten-Cache-Key enthält den Modus.
6. `total` = Anzahl der Kandidaten nach Filterung (max. 200 — bewusste Obergrenze, semantische Suche ist ein Ranking, keine Vollzählung).

Leere Query im semantischen Modus verhält sich wie bisher (Browse-Zweig, keine Änderung). `mode`-Default ist `fts` — bestehende API-Nutzer merken nichts.

### Ähnliche Dokumente: `GET /api/documents/{id}/similar?limit=10` (neu)

- Vektor des Dokuments aus der DB (404-frei: hat das Dokument kein Embedding → leere Liste + Flag `embedded: false`).
- `top_k` gegen den Index, das Dokument selbst ausgeschlossen, `excluded = 0` respektiert, Rückgabe mit Score und den üblichen Listen-Metadaten (ohne `full_text`).

### Frontend

- **Suchleiste:** Umschalter „Exakt / Semantisch". Im semantischen Modus: Sortier-Dropdown deaktiviert (fix „Relevanz"), Score am Treffer sichtbar (z. B. Prozentbadge), Snippets entfallen (es gibt keine FTS-Snippets; stattdessen Summary anzeigen).
- **Detailansicht:** Panel „Ähnliche Dokumente" (Top 10, Klick navigiert zum Dokument).
- **Stats:** Anzeige „X von Y Dokumenten embedded" (Y = Dokumente mit `has_text = 1`).

## Fehlerfälle

- **Modell nicht ladbar** (fehlender Download, defekte Installation): 503 mit klarer Fehlermeldung — nur im semantischen Modus und bei `/similar`; FTS-Suche bleibt vollständig unberührt.
- **Kein Embedding vorhanden** (Job noch nicht gelaufen): Dokument erscheint im semantischen Modus schlicht nicht; `/similar` liefert `embedded: false`. Frontend zeigt im semantischen Modus einen Hinweis, wenn 0 Dokumente embedded sind („Embedding-Job starten").
- **Erster Modell-Load dauert** (Download ~550 MB beim allerersten Mal): Der erste semantische Request bzw. EMBED-Job wartet; Lade-Zustand wird per Job-Progress bzw. Request-Dauer sichtbar. Kein Preload beim App-Start.

## Tests

- **Fake-Encoder** (deterministische Vektoren aus Hash/Seed, gleiche Schnittstelle) — kein Modell-Download in CI.
- EmbeddingService: Textzusammenbau (Titel/Summary/Truncation), Prefixe, Normalisierung.
- VectorIndex: top_k-Ranking, Generation-Invalidierung.
- Such-API: Modus-Umschaltung, Filter über Kandidaten, Pagination, Score-Sortierung, leere Query, 503-Pfad.
- `/similar`: Selbstausschluss, `excluded`, fehlendes Embedding.
- EMBED-Job: Neu-/Re-Embedding (Modellwechsel), Rescan-Invalidierung, Fehlertoleranz pro Dokument.

## Ausgeklammert (bewusst)

- **Chunk-Level-Embeddings + sqlite-vec** — nur nötig für Passagen-Retrieval/RAG; BLOB-Format bleibt migrierbar.
- **RAG / Chat über den Bestand** — eigenes v2-Paket (REQUIREMENTS.md).
- **Hybrid-Ranking (RRF aus FTS + semantisch)** — erst sinnvoll, wenn der semantische Modus sich im Alltag bewährt hat; der Umschalter liefert dafür die Erfahrungswerte.
- **GPU-Inferenz** (CUDA-torch oder Ollama-Embeddings) — bei Bedarf späterer Performance-Schalter, ändert nichts am Datenmodell.
