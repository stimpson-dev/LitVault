from dataclasses import dataclass, field


@dataclass
class ParseResult:
    text: str = ""
    page_count: int = 0
    has_text: bool = False
    ocr_pages: list[int] = field(default_factory=list)
    error: str | None = None
