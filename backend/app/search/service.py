import logging
from dataclasses import astuple, dataclass, field

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.search.facet_cache import FACET_CACHE
from app.search.sanitizer import sanitize_fts5_query_with_prefix as sanitize_fts5_query

logger = logging.getLogger("litvault.search")


@dataclass
class SearchFilters:
    category: str | None = None
    doc_type: str | None = None
    year_min: int | None = None
    year_max: int | None = None
    language: str | None = None
    author: str | None = None
    has_text: bool | None = None
    classification_source: str | None = None
    file_type: str | None = None
    processing_status: str | None = None
    file_size_min: int | None = None
    file_size_max: int | None = None
    created_after: str | None = None
    created_before: str | None = None


@dataclass
class SearchResult:
    documents: list[dict]
    total: int
    facets: dict


def build_filter_clauses(filters: SearchFilters) -> tuple[list[str], dict]:
    """Metadaten-Filter als SQL-Fragmente (Alias d) + Bind-Parameter."""
    params: dict = {}
    filter_clauses: list[str] = ["AND d.excluded = 0"]

    if filters.doc_type is not None:
        filter_clauses.append("AND d.doc_type = :doc_type")
        params["doc_type"] = filters.doc_type

    if filters.year_min is not None:
        filter_clauses.append("AND d.year >= :year_min")
        params["year_min"] = filters.year_min

    if filters.year_max is not None:
        filter_clauses.append("AND d.year <= :year_max")
        params["year_max"] = filters.year_max

    if filters.language is not None:
        filter_clauses.append("AND d.language = :language")
        params["language"] = filters.language

    if filters.author is not None:
        filter_clauses.append("AND d.authors LIKE :author_pattern")
        params["author_pattern"] = f"%{filters.author}%"

    if filters.has_text is not None:
        filter_clauses.append("AND d.has_text = :has_text")
        params["has_text"] = filters.has_text

    if filters.classification_source is not None:
        filter_clauses.append("AND d.classification_source = :classification_source")
        params["classification_source"] = filters.classification_source

    if filters.file_type is not None:
        filter_clauses.append("AND d.file_type = :file_type")
        params["file_type"] = filters.file_type

    if filters.processing_status is not None:
        filter_clauses.append("AND d.processing_status = :processing_status")
        params["processing_status"] = filters.processing_status

    if filters.file_size_min is not None:
        filter_clauses.append("AND d.file_size >= :file_size_min")
        params["file_size_min"] = filters.file_size_min

    if filters.file_size_max is not None:
        filter_clauses.append("AND d.file_size <= :file_size_max")
        params["file_size_max"] = filters.file_size_max

    if filters.created_after is not None:
        filter_clauses.append("AND d.created_at >= :created_after")
        params["created_after"] = filters.created_after

    if filters.created_before is not None:
        filter_clauses.append("AND d.created_at <= :created_before")
        params["created_before"] = filters.created_before

    if filters.category is not None:
        filter_clauses.append(
            "AND d.id IN ("
            "SELECT dc.document_id FROM document_categories dc "
            "JOIN categories c ON c.id = dc.category_id "
            "WHERE c.name = :category"
            ")"
        )
        params["category"] = filters.category

    return filter_clauses, params


class SearchService:
    def __init__(self, db: AsyncSession):
        self.db = db

    SORT_MAP = {
        "date_desc": "d.created_at DESC",
        "date_asc": "d.created_at ASC",
        "name_asc": "COALESCE(d.title, d.file_path) ASC",
        "name_desc": "COALESCE(d.title, d.file_path) DESC",
    }

    async def search(
        self,
        query: str,
        filters: SearchFilters | None = None,
        offset: int = 0,
        limit: int = 50,
        sort: str = "date_desc",
        include_facets: bool = True,
    ) -> SearchResult:
        if filters is None:
            filters = SearchFilters()

        sanitized = sanitize_fts5_query(query)
        filter_clauses, params = build_filter_clauses(filters)

        filter_sql = " ".join(filter_clauses)

        # Determine ORDER BY clause
        if sort == "relevance" and sanitized:
            order_by = "rank"
        else:
            order_by = self.SORT_MAP.get(sort, "d.created_at DESC")

        if sanitized:
            params["query"] = sanitized
            # Two-stage query: the inner subquery picks ONLY the ids of the
            # result page (sorted + paginated, without snippet); the outer
            # query computes snippet()/bm25() just for those rows. This avoids
            # materializing snippet() for every FTS match before sorting.
            if sort == "relevance":
                # "rank" alias does not exist inside the subquery — sort by
                # the bm25() expression there, by the alias outside.
                inner_order = "bm25(documents_fts, 10.0, 5.0, 1.0, 2.0, 8.0)"
                outer_order = "rank"
            else:
                inner_order = self.SORT_MAP.get(sort, "d.created_at DESC")
                outer_order = inner_order
            select_sql = (
                "WITH page(id) AS ("
                " SELECT d.id"
                " FROM documents_fts"
                " JOIN documents d ON d.id = documents_fts.rowid"
                " WHERE documents_fts MATCH :query"
                f" {filter_sql}"
                f" ORDER BY {inner_order}"
                " LIMIT :limit OFFSET :offset"
                ")"
                " SELECT d.id, d.file_path, d.file_hash, d.file_type, d.file_size, d.mtime,"
                " d.title, d.authors, d.year, d.doc_type, d.source, d.language,"
                " d.summary, d.has_text, d.doi, d.processing_status,"
                " d.classification_confidence, d.classification_source,"
                " d.created_at, d.updated_at, d.indexed_at,"
                " snippet(documents_fts, 0, '<mark>', '</mark>', '...', 32) as title_snippet,"
                " snippet(documents_fts, 2, '<mark>', '</mark>', '...', 64) as text_snippet,"
                " bm25(documents_fts, 10.0, 5.0, 1.0, 2.0, 8.0) as rank"
                " FROM documents_fts"
                " JOIN page ON documents_fts.rowid = page.id"
                " JOIN documents d ON d.id = page.id"
                " WHERE documents_fts MATCH :query"
                f" ORDER BY {outer_order}"
            )
            already_paginated = True
            count_sql = (
                "SELECT COUNT(*)"
                " FROM documents_fts"
                " JOIN documents d ON d.id = documents_fts.rowid"
                " WHERE documents_fts MATCH :query"
                f" {filter_sql}"
            )
        else:
            select_sql = (
                "SELECT d.id, d.file_path, d.file_hash, d.file_type, d.file_size, d.mtime,"
                " d.title, d.authors, d.year, d.doc_type, d.source, d.language,"
                " d.summary, d.has_text, d.doi, d.processing_status,"
                " d.classification_confidence, d.classification_source,"
                " d.created_at, d.updated_at, d.indexed_at,"
                " NULL as title_snippet, NULL as text_snippet, 0 as rank"
                " FROM documents d"
                " WHERE 1=1"
                f" {filter_sql}"
                f" ORDER BY {order_by}"
            )
            count_sql = (
                "SELECT COUNT(*)"
                " FROM documents d"
                " WHERE 1=1"
                f" {filter_sql}"
            )
            already_paginated = False

        paginated_sql = select_sql if already_paginated else select_sql + " LIMIT :limit OFFSET :offset"
        params["limit"] = limit
        params["offset"] = offset

        try:
            rows = await self.db.execute(text(paginated_sql), params)
            documents = [dict(row._mapping) for row in rows]

            count_params = {k: v for k, v in params.items() if k not in ("limit", "offset")}
            count_row = await self.db.execute(text(count_sql), count_params)
            total = count_row.scalar() or 0
        except Exception as exc:
            logger.error("Search query failed: %s", exc)
            documents = []
            total = 0

        facets = await self.get_facets(query=query, filters=filters) if include_facets else {}

        return SearchResult(documents=documents, total=total, facets=facets)

    async def get_facets(
        self,
        query: str = "",
        filters: SearchFilters | None = None,
    ) -> dict:
        if filters is None:
            filters = SearchFilters()

        cache_key = (query, astuple(filters))
        cached = FACET_CACHE.get(cache_key)
        if cached is not None:
            return cached

        sanitized = sanitize_fts5_query(query)
        filter_clauses, params = build_filter_clauses(filters)

        filter_sql = " ".join(filter_clauses)

        cte = ""
        if sanitized:
            params["query"] = sanitized
            cte = ("WITH matched(rowid) AS ("
                   "SELECT documents_fts.rowid FROM documents_fts WHERE documents_fts MATCH :query) ")
            fts_subquery = "AND d.id IN (SELECT rowid FROM matched)"
        else:
            fts_subquery = ""

        union_sql = cte + " UNION ALL ".join([
            ("SELECT 'categories' AS facet, c.name AS name, COUNT(*) AS count"
             " FROM document_categories dc"
             " JOIN categories c ON c.id = dc.category_id"
             " JOIN documents d ON d.id = dc.document_id"
             f" WHERE d.processing_status = 'done' {fts_subquery} {filter_sql}"
             " GROUP BY c.name"),
            ("SELECT 'doc_types', d.doc_type, COUNT(*) FROM documents d"
             f" WHERE d.processing_status = 'done' AND d.doc_type IS NOT NULL {fts_subquery} {filter_sql}"
             " GROUP BY d.doc_type"),
            ("SELECT 'years', d.year, COUNT(*) FROM documents d"
             f" WHERE d.processing_status = 'done' AND d.year IS NOT NULL {fts_subquery} {filter_sql}"
             " GROUP BY d.year"),
            ("SELECT 'file_types', d.file_type, COUNT(*) FROM documents d"
             f" WHERE 1=1 {fts_subquery} {filter_sql} AND d.file_type IS NOT NULL"
             " GROUP BY d.file_type"),
            ("SELECT 'statuses', d.processing_status, COUNT(*) FROM documents d"
             f" WHERE 1=1 {fts_subquery} {filter_sql}"
             " GROUP BY d.processing_status"),
        ])

        facets: dict = {"categories": [], "doc_types": [], "years": [], "file_types": [], "statuses": []}
        try:
            rows = await self.db.execute(text(union_sql), params)
            for facet, name, count in rows:
                facets[facet].append({"name": name, "count": count})
            for key in ("categories", "doc_types", "file_types", "statuses"):
                facets[key].sort(key=lambda e: e["count"], reverse=True)
            facets["years"].sort(key=lambda e: e["name"], reverse=True)
            FACET_CACHE.set(cache_key, facets)
        except Exception as exc:
            logger.error("Facet query failed: %s", exc)
        return facets
