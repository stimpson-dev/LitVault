from pathlib import Path
from typing import Callable, Awaitable

from .models import ParseResult
from .pdf_parser import parse_pdf_async
from .office_parser import parse_docx_async, parse_pptx_async


PARSERS: dict[str, Callable[[Path], Awaitable[ParseResult]]] = {
    "pdf": parse_pdf_async,
    "docx": parse_docx_async,
    "pptx": parse_pptx_async,
}


async def parse_document(path: Path, file_type: str) -> ParseResult:
    parser = PARSERS.get(file_type)
    if not parser:
        return ParseResult(error=f"Unsupported type: {file_type}")
    return await parser(path)


__all__ = ["ParseResult", "PARSERS", "parse_document"]
