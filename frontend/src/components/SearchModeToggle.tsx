import { Sparkles, Type } from 'lucide-react';
import { useTranslation } from '@/i18n';
import type { SearchMode } from '@/lib/types';

interface Props {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
}

export function SearchModeToggle({ mode, onModeChange }: Props) {
  const { t } = useTranslation();
  const base = 'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors';
  const active = 'bg-zinc-700 text-zinc-100';
  const inactive = 'text-zinc-400 hover:text-zinc-200';
  return (
    <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 shrink-0">
      <button
        type="button"
        onClick={() => onModeChange('fts')}
        className={`${base} ${mode === 'fts' ? active : inactive}`}
        title={t('search.modeExactHint')}
      >
        <Type className="size-3" />
        {t('search.modeExact')}
      </button>
      <button
        type="button"
        onClick={() => onModeChange('semantic')}
        className={`${base} ${mode === 'semantic' ? active : inactive}`}
        title={t('search.modeSemanticHint')}
      >
        <Sparkles className="size-3" />
        {t('search.modeSemantic')}
      </button>
    </div>
  );
}
