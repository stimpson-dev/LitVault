import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { getExportUrl } from '@/lib/api';
import type { SearchFilters } from '@/lib/types';

interface ExportButtonProps {
  query: string;
  filters: SearchFilters;
  disabled?: boolean;
}

export function ExportButton({ query, filters, disabled }: ExportButtonProps) {
  const [saving, setSaving] = useState(false);

  const handleExport = async () => {
    const url = getExportUrl(query, filters);

    // Use native "Save As" dialog when available (Chromium)
    if ('showSaveFilePicker' in window) {
      try {
        setSaving(true);
        const handle = await window.showSaveFilePicker({
          suggestedName: 'litvault_export.csv',
          types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
        });
        const res = await fetch(url);
        if (!res.ok) throw new Error('Export fehlgeschlagen');
        const blob = await res.blob();
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } catch (e: unknown) {
        // User cancelled the picker — ignore AbortError
        if (e instanceof DOMException && e.name === 'AbortError') return;
        console.error('Export error', e);
      } finally {
        setSaving(false);
      }
    } else {
      // Fallback: regular browser download
      window.open(url, '_blank');
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || saving}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title="Als CSV exportieren"
    >
      {saving ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      <span>CSV Export</span>
    </button>
  );
}
