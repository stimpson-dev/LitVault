import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { getSimilarDocuments } from '@/lib/api';
import type { SimilarResponse } from '@/lib/types';
import { useTranslation } from '@/i18n';

interface Props {
  docId: number;
}

export function SimilarTab({ docId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<SimilarResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setData(null);
    getSimilarDocuments(docId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [docId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-zinc-400 text-sm">
        <Loader2 className="size-4 animate-spin" />
        {t('detail.similarLoading')}
      </div>
    );
  }

  if (!data || !data.embedded) {
    return (
      <div className="p-6 text-sm text-zinc-500">
        <Sparkles className="size-4 inline mr-1.5" />
        {t('detail.similarNotEmbedded')}
      </div>
    );
  }

  if (data.similar.length === 0) {
    return <div className="p-6 text-sm text-zinc-500">{t('detail.similarNone')}</div>;
  }

  return (
    <div className="flex flex-col">
      {data.similar.map((doc) => (
        <button
          key={doc.id}
          type="button"
          onClick={() => navigate(`/documents/${doc.id}`)}
          className="text-left border-b border-zinc-800 p-4 hover:bg-zinc-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-100 text-sm leading-snug">
              {doc.title || doc.file_path.replace(/\\/g, '/').split('/').pop()}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded border bg-indigo-900/50 text-indigo-300 border-indigo-800 shrink-0">
              {Math.round(doc.rank * 100)} %
            </span>
          </div>
          {(doc.authors || doc.year) && (
            <p className="mt-0.5 text-xs text-zinc-400">
              {doc.authors}
              {doc.authors && doc.year ? ' · ' : ''}
              {doc.year}
            </p>
          )}
          {doc.summary && (
            <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{doc.summary}</p>
          )}
        </button>
      ))}
    </div>
  );
}
