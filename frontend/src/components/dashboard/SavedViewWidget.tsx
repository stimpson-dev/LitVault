import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { SavedSearch, SearchDocument } from '@/lib/types';
import { useTranslation } from '@/i18n';
import { WidgetFrame } from '@/components/ui/WidgetFrame';

interface SavedViewWidgetProps {
  view: SavedSearch;
  documents: SearchDocument[];
  loading: boolean;
  total: number;
}

const fileTypeIcons: Record<string, string> = {
  pdf: 'PDF',
  docx: 'DOC',
  pptx: 'PPT',
  txt: 'TXT',
  doc: 'DOC',
  ppt: 'PPT',
  xlsx: 'XLS',
  xls: 'XLS',
};

const fileTypeBadgeColors: Record<string, string> = {
  pdf: 'bg-red-500/15 text-red-400',
  docx: 'bg-blue-500/15 text-blue-400',
  pptx: 'bg-orange-500/15 text-orange-400',
  txt: 'bg-zinc-500/15 text-zinc-400',
  doc: 'bg-blue-500/15 text-blue-400',
  ppt: 'bg-orange-500/15 text-orange-400',
  xlsx: 'bg-emerald-500/15 text-emerald-400',
  xls: 'bg-emerald-500/15 text-emerald-400',
};

function getFileTypeBadge(fileType: string) {
  const key = fileType.toLowerCase();
  const label = fileTypeIcons[key] ?? fileType.toUpperCase().slice(0, 4);
  const colors = fileTypeBadgeColors[key] ?? 'bg-zinc-500/15 text-zinc-400';
  return { label, colors };
}

export function SavedViewWidget({ view, documents, loading, total }: SavedViewWidgetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const viewAllButton = (
    <button
      onClick={() => navigate(`/view/${view.id}`)}
      className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
      title={t('dashboard.viewAll')}
    >
      <ExternalLink size={12} />
      <span>{t('dashboard.viewAll')}</span>
    </button>
  );

  return (
    <WidgetFrame
      title={view.name}
      badge={loading ? undefined : total}
      loading={loading}
      headerActions={viewAllButton}
    >
      {/* Document list */}
      <div className="divide-y divide-zinc-800/60 -mx-4 -mb-4">
        {documents.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-zinc-500">{t('dashboard.noDocuments')}</p>
          </div>
        ) : (
          documents.map((doc) => {
            const title = doc.title || doc.file_path.split(/[\\/]/).pop() || doc.file_path;
            const { label: ftLabel, colors: ftColors } = getFileTypeBadge(doc.file_type);

            return (
              <div
                key={doc.id}
                className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                onClick={() => navigate(`/documents/${doc.id}`)}
              >
                <span className="text-sm text-zinc-300 truncate flex-1">{title}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {doc.doc_type && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {doc.doc_type}
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ftColors}`}>
                    {ftLabel}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </WidgetFrame>
  );
}
