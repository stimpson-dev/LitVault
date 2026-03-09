import asyncio
import hashlib
import logging
import os
from pathlib import Path
from typing import AsyncGenerator

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


async def scan_folder(folder: str | Path) -> AsyncGenerator[dict, None]:
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

    for dirpath, _dirnames, filenames in entries:
        for filename in filenames:
            path = Path(dirpath) / filename
            if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue
            try:
                meta = await collect_file_meta(path)
                yield meta
            except asyncio.TimeoutError:
                logger.warning("Timeout hashing file, skipping: %s", path)
            except PermissionError as exc:
                logger.warning("Permission error, skipping %s: %s", path, exc)
            except Exception as exc:
                logger.warning("Failed to collect meta for %s: %s", path, exc)


async def find_new_files(folder: str | Path, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        text("SELECT file_path, file_hash FROM documents")
    )
    existing = {row[0]: row[1] for row in result.fetchall()}

    new_files: list[dict] = []
    async for meta in scan_folder(folder):
        path_str = meta["file_path"]
        if path_str not in existing or existing[path_str] != meta["file_hash"]:
            new_files.append(meta)

    return new_files
