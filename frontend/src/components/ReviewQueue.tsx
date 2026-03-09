import { useEffect, useState } from 'react';
import { Loader2, X, Check } from 'lucide-react';
import { updateDocument } from '@/lib/api';
import type { SearchDocument } from '@/lib/types';

const BASE = '/api';

interface Props {
  onSelectDoc: (docId: number) => void;
  onClose: () => void;
}

export function ReviewQueue({ onSelectDoc, onClose }: Props) {
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/documents?limit=200`)
      .then((res) => {
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        return res.json() as Promise<SearchDocument[]>;
      })
      .then((data) => {
        const filtered = data.filter(
          (doc) =>
            doc.classification_confidence !== null &&
            doc.classification_confidence < 0.85,
        );
        setDocuments(filtered);
      })
      .catch(() => setDocuments([]))
      .finally(() => setLoading(false));
  }, []);

  const handleConfirm = async (e: React.MouseEvent, doc: SearchDocument) => {
    e.stopPropagation();
    try {
      await updateDocument(doc.id, { doc_type: doc.doc_type });
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch {
      // silently fail
    }
  };

  const confidenceColor = (confidence: number): string => {
    if (confidence < 0.55) return 'text-red-400';
    return 'text-yellow-400';
  };

  return (
    <div className="p-4 bg-zinc-950 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-100">
          Überprüfung{' '}
          {!loading && (
            <span className="text-zinc-400">({documents.length})</span>
          )}
        </h2>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
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
      ) : documents.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-500">
          <Check size={32} />
          <p className="text-sm">Keine Dokumente zur Überprüfung</p>
        </div>
      ) : (
        <div className="flex flex-col overflow-y-auto">
          {documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => onSelectDoc(doc.id)}
              className="p-3 border-b border-zinc-800 hover:bg-zinc-900 cursor-pointer flex items-center justify-between gap-2"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs text-zinc-200 truncate">
                  {doc.title ?? doc.file_path.split('/').pop() ?? doc.file_path}
                </span>
                <div className="flex items-center gap-1.5">
                  {doc.doc_type && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      {doc.doc_type}
                    </span>
                  )}
                  {doc.classification_confidence !== null && (
                    <span
                      className={`text-[10px] font-medium ${confidenceColor(doc.classification_confidence)}`}
                    >
                      {Math.round(doc.classification_confidence * 100)}%
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => handleConfirm(e, doc)}
                className="shrink-0 text-xs px-2 py-1 rounded bg-green-600 hover:bg-green-500 text-white transition-colors"
              >
                Bestätigen
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
