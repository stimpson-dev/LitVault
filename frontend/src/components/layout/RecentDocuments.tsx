import { FileText, X, Trash2 } from 'lucide-react';
import type { RecentDoc } from '@/hooks/useRecentDocs';
import { useTranslation } from '@/i18n';

interface RecentDocumentsProps {
  recentDocs: RecentDoc[];
  slim: boolean;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
  onClearAll: () => void;
}

export function RecentDocuments({ recentDocs, slim, onSelect, onRemove, onClearAll }: RecentDocumentsProps) {
  const { t } = useTranslation();

  if (recentDocs.length === 0) {
    if (slim) return null;
    return (
      <p className="px-5 py-2 text-xs text-zinc-500">
        {t('sidebar.noRecentDocs')}
      </p>
    );
  }

  if (slim) {
    return (
      <div className="flex justify-center py-2" title={t('sidebar.recentDocs')}>
        <FileText className="size-4 text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {recentDocs.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center gap-2 px-3 py-1.5 mx-2 rounded-md text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors cursor-pointer group"
          onClick={() => onSelect(doc.id)}
        >
          <FileText className="size-3.5 shrink-0 text-zinc-500" />
          <span className="truncate flex-1">{doc.title || `Dokument #${doc.id}`}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(doc.id); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-all"
            title="Entfernen"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {recentDocs.length > 1 && (
        <button
          onClick={onClearAll}
          className="flex items-center gap-1.5 px-5 py-1 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
        >
          <Trash2 className="size-3" />
          {t('sidebar.clearAll')}
        </button>
      )}
    </div>
  );
}
