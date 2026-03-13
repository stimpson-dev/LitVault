import { BarChart3 } from 'lucide-react';
import { useTranslation } from '@/i18n';

export function DashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="size-6 text-zinc-400" />
        <h1 className="text-xl font-semibold">{t('toolbar.dashboard')}</h1>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <p className="text-zinc-400">Dashboard wird in Phase 12 implementiert.</p>
        <p className="text-sm text-zinc-500 mt-2">Statistics, Saved View Widgets, File Type Distribution</p>
      </div>
    </div>
  );
}
