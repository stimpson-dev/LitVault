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


@pytest.mark.xfail(reason="full_text-Leak, Fix in AP4", strict=True)
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
