from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.documents.models import SavedSearch
from app.search.service import SearchFilters, SearchService

router = APIRouter(prefix="/api", tags=["search"])


# --- Pydantic models ---

class SavedSearchCreate(BaseModel):
    name: str
    query: str  # JSON string of filter state


class SavedSearchResponse(BaseModel):
    id: int
    name: str
    query: str
    created_at: str


# --- Search endpoints ---

@router.get("/search")
async def search(
    q: str = "",
    category: str | None = None,
    doc_type: str | None = None,
    year_min: int | None = None,
    year_max: int | None = None,
    language: str | None = None,
    author: str | None = None,
    offset: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> dict:
    filters = SearchFilters(
        category=category,
        doc_type=doc_type,
        year_min=year_min,
        year_max=year_max,
        language=language,
        author=author,
    )
    service = SearchService(db)
    result = await service.search(q, filters, offset, limit)
    return {
        "documents": result.documents,
        "total": result.total,
        "facets": result.facets,
        "query": q,
    }


@router.get("/search/facets")
async def search_facets(
    q: str = "",
    category: str | None = None,
    doc_type: str | None = None,
    year_min: int | None = None,
    year_max: int | None = None,
    language: str | None = None,
    author: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    filters = SearchFilters(
        category=category,
        doc_type=doc_type,
        year_min=year_min,
        year_max=year_max,
        language=language,
        author=author,
    )
    service = SearchService(db)
    facets = await service.get_facets(query=q, filters=filters)
    return facets


# --- Saved searches endpoints ---

@router.post("/saved-searches")
async def create_saved_search(
    body: SavedSearchCreate,
    db: AsyncSession = Depends(get_db),
) -> SavedSearchResponse:
    saved = SavedSearch(name=body.name, query=body.query)
    db.add(saved)
    await db.commit()
    await db.refresh(saved)
    return SavedSearchResponse(
        id=saved.id,
        name=saved.name,
        query=saved.query,
        created_at=saved.created_at,
    )


@router.get("/saved-searches")
async def list_saved_searches(
    db: AsyncSession = Depends(get_db),
) -> list[SavedSearchResponse]:
    result = await db.execute(
        select(SavedSearch).order_by(SavedSearch.created_at.desc())
    )
    searches = result.scalars().all()
    return [
        SavedSearchResponse(
            id=s.id,
            name=s.name,
            query=s.query,
            created_at=s.created_at,
        )
        for s in searches
    ]


@router.get("/saved-searches/{search_id}")
async def get_saved_search(
    search_id: int,
    db: AsyncSession = Depends(get_db),
) -> SavedSearchResponse:
    result = await db.execute(select(SavedSearch).where(SavedSearch.id == search_id))
    saved = result.scalar_one_or_none()
    if saved is None:
        raise HTTPException(status_code=404, detail="Saved search not found")
    return SavedSearchResponse(
        id=saved.id,
        name=saved.name,
        query=saved.query,
        created_at=saved.created_at,
    )


@router.delete("/saved-searches/{search_id}")
async def delete_saved_search(
    search_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(SavedSearch).where(SavedSearch.id == search_id))
    saved = result.scalar_one_or_none()
    if saved is None:
        raise HTTPException(status_code=404, detail="Saved search not found")
    await db.delete(saved)
    await db.commit()
    return {"deleted": True}
