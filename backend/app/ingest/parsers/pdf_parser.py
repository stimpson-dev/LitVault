import asyncio
import logging
import numpy as np
import re
import unicodedata
from pathlib import Path

import fitz  # PyMuPDF
fitz.TOOLS.mupdf_display_errors(False)  # suppress C-level ICC profile warnings on stderr
import pymupdf4llm
from PIL import Image

from .models import ParseResult

logger = logging.getLogger("litvault.parser.pdf")

# Lazy-loaded EasyOCR reader (heavy model, load once)
_ocr_reader = None


def _get_ocr():
    """Lazy-init EasyOCR with German+English support."""
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        import torch

        use_gpu = torch.cuda.is_available()
        _ocr_reader = easyocr.Reader(
            ["de", "en"],
            gpu=use_gpu,
            verbose=False,
        )
        logger.info("EasyOCR initialized (lang=de+en, gpu=%s)", use_gpu)
    return _ocr_reader


def _is_scanned_page(page: fitz.Page) -> bool:
    """Return True if the page appears to be a scanned image needing OCR."""
    text = page.get_text()
    stripped = text.strip()

    # No text at all → scanned
    if len(stripped) < 10:
        return True

    # Text exists but is garbage (low letter ratio) → needs OCR
    if _text_quality(stripped) < 0.15:
        return True

    return False


def _text_quality(text: str) -> float:
    """Return ratio of actual letters to total non-whitespace characters (0.0–1.0)."""
    stripped = text.strip()
    if not stripped:
        return 0.0
    non_ws = sum(1 for ch in stripped if not ch.isspace())
    if non_ws == 0:
        return 0.0
    letters = sum(1 for ch in stripped if ch.isalpha())
    return letters / non_ws


def _normalize_german_text(text: str) -> str:
    """NFC normalize and rejoin hyphenated line breaks (German word wrapping)."""
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    return text


def _ocr_page(page: fitz.Page) -> str:
    """Render page at 200 DPI and run EasyOCR."""
    pixmap = page.get_pixmap(dpi=200)
    img = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
    img_array = np.array(img)
    del img, pixmap

    reader = _get_ocr()
    results = reader.readtext(img_array, detail=1, paragraph=False)

    if not results:
        return ""

    # Sort by vertical position (top to bottom), then extract text
    # Each result: (bbox, text, confidence)
    results.sort(key=lambda r: r[0][0][1])  # sort by top-left y
    return "\n".join(text for _, text, _ in results)


def parse_pdf(path: Path) -> ParseResult:
    """Parse a PDF file, using pymupdf4llm as primary extractor with OCR fallback."""
    try:
        doc = fitz.open(str(path))

        if doc.is_encrypted:
            if not doc.authenticate(""):
                return ParseResult(error="encrypted")

        page_count = len(doc)

        # Primary: use pymupdf4llm for best markdown/text extraction
        try:
            md_text = pymupdf4llm.to_markdown(str(path))
        except Exception as exc:
            logger.warning("pymupdf4llm failed for %s: %s", path, exc)
            md_text = ""

        # If primary extraction produced enough usable text, use it
        quality = _text_quality(md_text)
        if quality >= 0.15 and len(md_text.strip()) >= 100:
            text = _normalize_german_text(md_text)
            return ParseResult(
                text=text,
                page_count=page_count,
                has_text=len(text.strip()) > 0,
                ocr_pages=[],
            )

        if quality < 0.15:
            logger.info("Low text quality (%.0f%%) for %s — falling back to OCR", quality * 100, path)

        # Fallback: per-page processing with OCR for scanned pages
        MAX_OCR_PAGES = 250
        logger.info("Falling back to per-page OCR for %s (%d pages)", path, page_count)
        page_texts: list[str] = []
        ocr_pages: list[int] = []
        ocr_attempts = 0

        for page_num in range(page_count):
            page = doc[page_num]
            if _is_scanned_page(page) and ocr_attempts < MAX_OCR_PAGES:
                ocr_attempts += 1
                logger.debug("EasyOCR page %d/%d (attempt %d) of %s", page_num, page_count, ocr_attempts, path)
                try:
                    page_text = _ocr_page(page)
                    ocr_pages.append(page_num)
                except Exception as ocr_exc:
                    logger.warning("OCR failed on page %d of %s: %s", page_num, path, ocr_exc)
                    page_text = page.get_text()
            else:
                page_text = page.get_text()
            page_texts.append(page_text)

        text = _normalize_german_text("\n".join(page_texts))
        return ParseResult(
            text=text,
            page_count=page_count,
            has_text=len(text.strip()) > 0,
            ocr_pages=ocr_pages,
        )

    except Exception as exc:
        logger.error("Failed to parse PDF %s: %s", path, exc)
        return ParseResult(error=str(exc))


async def parse_pdf_async(path: Path) -> ParseResult:
    """Async wrapper for parse_pdf with configurable timeout."""
    from app.config import get_settings
    timeout = get_settings().parse_timeout_seconds
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(parse_pdf, path),
            timeout=float(timeout),
        )
    except asyncio.TimeoutError:
        logger.error("Timeout parsing PDF %s (after %ds)", path, timeout)
        return ParseResult(error="timeout")
