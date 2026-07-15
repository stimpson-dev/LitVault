"""Semantische Suche: Query-Embedding -> VectorIndex-Kandidaten -> SQL-Filter.

Top-K (200) begrenzt bewusst die Ergebnismenge — semantische Suche ist ein
Ranking, keine Vollzählung. Filter/Pagination laufen über die Kandidaten-IDs.
"""
import logging

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.search import embedding_service
from app.search.service import SearchFilters, SearchResult, SearchService, build_filter_clauses
from app.search.vector_index import VECTOR_INDEX

logger = logging.getLogger("litvault.search")

TOP_K = 200

_SELECT_COLUMNS = (
    "d.id, d.file_path, d.file_hash, d.file_type, d.file_size, d.mtime,"
    " d.title, d.authors, d.year, d.doc_type, d.source, d.language,"
    " d.summary, d.has_text, d.doi, d.processing_status,"
    " d.classification_confidence, d.classification_source,"
    " d.created_at, d.updated_at, d.indexed_at,"
    " NULL as title_snippet, NULL as text_snippet, 0 as rank"
)

_EMPTY_FACETS: dict = {"categories": [], "doc_types": [], "years": [], "file_types": [], "statuses": []}


class SemanticSearchService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def search(
        self,
        query: str,
        filters: SearchFilters | None = None,
        offset: int = 0,
        limit: int = 50,
        include_facets: bool = True,
    ) -> SearchResult:
        if filters is None:
            filters = SearchFilters()

        settings = get_settings()
        service = embedding_service.get_embedding_service()
        query_vec = await service.encode_query(query)
        candidates = await VECTOR_INDEX.top_k(
            self.db, query_vec, TOP_K, settings.embedding_model
        )
        if not candidates:
            return SearchResult(documents=[], total=0,
                                facets=dict(_EMPTY_FACETS) if include_facets else {})

        scores = {doc_id: score for doc_id, score in candidates}
        filter_clauses, params = build_filter_clauses(filters)
        filter_sql = " ".join(filter_clauses)
        stmt = text(
            f"SELECT {_SELECT_COLUMNS} FROM documents d"
            " WHERE d.id IN :candidate_ids"
            f" {filter_sql}"
        ).bindparams(bindparam("candidate_ids", expanding=True))
        params["candidate_ids"] = list(scores)

        rows = await self.db.execute(stmt, params)
        documents = [dict(row._mapping) for row in rows]
        for doc in documents:
            doc["rank"] = scores[doc["id"]]
        documents.sort(key=lambda d: d["rank"], reverse=True)

        total = len(documents)
        page = documents[offset:offset + limit]

        facets: dict = {}
        if include_facets:
            facets = await SearchService(self.db).get_facets(
                candidate_ids=[d["id"] for d in documents]
            )
        return SearchResult(documents=page, total=total, facets=facets)
