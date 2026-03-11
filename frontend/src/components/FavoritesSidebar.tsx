import { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { listFavorites } from '@/lib/api';
import type { SearchDocument } from '@/lib/types';

interface FavoritesSidebarProps {
  onSelect: (id: number) => void;
}

function getDisplayTitle(doc: SearchDocument): string {
  if (doc.title) return doc.title;
  const parts = doc.file_path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? doc.file_path;
}

export function FavoritesSidebar({ onSelect }: FavoritesSidebarProps) {
  const [favorites, setFavorites] = useState<SearchDocument[]>([]);

  useEffect(() => {
    listFavorites().then(setFavorites).catch(() => {});
  }, []);

  if (favorites.length === 0) return null;

  return (
    <div className="border-b border-zinc-800 p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        <Heart size={12} className="fill-red-500 text-red-500" />
        Favoriten
      </h3>
      <ul className="flex flex-col gap-0.5">
        {favorites.slice(0, 10).map((doc) => (
          <li key={doc.id}>
            <button
              type="button"
              onClick={() => onSelect(doc.id)}
              className="flex w-full cursor-pointer items-center rounded px-3 py-1.5 text-left hover:bg-zinc-800"
            >
              <span className="truncate text-sm text-zinc-300">
                {getDisplayTitle(doc)}
              </span>
            </button>
          </li>
        ))}
        {favorites.length > 10 && (
          <li className="px-3 py-1 text-xs text-zinc-600">
            +{favorites.length - 10} weitere
          </li>
        )}
      </ul>
    </div>
  );
}
