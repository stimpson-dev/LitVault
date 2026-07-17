import asyncio
import hashlib
import logging
import os
import time
from pathlib import Path
from typing import AsyncGenerator, Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("litvault.crawler")

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".pptx"}


async def hash_file(path: Path) -> str:
    def _hash() -> str:
        sha256 = hashlib.sha256()
        with open(path, "rb") as f:
            while chunk := f.read(8192):
                sha256.update(chunk)
        return sha256.hexdigest()

    return await asyncio.wait_for(asyncio.to_thread(_hash), timeout=30)


async def collect_file_meta(path: Path) -> dict:
    return {
        "file_path": path.as_posix(),
        "file_type": path.suffix.lstrip(".").lower(),
        "file_size": path.stat().st_size,
        "mtime": os.path.getmtime(path),
        "file_hash": await hash_file(path),
    }


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


async def find_new_files(
    folder: str | Path,
    db: AsyncSession,
    on_progress: Callable[[int, int, str], None] | None = None,
) -> list[dict]:
    result = await db.execute(
        text("SELECT file_path, file_hash, excluded FROM documents")
    )
    rows = result.fetchall()
    existing = {row[0]: row[1] for row in rows}
    excluded_paths = {row[0] for row in rows if row[2]}

    new_files: list[dict] = []
    async for meta in scan_folder(folder, on_progress=on_progress):
        path_str = meta["file_path"]
        if path_str in excluded_paths:
            continue  # skip files the user has excluded
        if path_str not in existing or existing[path_str] != meta["file_hash"]:
            new_files.append(meta)

    return new_files
