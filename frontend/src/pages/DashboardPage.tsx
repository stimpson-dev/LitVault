import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, BookOpen } from 'lucide-react';
import { listSavedSearches, searchDocuments } from '@/lib/api';
import type { SavedSearch, SearchDocument, SearchFilters, SearchFacets } from '@/lib/types';
import { useTranslation } from '@/i18n';
import { StatsWidget } from '@/components/dashboard/StatsWidget';
import { FileTypeWidget } from '@/components/dashboard/FileTypeWidget';
import { SavedViewWidget } from '@/components/dashboard/SavedViewWidget';

interface ViewData {
  documents: SearchDocument[];
  total: number;
  loading: boolean;
}

function parseSavedQuery(query: string): { q: string; filters: SearchFilters } {
  try {
    const parsed = JSON.parse(query) as { q?: string } & SearchFilters;
    const { q, ...rest } = parsed;
    return { q: q ?? '', filters: rest };
  } catch {
    return { q: query, filters: {} };
  }
}

function EmptyDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-10 text-center">
      <BookOpen size={32} className="text-zinc-600 mx-auto mb-4" />
      <h2 className="text-base font-semibold text-zinc-300 mb-2">{t('dashboard.welcome')}</h2>
      <p className="text-sm text-zinc-500 mb-5 max-w-sm mx-auto">{t('dashboard.welcomeHint')}</p>
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
      >
        {t('dashboard.goToDocuments')}
      </button>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const [savedViews, setSavedViews] = useState<SavedSearch[]>([]);
  const [viewData, setViewData] = useState<Record<number, ViewData>>({});
  const [facets, setFacets] = useState<SearchFacets | null>(null);

  // Fetch file type facets from a broad search
  useEffect(() => {
    searchDocuments('', {}, 0, 1).then((r) => setFacets(r.facets)).catch(() => {});
  }, []);

  // Fetch saved searches, then fetch top 5 docs for each
  useEffect(() => {
    listSavedSearches()
      .then((views) => {
        setSavedViews(views);

        views.forEach((view) => {
          setViewData((prev) => ({
            ...prev,
            [view.id]: { documents: [], total: 0, loading: true },
          }));

          const { q, filters } = parseSavedQuery(view.query);
          searchDocuments(q, filters, 0, 5)
            .then((res) => {
              setViewData((prev) => ({
                ...prev,
                [view.id]: { documents: res.documents, total: res.total, loading: false },
              }));
            })
            .catch(() => {
              setViewData((prev) => ({
                ...prev,
                [view.id]: { documents: [], total: 0, loading: false },
              }));
            });
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="size-6 text-zinc-400" />
        <h1 className="text-xl font-semibold">{t('toolbar.dashboard')}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main area: saved view widgets (2 cols) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {savedViews.length === 0 ? (
            <EmptyDashboard />
          ) : (
            savedViews.map((view) => {
              const data = viewData[view.id] ?? { documents: [], total: 0, loading: true };
              return (
                <SavedViewWidget
                  key={view.id}
                  view={view}
                  documents={data.documents}
                  total={data.total}
                  loading={data.loading}
                />
              );
            })
          )}
        </div>

        {/* Sidebar: stats (1 col) */}
        <div className="flex flex-col gap-6">
          <StatsWidget />
          <FileTypeWidget facets={facets} />
        </div>
      </div>
    </div>
  );
}
