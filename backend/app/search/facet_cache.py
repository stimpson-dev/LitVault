"""In-Memory-Facetten-Cache mit Generation-Counter.

Facetten ändern sich nur, wenn Dokumente/Tags/Kategorien geschrieben werden.
Jeder Schreibpfad ruft FACET_CACHE.invalidate() auf; das erhöht die Generation
und macht alle Einträge unauffindbar (lazy eviction via OrderedDict).
"""
from collections import OrderedDict


class FacetCache:
    def __init__(self, maxsize: int = 128) -> None:
        self._data: OrderedDict[tuple, dict] = OrderedDict()
        self._generation = 0
        self._maxsize = maxsize

    def get(self, key: tuple) -> dict | None:
        return self._data.get((self._generation, *key))

    def set(self, key: tuple, value: dict) -> None:
        full_key = (self._generation, *key)
        self._data[full_key] = value
        while len(self._data) > self._maxsize:
            self._data.popitem(last=False)

    def invalidate(self) -> None:
        self._generation += 1
        self._data.clear()


FACET_CACHE = FacetCache()
