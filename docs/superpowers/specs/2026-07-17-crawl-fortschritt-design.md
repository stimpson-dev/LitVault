# LitVault: Crawl-Fortschritt im Jobs-Panel sichtbar machen

**Datum:** 2026-07-17
**Status:** Freigegeben (Ansatz A — Scan-Phase instrumentieren + alle laufenden Jobs anzeigen)
**Scope:** Kleines Paket, zwei Ursachen eines Problems: (1) Die Scan-Phase des Crawls (`find_new_files`) sendet keine Zwischen-Updates — bei Netzlaufwerken minutenlange Funkstille im Jobs-Panel. (2) Das Panel zeigt nur den ersten `processing`-Job; ein zweiter parallel laufender Job (worker_count=2) ist komplett unsichtbar. **Ausgeklammert:** zweiter SSE-Stream pro Job, Job-Detailansichten, Scan-Total-Vorabzählung.

## Kontext & Befund

- Das Jobs-Panel (`JobProgress.tsx`) zeigt für den aktiven Job bereits Balken, Zähler und `progress_message` (SSE, 0,5 s). Die Verarbeitungsphase des Crawls meldet pro Datei `Processed: <pfad>` — funktioniert.
- Die Scan-Phase davor (`find_new_files` → `scan_folder`) meldet nur einmal `Scanning: <folder>` (0/0) und dann nichts mehr. Zeitfresser ist das SHA-256-Hashing **jeder** unterstützten Datei (Änderungserkennung) — bei `Z:\` übers Netz entsprechend lang.
- `JobProgress.tsx` rendert `jobs.find(j => j.status === 'processing')` als einzige Aktiv-Karte; weitere `processing`-Jobs fallen aus allen drei Listen (aktiv/wartend/zuletzt) heraus. Beobachtet am 2026-07-17: zweiter Crawl wartete auf den Crawl-Exklusiv-Lock und war nirgends sichtbar.
- Der 5-Sekunden-Poll (`listJobs`) liefert `progress_current/progress_total/progress_message` bereits für alle Jobs mit.

## Teil 1: Backend — Scan-Phase meldet Fortschritt

### `app/ingest/crawler.py`

- `scan_folder(folder, on_progress: Callable[[int, int, str], None] | None = None)`: In der Datei-Schleife wird zeitgedrosselt gemeldet — höchstens eine Meldung pro Sekunde (`time.monotonic`, Vergleich gegen Zeitstempel der letzten Meldung; kein weiterer State). Meldung exakt: `on_progress(0, 0, f"Scanning: {path} ({checked} checked)")` — englisch, konsistent mit den bestehenden Job-Messages („Processed:", „Found X files") — wobei `checked` die Zahl der bisher geprüften (= unterstützten, nicht übersprungenen) Dateien ist und `path` der aktuelle Dateipfad. `current=0, total=0` bewusst: Das Gesamt-Total ist während des Scans unbekannt; das Panel zeigt bei `total=0` den Indeterminate-Balken statt eines irreführenden „1234/0".
- `find_new_files(folder, db, on_progress=None)`: reicht den Callback an `scan_folder` durch.

### `app/ingest/service.py`

- `ingest_folder` übergibt seinen bestehenden `on_progress` an `find_new_files` weiter (eine Zeile). Alle Meldungen der Verarbeitungsphase bleiben unverändert.

### Kompatibilität

- Callback ist überall optional mit Default `None` → alle bestehenden Aufrufer (Worker, Tests) unverändert lauffähig.

## Teil 2: Frontend — alle laufenden Jobs anzeigen

### `JobProgress.tsx`

- `processingJobs = jobs.filter(j => j.status === 'processing')` ersetzt das einzelne `activeJob`; das Panel rendert eine Aktiv-Karte **pro** laufendem Job.
- Datenquellen: Der bestehende SSE-Stream bleibt unverändert an den ersten laufenden Job gebunden (0,5-s-Updates für dessen Karte). Alle weiteren Karten zeigen die Poll-Daten des Jobs selbst (`job.progress_current/progress_total/progress_message`, alle 5 s aktualisiert). Kein zweiter SSE-Stream (YAGNI).
- Der Header-Punkt („aktiv"-Indikator) und die Cancel-Buttons funktionieren pro Karte (Cancel existiert schon, nur auf die jeweilige Job-ID bezogen).
- Mitnahme im selben Panel: `getTypeLabel` kennt `embed` nicht (zeigt rohes „embed") → Label „Embedding" ergänzen (i18n-Key, de + en).
- Falls der `Job`-Typ in `types.ts` die Felder `progress_current/progress_total/progress_message` noch nicht deklariert: ergänzen (die API liefert sie bereits).

## Fehlerfälle

- `on_progress=None`: identisches Verhalten wie heute (Scan still) — betrifft nur Aufrufer außerhalb des Job-Systems.
- Callback-Fehler werden nicht abgefangen (wie bisher in der Verarbeitungsphase — der Callback ist `store.update_progress`, wirft praktisch nie).

## Tests

- **Backend:** `scan_folder`/`find_new_files` gegen ein tmp-Verzeichnis mit mehreren Dateien und gemocktem `time.monotonic`: (a) es wird gemeldet, mit korrektem Pfad und Zähler im Message-Format, (b) Drosselung — bei unveränderter Fake-Zeit maximal eine Meldung, bei fortschreitender Zeit mehrere, (c) `on_progress=None` läuft fehlerfrei durch (Bestandsverhalten).
- **Frontend:** `tsc -b` + `npm run lint` (keine Frontend-Unit-Tests im Projekt).

## Ausgeklammert (bewusst)

- SSE pro Job (Poll-Daten reichen für Zweitkarten).
- Vorabzählung des Scan-Totals (zweiter kompletter Verzeichnislauf — teuer auf Netzlaufwerken, kein Nutzen).
- Anzeige der Lock-Wartezeit („wartet auf anderen Crawl") — bekanntes M6-Follow-up (`started_at` vor Lock-Wartezeit gestempelt), eigenes Thema.
