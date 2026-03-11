import { FileText, FileSpreadsheet, Presentation } from 'lucide-react';
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

function getFileIcon(fileType: string) {
  const ft = fileType.toLowerCase();
  if (ft === 'docx' || ft === 'doc') return <FileSpreadsheet className="size-8 text-zinc-400" />;
  if (ft === 'pptx' || ft === 'ppt') return <Presentation className="size-8 text-zinc-400" />;
  return <FileText className="size-8 text-zinc-400" />;
}

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

interface GridCardProps {
  doc: SearchDocument;
  onSelect: (id: number) => void;
}

export function GridCard({ doc, onSelect }: GridCardProps) {
  const displayTitle = getDisplayTitle(doc);

  return (
    <button
      type="button"
      onClick={() => onSelect(doc.id)}
      className="text-left rounded-lg border border-zinc-800 p-4 hover:bg-zinc-800/50 hover:border-blue-500/50 transition-colors flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        {getFileIcon(doc.file_type)}
        <FavoriteButton docId={doc.id} />
      </div>
      <div className="min-w-0 flex-1">
        {doc.title_snippet ? (
          <span
            className="font-medium text-zinc-100 text-sm leading-snug line-clamp-2 [&_mark]:bg-amber-400/30 [&_mark]:text-amber-200 [&_mark]:rounded-sm"
            dangerouslySetInnerHTML={{ __html: doc.title_snippet }}
          />
        ) : (
          <span className="font-medium text-zinc-100 text-sm leading-snug line-clamp-2">{displayTitle}</span>
        )}
        {(doc.authors ?? doc.year) && (
          <p className="mt-1 text-xs text-zinc-400 truncate">
            {doc.authors && <span>{doc.authors}</span>}
            {doc.authors && doc.year && <span> · </span>}
            {doc.year && <span>{doc.year}</span>}
          </p>
        )}
      </div>
      {doc.doc_type && (
        <Badge className={`text-xs border w-fit ${getDocTypeBadgeClass(doc.doc_type)}`}>
          {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
        </Badge>
      )}
    </button>
  );
}
