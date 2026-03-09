import asyncio
import logging
import re
import unicodedata
from pathlib import Path

import fitz  # PyMuPDF
import pymupdf4llm
from PIL import Image
import pytesseract

from .models import ParseResult

logger = logging.getLogger("litvault.parser.pdf")


def _is_scanned_page(page: fitz.Page) -> bool:
    """Return True if the page appears to be a scanned image needing OCR."""
    text = page.get_text()
    if len(text.strip()) >= 50:
        return False

    # Check if fonts include GlyphlessFont — page was already OCR'd
    fonts = page.get_fonts()
    for font in fonts:
        # font tuple: (xref, ext, type, basefont, name, encoding, referencer)
        font_name = font[3] if len(font) > 3 else ""
        if "GlyphlessFont" in font_name:
            return False

    # Text is sparse and no GlyphlessFont → truly scanned, needs OCR
    return True


def _normalize_german_text(text: str) -> str:
    """NFC normalize and rejoin hyphenated line breaks (German word wrapping)."""
    text = unicodedata.normalize("NFC", text)
    # Rejoin hyphenated line breaks: "Zahn-\nrad" → "Zahnrad"
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    return text


def _ocr_page(page: fitz.Page, languages: str = "deu+eng") -> str:
    """Render page to image and run Tesseract OCR."""
    pixmap = page.get_pixmap(dpi=300)
    img = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
    return pytesseract.image_to_string(img, lang=languages)


def parse_pdf(path: Path) -> ParseResult:
    """Parse a PDF file, using pymupdf4llm as primary extractor with OCR fallback."""
    try:
        doc = fitz.open(str(path))

        if doc.is_encrypted:
            # Try empty password
            if not doc.authenticate(""):
                return ParseResult(error="encrypted")

        page_count = len(doc)

        # Primary: use pymupdf4llm for best markdown/text extraction
        try:
            md_text = pymupdf4llm.to_markdown(str(path))
        except Exception as exc:
            logger.warning("pymupdf4llm failed for %s: %s", path, exc)
            md_text = ""

        # If primary extraction produced enough text, use it
        if len(md_text.strip()) >= 100 or page_count <= 1:
            if len(md_text.strip()) > 0:
                text = _normalize_german_text(md_text)
                return ParseResult(
                    text=text,
                    page_count=page_count,
                    has_text=len(text.strip()) > 0,
                    ocr_pages=[],
                )

        # Fallback: per-page processing with OCR detection
        logger.info("Falling back to per-page processing for %s", path)
        page_texts: list[str] = []
        ocr_pages: list[int] = []

        for page_num in range(page_count):
            page = doc[page_num]
            if _is_scanned_page(page):
                logger.debug("OCR page %d of %s", page_num, path)
                page_text = _ocr_page(page)
                ocr_pages.append(page_num)
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
    """Async wrapper for parse_pdf with a 30-second timeout."""
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(parse_pdf, path),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        logger.error("Timeout parsing PDF %s", path)
        return ParseResult(error="timeout")
