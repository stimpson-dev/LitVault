import { useState, useEffect, useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useSettings } from '@/hooks/useSettings';
import { useSearch } from '@/hooks/useSearch';
import { useTheme } from '@/hooks/useTheme';
import { useRecentDocs } from '@/hooks/useRecentDocs';
import { AppNavbar } from './AppNavbar';
import { AppSidebar } from './AppSidebar';
import { SettingsPanel } from '@/components/SettingsPanel';
import { JobProgress } from '@/components/JobProgress';
import { SavedSearches } from '@/components/SavedSearches';
import { StatsPanel } from '@/components/StatsPanel';

type DropdownPanel = 'jobs' | 'searches' | 'stats' | null;

export interface ShellContext {
  addRecent: (id: number, title: string) => void;
  search: ReturnType<typeof useSearch>;
}

export function AppShell() {
  const { settings, refresh: refreshSettings } = useSettings();
  const search = useSearch({
    resultsPerPage: settings.results_per_page,
    defaultSort: settings.default_sort,
  });
  const { theme, setTheme, toggle: toggleTheme } = useTheme();
  const { recentDocs, addRecent, removeRecent, clearAll } = useRecentDocs();
  const navigate = useNavigate();

  const [sidebarSlim, setSidebarSlim] = useState(() => {
    return localStorage.getItem('litvault-sidebar-slim') === 'true';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<DropdownPanel>(null);

  // Sync theme from backend settings
  useEffect(() => {
    if (settings.theme !== theme) {
      setTheme(settings.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.theme]);

  const toggleSlim = () => {
    setSidebarSlim((prev) => {
      const next = !prev;
      localStorage.setItem('litvault-sidebar-slim', String(next));
      return next;
    });
  };

  const toggleDropdown = (panel: DropdownPanel) => {
    setActiveDropdown((prev) => (prev === panel ? null : panel));
  };

  const handleSettingsClose = () => {
    setShowSettings(false);
    refreshSettings();
  };

  const handleLoadSearch = (query: string, filters: typeof search.filters) => {
    search.setQuery(query);
    search.setFilters(filters);
    setActiveDropdown(null);
  };

  const handleSelectRecentDoc = (id: number) => {
    // Navigate to documents page and signal doc selection
    navigate(`/?doc=${id}`);
  };

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* Fixed navbar */}
      <AppNavbar
        query={search.query}
        onQueryChange={search.setQuery}
        resultCount={search.results?.total}
        theme={theme}
        onToggleTheme={toggleTheme}
        onToggleMobileSidebar={() => setMobileOpen((p) => !p)}
        onOpenJobs={() => toggleDropdown('jobs')}
        filters={search.filters}
      />

      {/* Body: sidebar + content */}
      <div className="flex flex-1 pt-14 overflow-hidden">
        {/* Sidebar */}
        <AppSidebar
          slim={sidebarSlim}
          onToggleSlim={toggleSlim}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          onOpenSettings={() => setShowSettings(true)}
          recentDocs={recentDocs}
          onSelectRecentDoc={handleSelectRecentDoc}
          onRemoveRecentDoc={removeRecent}
          onClearRecentDocs={clearAll}
        />

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden transition-all duration-200">
          {/* Dropdown panels */}
          {activeDropdown && (
            <div className="relative z-30">
              <div className="absolute top-0 left-0 z-40 mt-1 ml-4">
                {activeDropdown === 'jobs' && (
                  <JobProgress onClose={() => setActiveDropdown(null)} />
                )}
                {activeDropdown === 'searches' && (
                  <SavedSearches
                    currentQuery={search.query}
                    currentFilters={search.filters}
                    onLoadSearch={handleLoadSearch}
                    onClose={() => setActiveDropdown(null)}
                  />
                )}
                {activeDropdown === 'stats' && (
                  <StatsPanel onClose={() => setActiveDropdown(null)} />
                )}
              </div>
            </div>
          )}

          {/* Page content via router */}
          <div className="flex-1 overflow-hidden">
            <Outlet context={useMemo(() => ({ addRecent, search }), [addRecent, search])} />
          </div>
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <SettingsPanel onClose={handleSettingsClose} />
      )}
    </div>
  );
}
