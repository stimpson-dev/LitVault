import { useEffect, useState } from 'react';
import type { DocumentDetail as DocumentDetailType } from '@/lib/types';
import { useTranslation } from '@/i18n';

interface Props {
  doc: DocumentDetailType;
}

export function ContentTab({ doc }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/documents/${doc.id}/text`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ text: string | null }>;
      })
      .then((data) => {
        setText(data?.text ?? null);
      })
      .catch(() => {
        setText(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [doc.id]);

  if (loading) {
    return (
      <div className="p-4 text-xs text-zinc-500">{t('detail.loading')}</div>
    );
  }

  if (!text) {
    return (
      <div className="p-4 text-xs text-zinc-500">{t('detail.noContent')}</div>
    );
  }

  return (
    <div className="p-4">
      <textarea
        readOnly
        value={text}
        className="w-full h-[600px] text-xs font-mono bg-zinc-900 text-zinc-300 rounded p-3 outline-none resize-none leading-relaxed border border-zinc-800"
      />
    </div>
  );
}
