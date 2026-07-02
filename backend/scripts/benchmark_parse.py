"""Vergleicht pymupdf4llm.to_markdown vs. plain page.get_text auf echten PDFs.

Aufruf: .venv\\Scripts\\python scripts\\benchmark_parse.py <ordner-mit-pdfs>

Erweiterung: misst zusaetzlich Thread-Skalierung fuer plain get_text
(sequenziell vs. 3 Threads via concurrent.futures.ThreadPoolExecutor).
"""
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import fitz
fitz.TOOLS.mupdf_display_errors(False)
import pymupdf4llm

folder = Path(sys.argv[1])
pdfs = sorted(folder.glob("*.pdf"))[:10]

if not pdfs:
    print(f"Keine PDFs in {folder} gefunden.")
    sys.exit(1)

print(f"\n=== Benchmark 1: pymupdf4llm.to_markdown vs. plain page.get_text ===")
print(f"Ordner: {folder}")
print(f"Dateien: {len(pdfs)}")
print()
print(f"{'Datei':<50} {'Seiten':>6} {'markdown':>10} {'plain':>10} {'Faktor':>7} {'len_md':>9} {'len_plain':>10}")
print("-" * 112)

factors = []
md_times = []
plain_times = []
results = []

for pdf in pdfs:
    doc = fitz.open(str(pdf))
    pages = len(doc)

    t0 = time.perf_counter()
    try:
        md_text = pymupdf4llm.to_markdown(str(pdf))
    except Exception as e:
        md_text = f"FEHLER {e}"
    t_md = time.perf_counter() - t0

    t0 = time.perf_counter()
    plain_text = "\n".join(p.get_text() for p in doc)
    t_plain = time.perf_counter() - t0

    factor = t_md / t_plain if t_plain > 0 else float("inf")
    factors.append(factor)
    md_times.append(t_md)
    plain_times.append(t_plain)
    results.append((pdf.name, pages, t_md, t_plain, factor, len(md_text), len(plain_text)))

    print(f"{pdf.name[:50]:<50} {pages:>6} {t_md:>9.2f}s {t_plain:>9.2f}s {factor:>6.1f}x {len(md_text):>9} {len(plain_text):>10}")
    doc.close()

print("-" * 112)
median_factor = statistics.median(factors)
print(f"\nMedian Faktor markdown/plain: {median_factor:.1f}x")
print(f"Gesamt markdown: {sum(md_times):.2f}s, Gesamt plain: {sum(plain_times):.2f}s")

# -----------------------------------------------------------------------
# Text-Laengen-Qualitaetscheck fuer die ersten 3 Dateien
# -----------------------------------------------------------------------
print(f"\n=== Qualitaetscheck: Textlaenge plain vs. markdown (erste 3 Dateien) ===")
print(f"{'Datei':<50} {'len_md':>9} {'len_plain':>10} {'plain/md':>10} {'OK?':>6}")
print("-" * 90)
for name, pages, t_md, t_plain, factor, len_md, len_plain in results[:3]:
    ratio = len_plain / len_md if len_md > 0 else float("inf")
    ok = "JA" if 0.5 <= ratio <= 2.0 else "PRUEFEN"
    print(f"{name[:50]:<50} {len_md:>9} {len_plain:>10} {ratio:>9.2f}x {ok:>6}")

# -----------------------------------------------------------------------
# Benchmark 2: Thread-Skalierung plain get_text (seq vs. 3 Threads)
# -----------------------------------------------------------------------
print(f"\n=== Benchmark 2: Thread-Skalierung plain get_text ===")
print(f"10 Dateien sequenziell vs. 3 Threads (concurrent.futures.ThreadPoolExecutor)")
print()


def parse_plain(pdf_path: Path) -> tuple[str, int]:
    doc = fitz.open(str(pdf_path))
    text = "\n".join(p.get_text() for p in doc)
    pages = len(doc)
    doc.close()
    return text, pages


# Sequenziell
t0 = time.perf_counter()
for pdf in pdfs:
    parse_plain(pdf)
t_seq = time.perf_counter() - t0

# 3 Threads
t0 = time.perf_counter()
with ThreadPoolExecutor(max_workers=3) as executor:
    list(executor.map(parse_plain, pdfs))
t_par = time.perf_counter() - t0

speedup = t_seq / t_par if t_par > 0 else float("inf")

print(f"{'Variante':<25} {'Dauer (s)':>12} {'Speedup':>10}")
print("-" * 52)
print(f"{'SEQ (1 Thread)':<25} {t_seq:>11.2f}s {'1.00x':>10}")
print(f"{'PAR (3 Threads)':<25} {t_par:>11.2f}s {speedup:>9.2f}x")
print()

# -----------------------------------------------------------------------
# Entscheidung
# -----------------------------------------------------------------------
print(f"\n=== Entscheidung ===")
print(f"Median Faktor markdown/plain: {median_factor:.1f}x")
if median_factor > 3.0:
    print("=> Faktor > 3x: Config-Switch 'pdf_extraction_mode' wird implementiert (Default: 'plain').")
else:
    print("=> Faktor <= 3x: Kein Code-Switch noetig, nur Dokumentation.")

print(f"\nThread-Speedup plain: {speedup:.2f}x")
spec_goal = speedup >= 3.0
print(f"=> Spec-Ziel >=3x {'ERREICHT' if spec_goal else 'NICHT ERREICHT'} mit plain get_text + 3 Threads.")
