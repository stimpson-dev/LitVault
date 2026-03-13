import { File } from 'lucide-react';
import { useTranslation } from '@/i18n';

interface PdfViewerProps {
  docId: number;
  fileType: string;
}

export function PdfViewer({ docId, fileType }: PdfViewerProps) {
  const { t } = useTranslation();
  const normalized = fileType.toLowerCase().replace('.', '');
  const isPdf = normalized === 'pdf';

  if (!isPdf) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-900 text-zinc-400 gap-4">
        <File size={48} className="text-zinc-600" />
        <p className="text-sm">
          {t('detail.previewNotAvailable')} .{normalized}
        </p>
        <a
          href={`/api/documents/${docId}/file`}
          download
          className="text-xs px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
        >
          {t('detail.downloadFile')}
        </a>
      </div>
    );
  }

  return (
    <iframe
      src={`/api/documents/${docId}/file`}
      className="w-full h-full border-0"
      title="Document preview"
    />
  );
}
