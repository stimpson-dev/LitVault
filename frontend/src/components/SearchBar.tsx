import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from '@/i18n';

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  resultCount?: number;
}

export function SearchBar({ query, onQueryChange, resultCount }: SearchBarProps) {
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
        <Search className="absolute left-4 size-5 text-zinc-400 pointer-events-none peer-focus:text-zinc-300 transition-colors" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('search.placeholder')}
          className="peer w-full rounded-lg bg-zinc-900 text-zinc-100 text-lg pl-12 pr-4 py-3.5 outline-none border border-zinc-800 focus:border-zinc-600 focus:shadow-[inset_0_1px_4px_0_rgb(0_0_0/_0.4),0_0_0_1px_theme(colors.zinc.700)] placeholder:text-zinc-500 transition-all"
        />
      </div>
      {resultCount !== undefined && (
        <p className="mt-2 text-sm text-zinc-400">{resultCount} {t('results.count')}</p>
      )}
    </div>
  );
}
