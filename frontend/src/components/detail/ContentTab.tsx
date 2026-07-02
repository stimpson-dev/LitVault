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
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/documents/${doc.id}/text`);
        if (!res.ok) {
          if (!cancelled) setText(null);
          return;
        }
        const data = (await res.json()) as { text: string | null };
        if (!cancelled) setText(data?.text ?? null);
      } catch {
        if (!cancelled) setText(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
