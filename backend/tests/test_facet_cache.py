from app.search.facet_cache import FacetCache


def test_cache_miss_then_hit():
    c = FacetCache(maxsize=4)
    assert c.get(("q", ())) is None
    c.set(("q", ()), {"doc_types": []})
    assert c.get(("q", ())) == {"doc_types": []}

def test_invalidate_clears_all():
    c = FacetCache(maxsize=4)
    c.set(("q", ()), {"a": 1})
    c.invalidate()
    assert c.get(("q", ())) is None

def test_maxsize_evicts_oldest():
    c = FacetCache(maxsize=2)
    c.set(("a",), {}); c.set(("b",), {}); c.set(("c",), {})
    assert c.get(("a",)) is None and c.get(("c",)) == {}
