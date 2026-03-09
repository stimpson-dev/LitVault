import { FileText, FileSpreadsheet, Presentation } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FavoriteButton } from '@/components/FavoriteButton';
import type { SearchDocument } from '@/lib/types';

interface ResultRowProps {
  doc: SearchDocument;
  onSelect: (id: number) => void;
}

function getFileIcon(fileType: string) {
  const ft = fileType.toLowerCase();
  if (ft === 'docx' || ft === 'doc') return <FileSpreadsheet className="size-4 shrink-0 text-zinc-400" />;
  if (ft === 'pptx' || ft === 'ppt') return <Presentation className="size-4 shrink-0 text-zinc-400" />;
  return <FileText className="size-4 shrink-0 text-zinc-400" />;
}

function getDocTypeBadgeClass(docType: string | null): string {
  switch (docType?.toLowerCase()) {
    case 'paper': return 'bg-blue-900/50 text-blue-300 border-blue-800';
    case 'dissertation': return 'bg-purple-900/50 text-purple-300 border-purple-800';
    case 'book': return 'bg-amber-900/50 text-amber-300 border-amber-800';
    default: return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  }
}

function getDisplayTitle(doc: SearchDocument): string {
  if (doc.title) return doc.title;
  const parts = doc.file_path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? doc.file_path;
}

export function ResultRow({ doc, onSelect }: ResultRowProps) {
  const displayTitle = getDisplayTitle(doc);

  return (
    <button
      type="button"
      onClick={() => onSelect(doc.id)}
      className="w-full text-left border-b border-zinc-800 p-4 hover:bg-zinc-800/50 transition-colors"
    >
      <div className="flex items-start gap-3">
        {getFileIcon(doc.file_type)}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {doc.title_snippet ? (
              <span
                className="font-medium text-zinc-100 text-sm leading-snug [&_mark]:bg-amber-400/30 [&_mark]:text-amber-200 [&_mark]:rounded-sm"
                dangerouslySetInnerHTML={{ __html: doc.title_snippet }}
              />
            ) : (
              <span className="font-medium text-zinc-100 text-sm leading-snug">{displayTitle}</span>
            )}
            {doc.doc_type && (
              <Badge
                className={`text-xs border ${getDocTypeBadgeClass(doc.doc_type)}`}
              >
                {doc.doc_type}
              </Badge>
            )}
          </div>
          {(doc.authors ?? doc.year) && (
            <p className="mt-0.5 text-xs text-zinc-400">
              {doc.authors && <span>{doc.authors}</span>}
              {doc.authors && doc.year && <span> · </span>}
              {doc.year && <span>{doc.year}</span>}
            </p>
          )}
          {doc.text_snippet && (
            <p
              className="mt-1 text-xs text-zinc-400 line-clamp-2 [&_mark]:bg-amber-400/30 [&_mark]:text-amber-200 [&_mark]:rounded-sm"
              dangerouslySetInnerHTML={{ __html: doc.text_snippet }}
            />
          )}
        </div>
        <FavoriteButton docId={doc.id} />
      </div>
    </button>
  );
}
