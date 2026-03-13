import { useState, useEffect } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import { listSavedSearches } from '@/lib/api';
import type { SavedSearch } from '@/lib/types';

interface SavedViewNavProps {
  slim: boolean;
  onNavigate?: () => void;
}

export function SavedViewNav({ slim, onNavigate }: SavedViewNavProps) {
  const [views, setViews] = useState<SavedSearch[]>([]);
  const { viewId } = useParams<{ viewId: string }>();

  useEffect(() => {
    listSavedSearches()
      .then(setViews)
      .catch(() => {});
  }, []);

  if (views.length === 0) {
    return null;
  }

  return (
    <div className="space-y-0.5">
      {views.map((view) => {
        const isActive = viewId === String(view.id);
        return (
          <NavLink
            key={view.id}
            to={`/view/${view.id}`}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-1.5 mx-2 rounded-md text-sm transition-colors ${
              isActive
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            } ${slim ? 'justify-center' : ''}`}
            title={slim ? view.name : undefined}
          >
            <Bookmark className={`size-3.5 shrink-0 ${isActive ? 'fill-current' : ''}`} />
            {!slim && (
              <span className="truncate transition-opacity duration-100">{view.name}</span>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}
