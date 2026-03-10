import re
from dataclasses import dataclass


@dataclass
class FilenameMetadata:
    title: str | None = None
    year: int | None = None
    doc_type: str | None = None


def extract_from_filename(filename: str) -> FilenameMetadata:
    """Extract metadata from a document filename."""
    # Remove extension
    name = re.sub(r'\.[^.]+$', '', filename)

    # Extract year (4-digit number 1900-2099)
    year = None
    year_match = re.search(r'\b(19\d{2}|20\d{2})\b', name)
    if year_match:
        year = int(year_match.group(1))

    # Clean title: remove date prefixes like "20170718", underscores, extra spaces
    title = name
    title = re.sub(r'^\d{6,8}\s*', '', title)  # Remove leading date like 20170718
    title = title.replace('_', ' ')
    title = re.sub(r'\s+', ' ', title).strip()
    title = title.strip('- ')

    # Doc type heuristics from filename patterns
    doc_type = None
    lower = name.lower()
    if 'fva-heft' in lower or 'fva heft' in lower:
        doc_type = 'report'
        # For FVA: extract the actual title part after the number
        fva_match = re.search(r'FVA[- ]Heft\s+\d+\s*[-–]\s*(.+)', name, re.IGNORECASE)
        if fva_match:
            title = fva_match.group(1).strip()
    elif 'analyse' in lower or 'analysis' in lower or 'bericht' in lower or 'report' in lower:
        doc_type = 'report'
    elif 'präsentation' in lower or 'presentation' in lower:
        doc_type = 'presentation'
    elif 'dissertation' in lower or 'diss' in lower:
        doc_type = 'dissertation'
    elif 'handbuch' in lower or 'manual' in lower or 'guide' in lower:
        doc_type = 'manual'

    if not title:
        title = name

    return FilenameMetadata(title=title, year=year, doc_type=doc_type)
