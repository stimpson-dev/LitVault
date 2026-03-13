import type { DocumentDetail as DocumentDetailType } from '@/lib/types';
import { useTranslation } from '@/i18n';

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

interface Props {
  doc: DocumentDetailType;
}

export function MetadataTab({ doc }: Props) {
  const { t } = useTranslation();

  const statusColors: Record<string, string> = {
    done: 'bg-emerald-900/40 text-emerald-300',
    error: 'bg-red-900/40 text-red-300',
    processing: 'bg-blue-900/40 text-blue-300',
    pending: 'bg-zinc-700 text-zinc-300',
  };
  const statusColor = statusColors[doc.processing_status] ?? 'bg-zinc-700 text-zinc-300';

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <span className="text-zinc-500">{t('detail.filePath')}</span>
        <span className="font-mono text-zinc-300 break-all">{doc.file_path}</span>

        <span className="text-zinc-500">{t('detail.fileType')}</span>
        <span className="text-zinc-200">{doc.file_type}</span>

        <span className="text-zinc-500">{t('detail.size')}</span>
        <span className="text-zinc-200">
          {doc.file_size !== null ? formatFileSize(doc.file_size) : '—'}
        </span>

        <span className="text-zinc-500">{t('detail.pages')}</span>
        <span className="text-zinc-200">{doc.page_count ?? '—'}</span>

        <span className="text-zinc-500">Hash</span>
        <span className="font-mono text-zinc-400 break-all text-[10px]">
          {doc.file_hash ?? '—'}
        </span>

        <span className="text-zinc-500">Status</span>
        <span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusColor}`}>
            {doc.processing_status}
          </span>
        </span>

        <span className="text-zinc-500">{t('detail.confidence')}</span>
        <span className="text-zinc-200">
          {doc.classification_confidence !== null
            ? `${Math.round(doc.classification_confidence * 100)}%`
            : '—'}
        </span>

        <span className="text-zinc-500">{t('detail.classificationAI')}</span>
        <span className="text-zinc-200">{doc.classification_source ?? '—'}</span>

        <span className="text-zinc-500">Erstellt</span>
        <span className="text-zinc-200">{formatDate(doc.created_at)}</span>

        <span className="text-zinc-500">Aktualisiert</span>
        <span className="text-zinc-200">{formatDate(doc.updated_at)}</span>

        <span className="text-zinc-500">Indiziert</span>
        <span className="text-zinc-200">{formatDate(doc.indexed_at)}</span>
      </div>
    </div>
  );
}
