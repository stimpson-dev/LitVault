import { Menu, Activity } from 'lucide-react';
import { SearchBar } from '@/components/SearchBar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ExportButton } from '@/components/ExportButton';
import type { SearchFilters } from '@/lib/types';

interface AppNavbarProps {
  query: string;
  onQueryChange: (q: string) => void;
  resultCount?: number;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onToggleMobileSidebar: () => void;
  onOpenJobs: () => void;
  hasActiveJob?: boolean;
  filters: SearchFilters;
}

export function AppNavbar({
  query,
  onQueryChange,
  resultCount,
  theme,
  onToggleTheme,
  onToggleMobileSidebar,
  onOpenJobs,
  hasActiveJob,
  filters,
}: AppNavbarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-zinc-950 border-b border-zinc-800 flex items-center gap-3 px-4">
      {/* Mobile hamburger */}
      <button
        onClick={onToggleMobileSidebar}
        className="md:hidden p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
        aria-label="Toggle sidebar"
      >
        <Menu className="size-5" />
      </button>

      {/* Logo */}
      <span className="text-sm font-semibold text-zinc-300 tracking-tight hidden sm:block shrink-0">
        LitVault
      </span>

      {/* Search bar (center, flexible) */}
      <div className="flex-1 max-w-2xl mx-auto">
        <SearchBar
          query={query}
          onQueryChange={onQueryChange}
          resultCount={resultCount}
          compact
        />
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onOpenJobs}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors relative"
          title="Jobs"
        >
          <Activity className="size-4" />
          {hasActiveJob && (
            <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          )}
        </button>
        <ExportButton query={query} filters={filters} disabled={!resultCount} />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </header>
  );
}
