import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  resultCount?: number;
}

export function SearchBar({ query, onQueryChange, resultCount }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="w-full">
      <div className="relative flex items-center">
        <Search className="absolute left-4 size-5 text-zinc-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Dokumente durchsuchen... (Ctrl+K)"
          className="w-full rounded-lg bg-zinc-900 text-zinc-100 text-lg pl-12 pr-4 py-3 outline-none border border-zinc-800 focus:border-zinc-600 placeholder:text-zinc-500 transition-colors"
        />
      </div>
      {resultCount !== undefined && (
        <p className="mt-2 text-sm text-zinc-400">{resultCount} Ergebnisse</p>
      )}
    </div>
  );
}
