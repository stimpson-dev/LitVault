import { useNavigate } from 'react-router-dom';
import type { SearchFacets } from '@/lib/types';
import { useTranslation } from '@/i18n';
import { WidgetFrame } from '@/components/ui/WidgetFrame';

interface FileTypeWidgetProps {
  facets: SearchFacets | null;
}

const fileTypeColors: Record<string, string> = {
  pdf: 'bg-red-500',
  docx: 'bg-blue-500',
  pptx: 'bg-orange-500',
  txt: 'bg-zinc-500',
  doc: 'bg-blue-400',
  ppt: 'bg-orange-400',
  xlsx: 'bg-emerald-500',
  xls: 'bg-emerald-400',
};

const fileTypeDotColors: Record<string, string> = {
  pdf: 'bg-red-500',
  docx: 'bg-blue-500',
  pptx: 'bg-orange-500',
  txt: 'bg-zinc-500',
  doc: 'bg-blue-400',
  ppt: 'bg-orange-400',
  xlsx: 'bg-emerald-500',
  xls: 'bg-emerald-400',
};

function getColor(name: string): string {
  return fileTypeColors[name.toLowerCase()] ?? 'bg-zinc-600';
}

function getDotColor(name: string): string {
  return fileTypeDotColors[name.toLowerCase()] ?? 'bg-zinc-600';
}

export function FileTypeWidget({ facets }: FileTypeWidgetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const items = facets?.file_types ?? [];
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <WidgetFrame title={t('dashboard.fileTypes')} loading={!facets}>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500 py-2">{t('results.noResults')}</p>
      ) : (
        <>
          {/* Stacked bar */}
          <div className="flex h-3 rounded-full overflow-hidden gap-px mb-4">
            {items.map((item) => {
              const pct = total > 0 ? (item.count / total) * 100 : 0;
              return (
                <div
                  key={item.name}
                  className={`${getColor(item.name)} transition-all duration-500 cursor-pointer hover:opacity-80`}
                  style={{ width: `${pct}%` }}
                  title={`${item.name}: ${item.count}`}
                  onClick={() => navigate(`/?file_type=${encodeURIComponent(item.name)}`)}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="space-y-1.5">
            {items.map((item) => (
              <div
                key={item.name}
                className="flex items-center gap-2 cursor-pointer hover:bg-zinc-800/40 rounded px-1 py-0.5 transition-colors"
                onClick={() => navigate(`/?file_type=${encodeURIComponent(item.name)}`)}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${getDotColor(item.name)}`} />
                <span className="text-xs text-zinc-300 flex-1 uppercase tracking-wide">
                  {item.name}
                </span>
                <span className="text-xs tabular-nums text-zinc-500">{item.count.toLocaleString('de-DE')}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </WidgetFrame>
  );
}
