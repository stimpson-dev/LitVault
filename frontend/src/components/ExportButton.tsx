import { Download } from 'lucide-react';
import { getExportUrl } from '@/lib/api';
import type { SearchFilters } from '@/lib/types';

interface ExportButtonProps {
  query: string;
  filters: SearchFilters;
  disabled?: boolean;
}

export function ExportButton({ query, filters, disabled }: ExportButtonProps) {
  const handleExport = () => {
    const url = getExportUrl(query, filters);
    window.open(url, '_blank');
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title="Als CSV exportieren"
    >
      <Download size={14} />
      <span>CSV Export</span>
    </button>
  );
}
