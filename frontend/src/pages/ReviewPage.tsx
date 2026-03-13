import { ClipboardCheck } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { ReviewQueue } from '@/components/ReviewQueue';

interface ReviewPageProps {
  onSelectDoc?: (id: number) => void;
}

export function ReviewPage({ onSelectDoc }: ReviewPageProps) {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <ClipboardCheck className="size-6 text-zinc-400" />
        <h1 className="text-xl font-semibold">{t('toolbar.review')}</h1>
      </div>
      <ReviewQueue
        onSelectDoc={(id) => onSelectDoc?.(id)}
        onClose={() => {}}
      />
    </div>
  );
}
