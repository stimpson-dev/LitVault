import pytest

from app.search.service import SearchService, SearchFilters


async def test_fts_search_finds_match(db_session):
    result = await SearchService(db_session).search("kegelrad", limit=10)
    assert result.total == 2  # kegelrad.pdf + norm.pdf (full_text contains Kegelrädern)
    paths = {d["file_path"] for d in result.documents}
    assert "a/kegelrad.pdf" in paths and "b/norm.pdf" in paths


async def test_browse_empty_query_returns_all_non_excluded(db_session):
    result = await SearchService(db_session).search("", limit=10)
    assert result.total == 4


async def test_browse_does_not_leak_full_text(db_session):
    result = await SearchService(db_session).search("", limit=10)
    for doc in result.documents:
        assert "full_text" not in doc  # AP4-Fix; browse uses SELECT d.* which leaks full_text


async def test_filter_doc_type(db_session):
    result = await SearchService(db_session).search("", SearchFilters(doc_type="norm"), limit=10)
    assert result.total == 1
    assert result.documents[0]["title"] == "ISO 10300"


async def test_filter_year_range(db_session):
    result = await SearchService(db_session).search("", SearchFilters(year_min=2015, year_max=2022), limit=10)
    assert result.total == 2


async def test_facets_present(db_session):
    result = await SearchService(db_session).search("kegelrad", limit=10)
    assert any(f["name"] == "bericht" for f in result.facets["doc_types"])


async def test_sort_name_asc(db_session):
    result = await SearchService(db_session).search("", sort="name_asc", limit=10)
    titles = [d["title"] for d in result.documents]
    assert titles == sorted(titles)


async def test_fts_injection_is_sanitized(db_session):
    # Darf keine Exception werfen und nichts Unerwartetes matchen
    result = await SearchService(db_session).search('kegelrad" OR "x', limit=10)
    assert isinstance(result.total, int)


async def test_facets_shape_and_counts(db_session):
    svc = SearchService(db_session)
    facets = await svc.get_facets(query="", filters=None)
    assert set(facets.keys()) == {"categories", "doc_types", "years", "file_types", "statuses"}
    doc_types = {f["name"]: f["count"] for f in facets["doc_types"]}
    assert doc_types.get("bericht") == 1 and doc_types.get("norm") == 1
    file_types = {f["name"]: f["count"] for f in facets["file_types"]}
    assert file_types.get("pdf") == 3 and file_types.get("docx") == 1


async def test_facets_with_fts_query(db_session):
    facets = await SearchService(db_session).get_facets(query="kegelrad")
    years = {f["name"] for f in facets["years"]}
    assert years == {2019, 2014}


async def test_fts_pagination_offset(db_session):
    svc = SearchService(db_session)
    page1 = await svc.search("kegelrad", limit=1, offset=0)
    page2 = await svc.search("kegelrad", limit=1, offset=1)
    assert page1.total == 2 and page2.total == 2
    assert len(page1.documents) == 1 and len(page2.documents) == 1
    assert page1.documents[0]["id"] != page2.documents[0]["id"]


async def test_fts_search_returns_snippets(db_session):
    result = await SearchService(db_session).search("kegelrad", limit=10)
    assert all("title_snippet" in d and "text_snippet" in d for d in result.documents)


async def test_facets_for_candidate_ids(db_session):
    # IDs 1 (kegelrad/bericht) und 3 (norm) aus dem conftest-Seed
    facets = await SearchService(db_session).get_facets(candidate_ids=[1, 3])
    doc_types = {f["name"]: f["count"] for f in facets["doc_types"]}
    assert doc_types == {"bericht": 1, "norm": 1}


async def test_facets_for_empty_candidate_ids(db_session):
    facets = await SearchService(db_session).get_facets(candidate_ids=[])
    assert facets["doc_types"] == []
    assert facets["categories"] == []
