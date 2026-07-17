# Crawl-Fortschritt im Jobs-Panel — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Scan-Phase des Crawls meldet gedrosselt Fortschritt (aktuelle Datei + Zähler), und das Jobs-Panel zeigt alle parallel laufenden Jobs statt nur des ersten.

**Architecture:** `scan_folder`/`find_new_files` bekommen einen optionalen `on_progress`-Callback (gleiche Signatur wie im Job-System), zeitgedrosselt auf max. 1 Meldung/Sekunde via `time.monotonic`; `ingest_folder` reicht seinen bestehenden Callback durch. Im Frontend rendert `JobProgress.tsx` eine Aktiv-Karte pro `processing`-Job — SSE bleibt an den ersten gebunden, weitere Karten nutzen die ohnehin gepollten `progress_*`-Felder.

**Tech Stack:** Python/asyncio, pytest, React 19.

**Spec:** `docs/superpowers/specs/2026-07-17-crawl-fortschritt-design.md`

## Global Constraints

- Scan-Meldung exakt: `on_progress(0, 0, f"Scanning: {path} ({checked} checked)")` — englisch, `current=0, total=0` (Total unbekannt → Indeterminate-Balken im Panel)
- Drosselung: höchstens eine Meldung pro Sekunde (`time.monotonic`, `last_report`-Vergleich, Initialwert `0.0` → die erste unterstützte Datei meldet sofort)
- `checked` zählt unterstützte, nicht übersprungene Dateien; die Meldung erfolgt VOR dem (langsamen) Hashing der Datei
- Callback überall optional (`None` = heutiges Verhalten); bestehende Aufrufer unverändert
- Kein zweiter SSE-Stream; Zweitkarten nutzen `job.progress_current/progress_total/progress_message` aus dem 5-s-Poll
- i18n-Key `jobs.embed` = „Embedding" in `de` UND `en`
- Backend-Tests: `cd backend && uv run pytest tests/<datei> -v` | Frontend-Verify: `cd frontend && npx tsc -b && npm run lint` (2 bekannte Warnungen in DocumentsPage.tsx akzeptabel)

---

### Task 1: Backend — Scan-Progress-Callback in crawler.py

**Files:**
- Modify: `backend/app/ingest/crawler.py` (`scan_folder` Zeilen 37–69, `find_new_files` Zeilen 72–88)
- Modify: `backend/app/ingest/service.py` (Zeile 144: `find_new_files`-Aufruf)
- Modify: `backend/tests/test_ingest_parallel.py` (Fakes, die `find_new_files` monkeypatchen — siehe Step 3.5)
- Test: `backend/tests/test_crawler_progress.py` (neu)

**Interfaces:**
- Produces: `scan_folder(folder, on_progress: Callable[[int, int, str], None] | None = None)`; `find_new_files(folder, db, on_progress: Callable[[int, int, str], None] | None = None)` — Signaturen abwärtskompatibel (Default `None`)

- [ ] **Step 1: Failing Tests schreiben**

```python
# backend/tests/test_crawler_progress.py
"""Gedrosselte Scan-Fortschrittsmeldungen aus scan_folder/find_new_files."""
import pytest

import app.ingest.crawler as crawler_mod
from app.ingest.crawler import find_new_files


@pytest.fixture
def pdf_dir(tmp_path):
    """Drei Mini-'PDFs' (Inhalt egal — nur Hashing/Meta, kein Parsen)."""
    for i in range(3):
        (tmp_path / f"doc{i}.pdf").write_bytes(b"%PDF-fake " + bytes([i]))
    (tmp_path / "notes.txt").write_text("ignored")  # nicht unterstuetzt
    return tmp_path


class _FakeClock:
    """Kontrollierbare time.monotonic-Quelle."""
    def __init__(self, start: float = 100.0, step: float = 0.0):
        self.now = start
        self.step = step

    def __call__(self) -> float:
        value = self.now
        self.now += self.step
        return value


async def test_scan_reports_path_and_counter(pdf_dir, db_session, monkeypatch):
    # Zeit schreitet pro Abfrage um 2s fort -> jede Datei meldet
    monkeypatch.setattr(crawler_mod.time, "monotonic", _FakeClock(step=2.0))
    calls: list[tuple[int, int, str]] = []

    result = await find_new_files(pdf_dir, db_session, on_progress=lambda c, t, m: calls.append((c, t, m)))

    assert len(result) == 3  # txt wird ignoriert
    assert len(calls) == 3
    for i, (current, total, message) in enumerate(calls, start=1):
        assert (current, total) == (0, 0)
        assert message.startswith("Scanning: ")
        assert message.endswith(f"({i} checked)")
        assert ".pdf" in message


async def test_scan_throttles_to_one_report_per_second(pdf_dir, db_session, monkeypatch):
    # Zeit steht still -> nur die erste Datei meldet (100.0 - 0.0 >= 1.0)
    monkeypatch.setattr(crawler_mod.time, "monotonic", _FakeClock(step=0.0))
    calls: list[str] = []

    result = await find_new_files(pdf_dir, db_session, on_progress=lambda c, t, m: calls.append(m))

    assert len(result) == 3
    assert len(calls) == 1
    assert calls[0].endswith("(1 checked)")


async def test_scan_without_callback_unchanged(pdf_dir, db_session):
    result = await find_new_files(pdf_dir, db_session)
    assert len(result) == 3
```

Hinweis: `db_session` kommt aus `backend/tests/conftest.py`; die Seed-Dokumente dort haben andere Pfade, daher sind alle tmp-Dateien „neu". `crawler.py` muss `time` auf Modulebene importieren, damit `crawler_mod.time` patchbar ist.

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd backend && uv run pytest tests/test_crawler_progress.py -v`
Expected: FAIL — `TypeError: find_new_files() got an unexpected keyword argument 'on_progress'` (und `AttributeError` auf `crawler_mod.time`, solange der Import fehlt)

- [ ] **Step 3: Implementieren**

In `backend/app/ingest/crawler.py`:

1. Import ergänzen (bei den bestehenden Imports): `import time` und `from typing import AsyncGenerator, Callable` (Callable in die bestehende typing-Zeile aufnehmen).

2. `scan_folder` erweitern — Signatur und Datei-Schleife:

```python
async def scan_folder(
    folder: str | Path,
    on_progress: Callable[[int, int, str], None] | None = None,
) -> AsyncGenerator[dict, None]:
    folder = Path(folder)

    def _walk(root: Path):
        return list(os.walk(root))

    try:
        entries = await asyncio.wait_for(asyncio.to_thread(_walk, folder), timeout=60)
    except asyncio.TimeoutError:
        logger.error("Timeout walking folder: %s", folder)
        return
    except Exception as exc:
        logger.error("Error walking folder %s: %s", folder, exc)
        return

    checked = 0
    last_report = 0.0
    for dirpath, _dirnames, filenames in entries:
        for filename in filenames:
            path = Path(dirpath) / filename
            if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue
            if path.name.startswith("~$"):
                continue  # Skip Office lock files
            if path.name.startswith("._"):
                continue  # Skip macOS resource fork files
            checked += 1
            # Meldung VOR dem (bei Netzlaufwerken langsamen) Hashing,
            # gedrosselt auf max. 1x pro Sekunde
            if on_progress is not None:
                now = time.monotonic()
                if now - last_report >= 1.0:
                    on_progress(0, 0, f"Scanning: {path.as_posix()} ({checked} checked)")
                    last_report = now
            try:
                meta = await collect_file_meta(path)
                yield meta
            except asyncio.TimeoutError:
                logger.warning("Timeout hashing file, skipping: %s", path)
            except PermissionError as exc:
                logger.warning("Permission error, skipping %s: %s", path, exc)
            except Exception as exc:
                logger.warning("Failed to collect meta for %s: %s", path, exc)
```

3. `find_new_files` erweitern — Signatur und Durchreichen:

```python
async def find_new_files(
    folder: str | Path,
    db: AsyncSession,
    on_progress: Callable[[int, int, str], None] | None = None,
) -> list[dict]:
```

und in der Schleife: `async for meta in scan_folder(folder, on_progress=on_progress):`

4. In `backend/app/ingest/service.py` Zeile 144 ersetzen:

```python
        new_files = await find_new_files(folder, self.db, on_progress=on_progress)
```

5. Aufrufer-Fakes anpassen — das ist PFLICHT, nicht optional: `ingest_folder` übergibt `on_progress=` jetzt IMMER an `find_new_files`. Jede Fake-Funktion in `backend/tests/test_ingest_parallel.py`, die `find_new_files` monkeypatcht und den kwarg nicht akzeptiert, bricht mit `TypeError`. Alle solchen Fakes finden (`grep -n "find_new_files" backend/tests/test_ingest_parallel.py`) und ihre Signatur um `on_progress=None` erweitern (z. B. `async def fake_find(folder, db, on_progress=None): ...`). Danach zur Sicherheit repo-weit prüfen:

Run: `cd backend && grep -rn "scan_folder\|find_new_files" app tests --include="*.py"`
Expected: Treffer nur in `crawler.py`, `service.py`, `test_crawler_progress.py` und `test_ingest_parallel.py` (angepasst).

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `cd backend && uv run pytest tests/test_crawler_progress.py tests/test_ingest_parallel.py -v`
Expected: alle PASS (3 neue + Bestand als Regressionsnetz)

- [ ] **Step 5: Commit**

```bash
git add backend/app/ingest/crawler.py backend/app/ingest/service.py backend/tests/test_crawler_progress.py backend/tests/test_ingest_parallel.py
git commit -m "feat: Scan-Phase meldet gedrosselt Fortschritt (Datei + Zaehler) (Task 1)"
```

---

### Task 2: Frontend — alle laufenden Jobs im Panel + Gesamtverify

**Files:**
- Modify: `frontend/src/components/JobProgress.tsx` (State Zeilen 78–88, `getTypeLabel` Zeilen 90–95, `connectSSE` Zeilen 112–148, Ableitungen Zeilen 184–191, Aktiv-Karte Zeilen 246–310, Header-Indikator Zeilen 216–220)
- Modify: `frontend/src/i18n/translations.ts` (1 Key in `de` und `en`)

**Interfaces:**
- Consumes: `Job.progress_current/progress_total/progress_message` (in `types.ts` bereits deklariert, API liefert sie)
- Produces: eine Aktiv-Karte pro `processing`-Job; SSE-Feed nur für den zuerst gefundenen laufenden Job, Rest aus Poll-Daten.

- [ ] **Step 1: State und SSE-Job-Bindung**

In `JobProgress.tsx`:

1. Neuen State neben `activeProgress` ergänzen:

```tsx
  const [sseJobId, setSseJobId] = useState<string | null>(null);
```

2. In `connectSSE` nach `esRef.current = es;` einfügen:

```tsx
    setSseJobId(jobId);
```

und in beiden Stellen, an denen der Stream geschlossen und `esRef.current = null` gesetzt wird UND `setActiveProgress(null)` folgt bzw. der Job endet (der `done/error/cancelled`-Zweig in `onmessage` sowie der `else if (!processing && esRef.current)`-Zweig im Intervall), zusätzlich:

```tsx
          setSseJobId(null);
```

(Im `onerror`-Handler genügt das Schließen — das Intervall räumt beim nächsten Tick auf.)

- [ ] **Step 2: Ableitungen und Karten-Rendering ersetzen**

Die Zeile `const activeJob = jobs.find((j) => j.status === 'processing');` ersetzen durch:

```tsx
  const processingJobs = jobs.filter((j) => j.status === 'processing');
```

Die `progressPercent`-Konstante (Zeilen 188–191) ersatzlos streichen (wandert in die Karte). Den Header-Indikator `{activeJob ? (` auf `{processingJobs.length > 0 ? (` ändern.

Den kompletten Aktiv-Karten-Block `{activeJob && ( ... )}` (Zeilen 246–310) ersetzen durch:

```tsx
      {/* Active jobs — eine Karte pro laufendem Job */}
      {processingJobs.length > 0 && (
        <div className="px-3 pb-3 space-y-2">
          {processingJobs.map((job) => {
            // Erster laufender Job bekommt Live-Daten via SSE (0,5s),
            // weitere Karten zeigen die 5s-Poll-Daten des Jobs selbst.
            const live =
              job.id === sseJobId && activeProgress
                ? activeProgress
                : {
                    status: job.status,
                    current: job.progress_current,
                    total: job.progress_total,
                    message: job.progress_message,
                  };
            const pct = live.total > 0 ? (live.current / live.total) * 100 : 0;
            return (
              <div
                key={job.id}
                className="
                  relative bg-zinc-800/60 rounded-lg p-3 ring-1 ring-amber-500/20
                  shadow-[inset_0_1px_0_0_rgba(245,158,11,0.06)]
                "
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center">
                      <Loader2 size={12} className="text-amber-300 animate-spin" />
                    </div>
                    <span className="text-[12px] font-medium text-amber-200">
                      {getTypeLabel(job.type)}
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await cancelJob(job.id);
                        fetchJobs();
                      } catch { /* ignore */ }
                    }}
                    className="
                      p-1 rounded-md text-zinc-600 hover:text-red-400
                      hover:bg-red-500/10 transition-all duration-200
                    "
                    title={t('jobs.cancel')}
                  >
                    <XCircle size={13} />
                  </button>
                </div>

                {live.total > 0 ? (
                  <div className="w-full h-1.5 bg-zinc-700/60 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                ) : (
                  <div className="w-full h-1.5 bg-zinc-700/60 rounded-full overflow-hidden mb-2">
                    <div className="h-full rounded-full bg-amber-400/60 w-1/3 animate-pulse" />
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500 truncate max-w-[320px]">
                    {shortenMessage(live.message)}
                  </span>
                  {live.total > 0 && (
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] tabular-nums text-zinc-500">
                        {live.current}/{live.total}
                      </span>
                      <span className="text-[10px] tabular-nums text-amber-400/80">
                        {Math.round(pct)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
```

- [ ] **Step 3: embed-Label ergänzen**

In `getTypeLabel` (nach der `rescan`-Zeile):

```tsx
    if (type === 'embed') return t('jobs.embed');
```

In `translations.ts`, `de`-Objekt bei den `jobs.*`-Keys: `"jobs.embed": "Embedding",` — und im `en`-Objekt analog `"jobs.embed": "Embedding",`.

- [ ] **Step 4: Verify (Frontend + Backend-Gesamtlauf)**

Run: `cd frontend && npx tsc -b && npm run lint`
Expected: 0 Fehler (2 bekannte Warnungen in DocumentsPage.tsx)

Run: `cd backend && uv run pytest -q`
Expected: 118 passed (115 Bestand + 3 aus Task 1), keine Regression

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/JobProgress.tsx frontend/src/i18n/translations.ts
git commit -m "feat: Jobs-Panel zeigt alle laufenden Jobs + Embedding-Label (Task 2)"
```

---

## Manueller Smoke-Test (nach Abschluss)

1. App neu starten (bzw. uvicorn-Reload abwarten), einen Crawl auf einem größeren Ordner anstoßen: Das Panel zeigt jetzt während der Scan-Phase laufend `Scanning: …pfad (N checked)` mit Indeterminate-Balken, danach wie gehabt `Processed: …` mit Prozent-Balken.
2. Zwei Jobs parallel laufen lassen (z. B. Crawl + OCR-Rescan): beide erscheinen als eigene Karten mit eigenem Cancel-Button.
3. EMBED-Job anstoßen: erscheint als „Embedding" statt „embed".
