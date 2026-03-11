import logging
from dataclasses import dataclass, field

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

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
    ) -> SearchResult:
        if filters is None:
            filters = SearchFilters()

        sanitized = sanitize_fts5_query(query)
        params: dict = {}
        filter_clauses: list[str] = ["AND d.excluded = 0"]

        # Build metadata filter clauses (always applied to the documents table alias d)
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

        filter_sql = " ".join(filter_clauses)

        # Determine ORDER BY clause
        if sort == "relevance" and sanitized:
            order_by = "rank"
        else:
            order_by = self.SORT_MAP.get(sort, "d.created_at DESC")

        if sanitized:
            params["query"] = sanitized
            select_sql = (
                "SELECT d.id, d.file_path, d.file_hash, d.file_type, d.file_size, d.mtime,"
                " d.title, d.authors, d.year, d.doc_type, d.source, d.language,"
                " d.summary, d.has_text, d.doi, d.processing_status,"
                " d.classification_confidence, d.classification_source,"
                " d.created_at, d.updated_at, d.indexed_at,"
                " snippet(documents_fts, 0, '<mark>', '</mark>', '...', 32) as title_snippet,"
                " snippet(documents_fts, 2, '<mark>', '</mark>', '...', 64) as text_snippet,"
                " bm25(documents_fts, 10.0, 5.0, 1.0, 2.0, 8.0) as rank"
                " FROM documents_fts"
                " JOIN documents d ON d.id = documents_fts.rowid"
                " WHERE documents_fts MATCH :query"
                f" {filter_sql}"
                f" ORDER BY {order_by}"
            )
            count_sql = (
                "SELECT COUNT(*)"
                " FROM documents_fts"
                " JOIN documents d ON d.id = documents_fts.rowid"
                " WHERE documents_fts MATCH :query"
                f" {filter_sql}"
            )
        else:
            select_sql = (
                "SELECT d.*, NULL as title_snippet, NULL as text_snippet, 0 as rank"
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

        paginated_sql = select_sql + " LIMIT :limit OFFSET :offset"
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

        facets = await self.get_facets(query=query, filters=filters)

        return SearchResult(documents=documents, total=total, facets=facets)

    async def get_facets(
        self,
        query: str = "",
        filters: SearchFilters | None = None,
    ) -> dict:
        if filters is None:
            filters = SearchFilters()

        sanitized = sanitize_fts5_query(query)
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

        filter_sql = " ".join(filter_clauses)

        # For FTS-filtered facets we need to restrict to matching document IDs
        if sanitized:
            params["query"] = sanitized
            fts_join = (
                " JOIN documents_fts fts ON fts.rowid = d.id"
                " AND documents_fts MATCH :query"
            )
            fts_subquery = (
                "AND d.id IN ("
                "SELECT documents_fts.rowid FROM documents_fts WHERE documents_fts MATCH :query"
                ")"
            )
        else:
            fts_join = ""
            fts_subquery = ""

        category_sql = (
            "SELECT c.name, COUNT(*) as count"
            " FROM document_categories dc"
            " JOIN categories c ON c.id = dc.category_id"
            " JOIN documents d ON d.id = dc.document_id"
            " WHERE d.processing_status = 'done'"
            f" {fts_subquery}"
            f" {filter_sql}"
            " GROUP BY c.name ORDER BY count DESC"
        )

        doc_type_sql = (
            "SELECT d.doc_type AS name, COUNT(*) as count"
            " FROM documents d"
            " WHERE d.processing_status = 'done'"
            " AND d.doc_type IS NOT NULL"
            f" {fts_subquery}"
            f" {filter_sql}"
            " GROUP BY d.doc_type ORDER BY count DESC"
        )

        year_sql = (
            "SELECT d.year AS name, COUNT(*) as count"
            " FROM documents d"
            " WHERE d.processing_status = 'done'"
            " AND d.year IS NOT NULL"
            f" {fts_subquery}"
            f" {filter_sql}"
            " GROUP BY d.year ORDER BY d.year DESC"
        )

        file_type_sql = (
            "SELECT d.file_type AS name, COUNT(*) as count"
            " FROM documents d"
            " WHERE 1=1"
            f" {fts_subquery}"
            f" {filter_sql}"
            " AND d.file_type IS NOT NULL"
            " GROUP BY d.file_type ORDER BY count DESC"
        )

        status_sql = (
            "SELECT d.processing_status AS name, COUNT(*) as count"
            " FROM documents d"
            " WHERE 1=1"
            f" {fts_subquery}"
            f" {filter_sql}"
            " GROUP BY d.processing_status ORDER BY count DESC"
        )

        facets: dict = {"categories": [], "doc_types": [], "years": [], "file_types": [], "statuses": []}

        try:
            cat_rows = await self.db.execute(text(category_sql), params)
            facets["categories"] = [dict(row._mapping) for row in cat_rows]

            dt_rows = await self.db.execute(text(doc_type_sql), params)
            facets["doc_types"] = [dict(row._mapping) for row in dt_rows]

            yr_rows = await self.db.execute(text(year_sql), params)
            facets["years"] = [dict(row._mapping) for row in yr_rows]

            ft_rows = await self.db.execute(text(file_type_sql), params)
            facets["file_types"] = [dict(row._mapping) for row in ft_rows]

            st_rows = await self.db.execute(text(status_sql), params)
            facets["statuses"] = [dict(row._mapping) for row in st_rows]
        except Exception as exc:
            logger.error("Facet query failed: %s", exc)

        return facets
