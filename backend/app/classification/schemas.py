from pydantic import BaseModel

DOC_TYPES = [
    "dissertation",
    "paper",
    "norm",
    "bericht",
    "präsentation",
    "artikel",
    "interne_notiz",
]

CATEGORIES = [
    "Verzahnungsgrundlagen",
    "Kegelrad / Hypoid / Stirnrad",
    "Tragbild / Kontakt / NVH",
    "FEM / Spannungen / Lebensdauer",
    "Werkstoffe / Wärmebehandlung",
    "Fertigung / Schleifen / Honen / Härten",
    "Prüfstand / Versuch / Schadensanalyse",
    "Normen / ISO / DIN / AGMA / FVA",
    "Anwendungen / Differential / E-Achse / Nutzfahrzeug",
    "Interne Berichte / Projektdokumente",
]


class ClassificationResult(BaseModel):
    doc_type: str
    categories: list[str]
    tags: list[str]
    summary: str
    title: str
    authors: list[str]
    year: int | None = None
    source: str | None = None
    confidence: float


CLASSIFICATION_PROMPT = """Analyze this engineering/scientific document excerpt and extract structured metadata.

DOCUMENT TYPES (pick exactly one):
{doc_types}

CATEGORIES (pick 1-3 from this list only):
{categories}

RULES:
- Extract title, authors, year, and source/journal if present
- Generate 3-8 keyword tags relevant to the content
- Write a 2-3 sentence summary in the document's language
- Set confidence between 0.0 and 1.0 based on how clearly you can identify the metadata
- If information is unclear or missing, use null/empty and lower confidence

DOCUMENT TEXT:
{text}"""


def build_prompt(text: str) -> str:
    return CLASSIFICATION_PROMPT.format(
        doc_types="\n".join(f"- {dt}" for dt in DOC_TYPES),
        categories="\n".join(f"- {cat}" for cat in CATEGORIES),
        text=text,
    )
