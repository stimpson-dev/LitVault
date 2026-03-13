import { useTranslation } from '@/i18n';

export function NotesTab() {
  const { t } = useTranslation();

  return (
    <div className="p-4 text-xs text-zinc-500">
      {t('detail.notesPlaceholder')}
    </div>
  );
}
