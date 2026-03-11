import { useState } from 'react';
import { useSearch } from './hooks/useSearch';
import { useTheme } from './hooks/useTheme';
import { SearchBar } from './components/SearchBar';
import { FilterSidebar } from './components/FilterSidebar';
import { FilterChips } from './components/FilterChips';
import { ResultsList } from './components/ResultsList';
import { DocumentDetail } from './components/DocumentDetail';
import { Toolbar } from './components/Toolbar';
import { JobProgress } from './components/JobProgress';
import { SettingsPanel } from './components/SettingsPanel';
import { SavedSearches } from './components/SavedSearches';
import { ReviewQueue } from './components/ReviewQueue';
import { StatsPanel } from './components/StatsPanel';

type Panel = 'searches' | 'review' | 'stats' | 'jobs' | null;

function App() {
  const search = useSearch();
  const { theme, toggle: toggleTheme } = useTheme();
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activePanel, setActivePanel] = useState<Panel>(null);

  const togglePanel = (panel: Panel) =>
    setActivePanel((prev) => (prev === panel ? null : panel));

  const handleLoadSearch = (query: string, filters: typeof search.filters) => {
    search.setQuery(query);
    search.setFilters(filters);
    setActivePanel(null);
  };

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top bar with search */}
      <header className="border-b border-zinc-800 p-4">
        <SearchBar
          query={search.query}
          onQueryChange={search.setQuery}
          resultCount={search.results?.total}
        />
      </header>

      {/* Toolbar */}
      <div className="relative">
        <Toolbar
          onOpenSettings={() => setShowSettings(true)}
          onOpenReviewQueue={() => togglePanel('review')}
          onOpenSavedSearches={() => togglePanel('searches')}
          onOpenStats={() => togglePanel('stats')}
          onOpenJobs={() => togglePanel('jobs')}
          query={search.query}
          filters={search.filters}
          resultCount={search.results?.total}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {/* Dropdown panels — only one active at a time */}
        {activePanel === 'searches' && (
          <div className="absolute top-full left-0 z-40 mt-1 ml-4">
            <SavedSearches
              currentQuery={search.query}
              currentFilters={search.filters}
              onLoadSearch={handleLoadSearch}
              onClose={() => setActivePanel(null)}
            />
          </div>
        )}

        {activePanel === 'stats' && (
          <div className="absolute top-full left-0 z-40 mt-1 ml-4">
            <StatsPanel onClose={() => setActivePanel(null)} />
          </div>
        )}

        {activePanel === 'jobs' && (
          <div className="absolute top-full left-0 z-40 mt-1 ml-4">
            <JobProgress onClose={() => setActivePanel(null)} />
          </div>
        )}
      </div>

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

        {/* Center: results or review queue */}
        <main className="flex-1 overflow-y-auto">
          {activePanel === 'review' ? (
            <ReviewQueue
              onSelectDoc={(id) => {
                setSelectedDocId(id);
                setActivePanel(null);
              }}
              onClose={() => setActivePanel(null)}
            />
          ) : (
            <>
              <FilterChips
                filters={search.filters}
                onFilterChange={search.setFilters}
              />
              <ResultsList
                documents={search.results?.documents}
                total={search.results?.total}
                loading={search.loading}
                offset={search.offset}
                onLoadMore={() => search.setOffset()}
                onSelect={setSelectedDocId}
              />
            </>
          )}
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

      {/* Settings modal */}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}

    </div>
  );
}

export default App;
