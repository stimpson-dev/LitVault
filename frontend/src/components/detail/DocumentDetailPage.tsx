import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, FileText, FolderOpen, Search, Trash2, RotateCcw } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { getDocument, openDocument, excludeDocument, restoreDocument } from '@/lib/api';
import type { DocumentDetail as DocumentDetailType } from '@/lib/types';
import { FavoriteButton } from '@/components/FavoriteButton';
import { PdfViewer } from './PdfViewer';
import { DetailsTab } from './DetailsTab';
import { ContentTab } from './ContentTab';
import { MetadataTab } from './MetadataTab';
import { NotesTab } from './NotesTab';
import { useTranslation } from '@/i18n';

interface ShellContext {
  addRecent: (id: number, title: string) => void;
}

type TabId = 'details' | 'content' | 'metadata' | 'notes';

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const context = useOutletContext<ShellContext | undefined>();
  const { t } = useTranslation();
  const docId = Number(id);

  const [doc, setDoc] = useState<DocumentDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('details');

  // Read docListIds from sessionStorage for Save & Next navigation
  const docListIds: number[] = useMemo(
    () => JSON.parse(sessionStorage.getItem('docListIds') || '[]'),
    // Re-read when docId changes (navigating between docs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docId],
  );
  const currentIndex = docListIds.indexOf(docId);
  const prevDocId = currentIndex > 0 ? docListIds[currentIndex - 1] : null;
  const nextDocId =
    currentIndex >= 0 && currentIndex < docListIds.length - 1
      ? docListIds[currentIndex + 1]
      : null;

  useEffect(() => {
    setLoading(true);
    setDoc(null);
    getDocument(docId)
      .then(setDoc)
      .catch(() => setDoc(null))
      .finally(() => setLoading(false));
  }, [docId]);

  useEffect(() => {
    if (doc && context?.addRecent) {
      context.addRecent(
        doc.id,
        doc.title || doc.file_path.split(/[\\/]/).pop() || `#${doc.id}`,
      );
    }
  }, [doc, context]);

  const handleSave = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  const handleSaveAndNext = useCallback(() => {
    handleSave();
    if (nextDocId) navigate(`/documents/${nextDocId}`);
  }, [handleSave, navigate, nextDocId]);

  const handleMoreLikeThis = useCallback(() => {
    if (!doc) return;
    const q = doc.title || '';
    navigate(`/documents?q=${encodeURIComponent(q)}`);
  }, [doc, navigate]);

  useKeyboardShortcuts(
    useMemo(
      () => ({
        'ctrl+s': () => handleSave(),
        'ctrl+shift+s': () => handleSaveAndNext(),
        escape: () => navigate(-1),
        'ctrl+arrowleft': () => prevDocId && navigate(`/documents/${prevDocId}`),
        'ctrl+arrowright': () => nextDocId && navigate(`/documents/${nextDocId}`),
      }),
      [handleSave, handleSaveAndNext, navigate, prevDocId, nextDocId],
    ),
  );

  const tabs: { id: TabId; label: string }[] = [
    { id: 'details', label: t('detail.tabDetails') },
    { id: 'content', label: t('detail.tabContent') },
    { id: 'metadata', label: t('detail.tabMetadata') },
    { id: 'notes', label: t('detail.tabNotes') },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
        >
          <ArrowLeft size={14} />
          {t('detail.back')}
        </button>

        <h1 className="text-sm font-semibold text-zinc-100 truncate flex-1">
          {loading ? t('detail.loading') : (doc?.title ?? t('detail.noTitle'))}
        </h1>

        {/* Action buttons */}
        {doc && (
          <div className="flex items-center gap-1 shrink-0">
            {/* More like this */}
            <button
              onClick={handleMoreLikeThis}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
              title={t('detail.moreLikeThis')}
            >
              <Search size={15} />
            </button>

            <FavoriteButton docId={doc.id} />
            <button
              onClick={async () => {
                try { await openDocument(doc.id); } catch { /* ignore */ }
              }}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
              title={t('detail.openDoc')}
            >
              <FileText size={15} />
            </button>
            <button
              onClick={async () => {
                try {
                  await fetch(`/api/documents/${doc.id}/open-folder`, { method: 'POST' });
                } catch { /* ignore */ }
              }}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
              title={t('detail.openExplorer')}
            >
              <FolderOpen size={15} />
            </button>
            {doc.excluded ? (
              <button
                onClick={async () => {
                  try {
                    await restoreDocument(doc.id);
                    const updated = await getDocument(doc.id);
                    setDoc(updated);
                  } catch { /* ignore */ }
                }}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-300 transition-colors"
              >
                <RotateCcw size={12} />
                {t('detail.restore')}
              </button>
            ) : (
              <button
                onClick={async () => {
                  if (!confirm(t('detail.excludeConfirm'))) return;
                  try {
                    await excludeDocument(doc.id);
                    navigate(-1);
                  } catch { /* ignore */ }
                }}
                className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-300 transition-colors"
                title={t('detail.exclude')}
              >
                <Trash2 size={15} />
              </button>
            )}

            {/* Separator */}
            {docListIds.length > 0 && (
              <span className="w-px h-4 bg-zinc-700 mx-1" />
            )}

            {/* Position indicator + prev/next navigation */}
            {docListIds.length > 0 && (
              <>
                <span className="text-xs text-zinc-500 tabular-nums">
                  {currentIndex >= 0 ? currentIndex + 1 : '–'} {t('detail.of')} {docListIds.length}
                </span>
                <button
                  onClick={() => prevDocId && navigate(`/documents/${prevDocId}`)}
                  disabled={!prevDocId}
                  className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={`${t('detail.prev')} (Ctrl+←)`}
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  onClick={() => nextDocId && navigate(`/documents/${nextDocId}`)}
                  disabled={!nextDocId}
                  className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={`${t('detail.next')} (Ctrl+→)`}
                >
                  <ChevronRight size={15} />
                </button>
              </>
            )}

            {/* Save & Next */}
            {nextDocId && (
              <button
                onClick={handleSaveAndNext}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors"
                title="Ctrl+Shift+S"
              >
                <ArrowRight size={12} />
                {t('detail.saveNext')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: tabs — 40% width */}
        <div className="w-2/5 min-w-[320px] max-w-[560px] overflow-y-auto border-r border-zinc-800 flex flex-col">
          {/* Tab bar */}
          <div className="flex border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10 shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-zinc-100 border-b-2 border-zinc-300'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1">
            {loading ? (
              <div className="p-4 flex flex-col gap-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ) : !doc ? (
              <div className="p-4 text-xs text-zinc-500">{t('detail.notFound')}</div>
            ) : (
              <>
                {activeTab === 'details' && (
                  <DetailsTab doc={doc} onDocUpdate={setDoc} />
                )}
                {activeTab === 'content' && (
                  <ContentTab doc={doc} />
                )}
                {activeTab === 'metadata' && (
                  <MetadataTab doc={doc} />
                )}
                {activeTab === 'notes' && (
                  <NotesTab />
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: PDF viewer — 60% */}
        <div className="flex-1 bg-zinc-900 overflow-hidden">
          {doc && <PdfViewer docId={doc.id} fileType={doc.file_type} />}
        </div>
      </div>
    </div>
  );
}
