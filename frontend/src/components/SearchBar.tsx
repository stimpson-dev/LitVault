import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from '@/i18n';

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  resultCount?: number;
  compact?: boolean;
}

export function SearchBar({ query, onQueryChange, resultCount, compact }: SearchBarProps) {
  const { t } = useTranslation();
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
        <Search className={`absolute left-3 text-zinc-400 pointer-events-none transition-colors ${compact ? 'size-4' : 'size-5 left-4'}`} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('search.placeholder')}
          className={`peer w-full rounded-lg bg-zinc-900 text-zinc-100 outline-none border border-zinc-800 focus:border-zinc-600 placeholder:text-zinc-500 transition-all ${
            compact
              ? 'text-sm pl-9 pr-3 py-1.5 focus:shadow-[0_0_0_1px_theme(colors.zinc.700)]'
              : 'text-lg pl-12 pr-4 py-3.5 focus:shadow-[inset_0_1px_4px_0_rgb(0_0_0/_0.4),0_0_0_1px_theme(colors.zinc.700)]'
          }`}
        />
        {compact && resultCount !== undefined && (
          <span className="absolute right-3 text-xs text-zinc-500">{resultCount}</span>
        )}
      </div>
      {!compact && resultCount !== undefined && (
        <p className="mt-2 text-sm text-zinc-400">{resultCount} {t('results.count')}</p>
      )}
    </div>
  );
}
