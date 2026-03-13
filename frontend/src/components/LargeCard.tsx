import { useState } from 'react';
import { FileText, File } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FavoriteButton } from '@/components/FavoriteButton';
import type { SearchDocument } from '@/lib/types';

const DOC_TYPE_LABELS: Record<string, string> = {
  paper: 'Paper',
  dissertation: 'Dissertation',
  book: 'Buch',
  buch: 'Buch',
  report: 'Bericht',
  bericht: 'Bericht',
  thesis: 'Thesis',
  article: 'Artikel',
  artikel: 'Artikel',
  norm: 'Norm',
  presentation: 'Präsentation',
  praesentation: 'Präsentation',
  manual: 'Handbuch',
  internal: 'Intern',
  intern: 'Intern',
};

function getDocTypeBadgeClass(docType: string | null): string {
  switch (docType?.toLowerCase()) {
    case 'paper': return 'bg-blue-900/50 text-blue-300 border-blue-800';
    case 'dissertation': return 'bg-purple-900/50 text-purple-300 border-purple-800';
    case 'book':
    case 'buch': return 'bg-amber-900/50 text-amber-300 border-amber-800';
    case 'report':
    case 'bericht': return 'bg-green-900/50 text-green-300 border-green-800';
    case 'thesis': return 'bg-cyan-900/50 text-cyan-300 border-cyan-800';
    case 'norm': return 'bg-slate-700/50 text-slate-300 border-slate-600';
    case 'presentation':
    case 'praesentation': return 'bg-orange-900/50 text-orange-300 border-orange-800';
    case 'manual':
    case 'handbuch': return 'bg-teal-900/50 text-teal-300 border-teal-800';
    case 'internal':
    case 'intern': return 'bg-rose-900/50 text-rose-300 border-rose-800';
    default: return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  }
}

function getDisplayTitle(doc: SearchDocument): string {
  if (doc.title) return doc.title;
  const parts = doc.file_path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? doc.file_path;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function getConfidenceBarClass(rank: number): string {
  if (rank > 0.7) return 'bg-green-500';
  if (rank > 0.3) return 'bg-yellow-500';
  return 'bg-red-500';
}

interface LargeCardProps {
  doc: SearchDocument;
  onSelect: (id: number) => void;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
}

export function LargeCard({ doc, onSelect, selected, onToggleSelect }: LargeCardProps) {
  const displayTitle = getDisplayTitle(doc);
  const [imgError, setImgError] = useState(false);
  const snippet = doc.text_snippet || doc.summary;
  const showConfidence = doc.rank > 0;

  return (
    <div
      onClick={() => onSelect(doc.id)}
      className={`group relative flex gap-4 rounded-lg border p-4 hover:bg-zinc-800/50 transition-colors cursor-pointer ${
        selected ? 'border-blue-500 bg-blue-950/30' : 'border-zinc-800 hover:border-blue-500/50'
      }`}
    >
      {/* Hover-reveal actions */}
      <div className="hidden group-hover:flex absolute top-2 right-2 gap-1 z-10">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect(doc.id);
            }}
            onClick={(e) => e.stopPropagation()}
            className="accent-blue-500 cursor-pointer"
          />
        )}
        <FavoriteButton docId={doc.id} />
      </div>

      {/* Left: thumbnail / icon */}
      <div className="w-24 shrink-0 flex items-start justify-center pt-1">
        {!imgError ? (
          <img
            src={`/api/documents/${doc.id}/thumbnail`}
            alt=""
            onError={() => setImgError(true)}
            className="w-20 h-28 object-cover rounded border border-zinc-700"
          />
        ) : (
          <div className="w-20 h-28 flex items-center justify-center rounded border border-zinc-700 bg-zinc-800">
            {doc.file_type.toLowerCase() === 'pdf' ? (
              <FileText className="size-8 text-zinc-400" />
            ) : (
              <File className="size-8 text-zinc-400" />
            )}
          </div>
        )}
      </div>

      {/* Right: metadata */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {/* Header: badge + title */}
        <div className="flex items-start gap-2 flex-wrap">
          {doc.doc_type && (
            <Badge className={`text-xs border shrink-0 ${getDocTypeBadgeClass(doc.doc_type)}`}>
              {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
            </Badge>
          )}
          {doc.title_snippet ? (
            <span
              className="font-medium text-zinc-100 text-sm leading-snug line-clamp-2 [&_mark]:bg-amber-400/30 [&_mark]:text-amber-200 [&_mark]:rounded-sm"
              dangerouslySetInnerHTML={{ __html: doc.title_snippet }}
            />
          ) : (
            <span className="font-medium text-zinc-100 text-sm leading-snug line-clamp-2">{displayTitle}</span>
          )}
        </div>

        {/* Authors + year */}
        {(doc.authors ?? doc.year) && (
          <p className="text-sm text-zinc-400 truncate">
            {doc.authors && <span>{doc.authors}</span>}
            {doc.authors && doc.year && <span> · </span>}
            {doc.year && <span>{doc.year}</span>}
          </p>
        )}

        {/* Content snippet */}
        {snippet && (
          <p
            className="text-sm text-zinc-500 line-clamp-3 [&_mark]:bg-amber-400/30 [&_mark]:text-amber-200 [&_mark]:rounded-sm"
            dangerouslySetInnerHTML={{ __html: snippet }}
          />
        )}

        {/* Footer: file info + confidence */}
        <div className="mt-auto flex items-center gap-3 pt-1">
          <span className="text-xs text-zinc-500 uppercase">{doc.file_type}</span>
          {doc.file_size != null && (
            <span className="text-xs text-zinc-500">{formatFileSize(doc.file_size)}</span>
          )}
          {showConfidence && (
            <div
              className={`h-1 w-16 rounded-full ${getConfidenceBarClass(doc.rank)}`}
              title={`Relevanz: ${Math.round(doc.rank * 100)}%`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
