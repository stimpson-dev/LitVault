import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { getDocument } from '@/lib/api';
import type { DocumentDetail as DocumentDetailType } from '@/lib/types';

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function parseAuthors(authorsJson: string | null): string[] {
  if (!authorsJson) return [];
  try {
    const parsed = JSON.parse(authorsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface Props {
  docId: number;
  onClose: () => void;
}

export function DocumentDetail({ docId, onClose }: Props) {
  const [doc, setDoc] = useState<DocumentDetailType | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setDoc(null);
    getDocument(docId)
      .then((data) => {
        setDoc(data);
      })
      .catch(() => {
        setDoc(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [docId]);

  const confidenceTier = (confidence: number | null): string => {
    if (confidence === null) return '—';
    if (confidence >= 0.85) return 'Hoch';
    if (confidence >= 0.55) return 'Mittel';
    return 'Niedrig';
  };

  return (
    <div className="relative flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-4 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-100 leading-snug">
          {loading ? 'Lade Dokument…' : (doc?.title ?? 'Kein Titel')}
        </h2>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
          aria-label="Schließen"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-zinc-400" />
        </div>
      ) : doc ? (
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Metadata grid */}
          <div className="p-4 border-b border-zinc-800">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <span className="text-zinc-500">Autoren</span>
              <span className="text-zinc-200">
                {parseAuthors(doc.authors).join(', ') || '—'}
              </span>

              <span className="text-zinc-500">Jahr</span>
              <span className="text-zinc-200">{doc.year ?? '—'}</span>

              <span className="text-zinc-500">Dokumenttyp</span>
              <span>
                {doc.doc_type ? (
                  <span className="inline-block px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 text-xs">
                    {doc.doc_type}
                  </span>
                ) : (
                  <span className="text-zinc-200">—</span>
                )}
              </span>

              <span className="text-zinc-500">Quelle</span>
              <span className="text-zinc-200">{doc.source ?? '—'}</span>

              <span className="text-zinc-500">Sprache</span>
              <span className="text-zinc-200">{doc.language ?? '—'}</span>

              <span className="text-zinc-500">Dateityp</span>
              <span className="text-zinc-200">{doc.file_type}</span>

              <span className="text-zinc-500">Größe</span>
              <span className="text-zinc-200">
                {doc.file_size !== null ? formatFileSize(doc.file_size) : '—'}
              </span>

              <span className="text-zinc-500">Confidence</span>
              <span className="text-zinc-200">
                {doc.classification_confidence !== null
                  ? `${Math.round(doc.classification_confidence * 100)}% — ${confidenceTier(doc.classification_confidence)}`
                  : '—'}
              </span>
            </div>
          </div>

          {/* Summary */}
          {doc.summary && (
            <div className="p-4 border-b border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Zusammenfassung
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed">{doc.summary}</p>
            </div>
          )}

          {/* File path */}
          <div className="p-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Dateipfad
            </h3>
            <p className="text-xs font-mono bg-zinc-800 p-2 rounded break-all text-zinc-300">
              {doc.file_path}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Im Explorer öffnen</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-zinc-500">Dokument nicht gefunden.</p>
        </div>
      )}
    </div>
  );
}
