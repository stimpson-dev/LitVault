import { useState } from 'react';
import { useSearch } from './hooks/useSearch';
import { SearchBar } from './components/SearchBar';
import { FilterSidebar } from './components/FilterSidebar';
import { FilterChips } from './components/FilterChips';
import { ResultsList } from './components/ResultsList';
import { DocumentDetail } from './components/DocumentDetail';

function App() {
  const search = useSearch();
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top bar with search */}
      <header className="border-b border-zinc-800 p-4">
        <SearchBar
          query={search.query}
          onQueryChange={search.setQuery}
          resultCount={search.results?.total}
        />
      </header>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: filters */}
        <aside className="w-72 border-r border-zinc-800 overflow-y-auto">
          <FilterSidebar
            facets={search.results?.facets}
            filters={search.filters}
            onFilterChange={search.setFilters}
          />
        </aside>

        {/* Center: results */}
        <main className="flex-1 overflow-y-auto">
          <FilterChips
            filters={search.filters}
            onFilterChange={search.setFilters}
          />
          <ResultsList
            documents={search.results?.documents}
            total={search.results?.total}
            loading={search.loading}
            offset={search.offset}
            onLoadMore={() => search.setOffset(search.offset + 50)}
            onSelect={setSelectedDocId}
          />
        </main>

        {/* Right panel: document detail */}
        {selectedDocId !== null && (
          <aside className="w-[400px] border-l border-zinc-800 overflow-y-auto">
            <DocumentDetail
              docId={selectedDocId}
              onClose={() => setSelectedDocId(null)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

export default App;
