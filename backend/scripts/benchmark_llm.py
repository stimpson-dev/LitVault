"""LLM-Benchmark: Klassifikationsqualität + Tempo je Modell auf echten Dokumenten.

Aufruf: .venv\\Scripts\\python scripts\\benchmark_llm.py
Modelle/Parameter unten anpassen. DB wird read-only geöffnet.
"""
import asyncio
import json
import sqlite3
import time
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.classification.ollama_client import OllamaClient
from app.classification.schemas import ClassificationResult, build_prompt
from app.classification.service import truncate_text

MODELS = ["qwen3:4b", "qwen3.5:4b", "qwen3.5:9b"]
MAX_CHARS_VARIANTS = [2000, 6000]
N_DOCS = 20

con = sqlite3.connect("file:litvault.db?mode=ro", uri=True)
docs = con.execute(
    "SELECT id, file_path, full_text FROM documents"
    " WHERE full_text IS NOT NULL AND length(full_text) > 500 AND excluded = 0"
    " ORDER BY RANDOM() LIMIT ?", (N_DOCS,)
).fetchall()
print(f"{len(docs)} Dokumente geladen\n")

FIELDS = ["title", "authors", "year", "doc_type", "summary", "categories", "tags"]


def fill_rate(r: ClassificationResult) -> float:
    filled = sum(1 for f in FIELDS if getattr(r, f) not in (None, "", [], 0))
    return filled / len(FIELDS)


async def run(model: str, max_chars: int) -> None:
    num_ctx = 8192 if max_chars > 3000 else 4096
    client = OllamaClient(model=model, num_ctx=num_ctx)
    times, fills, errors = [], [], 0
    schema = ClassificationResult.model_json_schema()
    for doc_id, path, text in docs:
        prompt = build_prompt(truncate_text(text, max_chars))
        t0 = time.perf_counter()
        try:
            raw = await client.generate(prompt, json_schema=schema)
            result = ClassificationResult.model_validate(raw)
            fills.append(fill_rate(result))
        except Exception as e:
            errors += 1
            print(f"  FEHLER doc {doc_id}: {e}")
        times.append(time.perf_counter() - t0)
    await client.close()
    avg_t = sum(times) / len(times)
    avg_f = sum(fills) / len(fills) if fills else 0
    print(f"{model:<14} chars={max_chars:<5} ctx={num_ctx:<5}"
          f" {avg_t:>6.1f}s/Dok  Ausfuellung {avg_f:>5.1%}  Fehler {errors}")


async def main() -> None:
    for model in MODELS:
        for mc in MAX_CHARS_VARIANTS:
            await run(model, mc)

asyncio.run(main())
