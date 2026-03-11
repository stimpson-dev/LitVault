import { useEffect, useState } from 'react';
import { X, Loader2, Pencil, FolderOpen, FileText, Trash2, RotateCcw } from 'lucide-react';
import { getDocument, updateDocument, classifyDocument, rescanDocument, openDocument, excludeDocument, restoreDocument, ApiError } from '@/lib/api';
import type { DocumentDetail as DocumentDetailType } from '@/lib/types';
import { FavoriteButton } from '@/components/FavoriteButton';
import { TagEditor } from '@/components/TagEditor';
import { useTranslation } from '@/i18n';

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
  const { t } = useTranslation();
  const [doc, setDoc] = useState<DocumentDetailType | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [classifyFeedback, setClassifyFeedback] = useState<string | null>(null);
  const [rescanFeedback, setRescanFeedback] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setDoc(null);
    setEditingField(null);
    setClassifyFeedback(null);
    setRescanFeedback(null);
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
    if (confidence >= 0.85) return t('detail.confidenceHigh');
    if (confidence >= 0.55) return t('detail.confidenceMedium');
    return t('detail.confidenceLow');
  };

  const startEditing = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const commitEdit = async (field: string) => {
    if (!doc) return;
    try {
      const updates: Record<string, string | number | null> = {};
      if (field === 'year') {
        const parsed = parseInt(editValue, 10);
        updates[field] = isNaN(parsed) ? null : parsed;
      } else {
        updates[field] = editValue || null;
      }
      const updated = await updateDocument(docId, updates as Parameters<typeof updateDocument>[1]);
      setDoc(updated);
    } catch {
      // silently fail
    } finally {
      setEditingField(null);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, field: string) => {
    if (e.key === 'Enter' && field !== 'summary') {
      commitEdit(field);
    }
    if (e.key === 'Escape') {
      setEditingField(null);
    }
  };

  const EditableCell = ({
    field,
    displayValue,
    rawValue,
    multiline = false,
  }: {
    field: string;
    displayValue: string;
    rawValue: string;
    multiline?: boolean;
  }) => {
    if (editingField === field) {
      return multiline ? (
        <textarea
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => commitEdit(field)}
          onKeyDown={(e) => handleEditKeyDown(e, field)}
          className="text-xs bg-zinc-700 text-zinc-100 rounded px-2 py-1 w-full outline-none resize-none"
          rows={4}
        />
      ) : (
        <input
          autoFocus
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => commitEdit(field)}
          onKeyDown={(e) => handleEditKeyDown(e, field)}
          className="text-xs bg-zinc-700 text-zinc-100 rounded px-2 py-1 w-full outline-none"
        />
      );
    }
    return (
      <span className="flex items-center gap-1 group">
        <span className="text-zinc-200">{displayValue}</span>
        <button
          onClick={() => startEditing(field, rawValue)}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-opacity"
          aria-label={`${field} ${t('detail.edit')}`}
        >
          <Pencil size={11} />
        </button>
      </span>
    );
  };

  return (
    <div className="relative flex flex-col h-full">
      {/* Header — sticky at top */}
      <div className="flex items-start justify-between gap-2 p-4 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
        <h2 className="text-sm font-semibold text-zinc-100 leading-snug flex-1">
          {loading ? t('detail.loading') : (doc?.title ?? t('detail.noTitle'))}
        </h2>
        <div className="flex items-center gap-1 shrink-0">
          {doc && (
            <FavoriteButton docId={docId} />
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
            aria-label={t('detail.close')}
          >
            <X size={16} />
          </button>
        </div>
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
              <span className="text-zinc-500">{t('detail.authors')}</span>
              <EditableCell
                field="authors"
                displayValue={parseAuthors(doc.authors).join(', ') || '—'}
                rawValue={doc.authors ?? ''}
              />

              <span className="text-zinc-500">Jahr</span>
              <EditableCell
                field="year"
                displayValue={doc.year !== null ? String(doc.year) : '—'}
                rawValue={doc.year !== null ? String(doc.year) : ''}
              />

              <span className="text-zinc-500">{t('detail.docType')}</span>
              <span>
                {editingField === 'doc_type' ? (
                  <input
                    autoFocus
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitEdit('doc_type')}
                    onKeyDown={(e) => handleEditKeyDown(e, 'doc_type')}
                    className="text-xs bg-zinc-700 text-zinc-100 rounded px-2 py-1 w-full outline-none"
                  />
                ) : (
                  <span className="flex items-center gap-1 group">
                    {doc.doc_type ? (
                      <span className="inline-block px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 text-xs">
                        {doc.doc_type}
                      </span>
                    ) : (
                      <span className="text-zinc-200">—</span>
                    )}
                    <button
                      onClick={() => startEditing('doc_type', doc.doc_type ?? '')}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-opacity"
                      aria-label={`${t('detail.docType')} ${t('detail.edit')}`}
                    >
                      <Pencil size={11} />
                    </button>
                  </span>
                )}
              </span>

              <span className="text-zinc-500">{t('detail.source')}</span>
              <EditableCell
                field="source"
                displayValue={doc.source ?? '—'}
                rawValue={doc.source ?? ''}
              />

              <span className="text-zinc-500">{t('detail.language')}</span>
              <EditableCell
                field="language"
                displayValue={doc.language ?? '—'}
                rawValue={doc.language ?? ''}
              />

              <span className="text-zinc-500">{t('detail.fileType')}</span>
              <span className="text-zinc-200">{doc.file_type}</span>

              <span className="text-zinc-500">{t('detail.pages')}</span>
              <span className="text-zinc-200">{doc.page_count ?? '—'}</span>

              <span className="text-zinc-500">{t('detail.size')}</span>
              <span className="text-zinc-200">
                {doc.file_size !== null ? formatFileSize(doc.file_size) : '—'}
              </span>

              <span className="text-zinc-500">{t('detail.confidence')}</span>
              <span className="flex items-center gap-1.5 text-zinc-200">
                {doc.classification_confidence !== null ? (
                  <>
                    <span>
                      {`${Math.round(doc.classification_confidence * 100)}% — ${confidenceTier(doc.classification_confidence)}`}
                    </span>
                    {doc.classification_source && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          doc.classification_source === 'ai'
                            ? 'bg-zinc-600 text-zinc-200'
                            : 'bg-blue-600 text-white'
                        }`}
                      >
                        {doc.classification_source === 'ai' ? t('detail.classificationAI') : t('detail.classificationUser')}
                      </span>
                    )}
                  </>
                ) : (
                  '—'
                )}
              </span>
            </div>
          </div>

          {/* Thumbnail Preview */}
          {(doc.file_type === 'pdf' || doc.file_type === '.pdf') && (
            <div className="p-4 border-b border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                {t('detail.preview')}
              </h3>
              <img
                src={`/api/documents/${doc.id}/thumbnail`}
                alt={t('detail.preview')}
                className="rounded border border-zinc-700 bg-zinc-900 max-w-full"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}

          {/* Tags */}
          <div className="p-4 border-b border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
              {t('detail.tags')}
            </h3>
            <TagEditor docId={docId} />
          </div>

          {/* Summary */}
          <div className="p-4 border-b border-zinc-800">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                {t('detail.summary')}
              </h3>
              {editingField !== 'summary' && (
                <button
                  onClick={() => startEditing('summary', doc.summary ?? '')}
                  className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                  aria-label={t('detail.editSummary')}
                >
                  <Pencil size={11} />
                </button>
              )}
            </div>
            {editingField === 'summary' ? (
              <textarea
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitEdit('summary')}
                onKeyDown={(e) => handleEditKeyDown(e, 'summary')}
                className="text-xs bg-zinc-700 text-zinc-100 rounded px-2 py-1 w-full outline-none resize-none leading-relaxed"
                rows={6}
              />
            ) : (
              <p className="text-xs text-zinc-300 leading-relaxed">
                {doc.summary || '—'}
              </p>
            )}
          </div>

          {/* KI-Analyse */}
          {doc.processing_status !== 'processing' && (
            <div className="p-4 border-b border-zinc-800">
              <button
                onClick={async () => {
                  setClassifyFeedback(null);
                  try {
                    const { job_id } = await classifyDocument(doc.id);
                    setClassifyFeedback(t('detail.analysisRunning'));
                    // Poll job status until done
                    const poll = setInterval(async () => {
                      try {
                        const res = await fetch(`/api/jobs/${job_id}`);
                        if (!res.ok) { clearInterval(poll); return; }
                        const job = await res.json();
                        if (job.status === 'done') {
                          clearInterval(poll);
                          setClassifyFeedback(t('detail.analysisDone'));
                          const updated = await getDocument(doc.id);
                          setDoc(updated);
                        } else if (job.status === 'error') {
                          clearInterval(poll);
                          setClassifyFeedback(`${t('detail.analysisFailed')}: ${job.error ?? 'Unbekannter Fehler'}`);
                        }
                      } catch {
                        clearInterval(poll);
                      }
                    }, 2000);
                  } catch {
                    setClassifyFeedback(t('detail.analysisError'));
                  }
                }}
                className="text-xs px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
              >
                {classifyFeedback === t('detail.analysisRunning') ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" />
                    {t('detail.analysisRunning')}
                  </span>
                ) : (
                  doc.classification_source ? t('detail.classifyRetry') : t('detail.classifyStart')
                )}
              </button>
              {classifyFeedback && classifyFeedback !== t('detail.analysisRunning') && (
                <span className="ml-3 text-xs text-zinc-400">{classifyFeedback}</span>
              )}
            </div>
          )}

          {/* File path */}
          <div className="p-4">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
              {t('detail.filePath')}
            </h3>
            <p className="text-xs font-mono bg-zinc-800 p-2 rounded break-all text-zinc-300">
              {doc.file_path}
            </p>
            <button
              onClick={async () => {
                try {
                  await openDocument(doc.id);
                } catch { /* ignore */ }
              }}
              className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <FileText size={13} />
              {t('detail.openDoc')}
            </button>
            <button
              onClick={async () => {
                try {
                  await fetch(`/api/documents/${doc.id}/open-folder`, { method: 'POST' });
                } catch { /* ignore */ }
              }}
              className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <FolderOpen size={13} />
              {t('detail.openExplorer')}
            </button>
            {doc.processing_status === 'error' && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={async () => {
                    setRescanFeedback(null);
                    try {
                      await rescanDocument(doc.id);
                      setRescanFeedback(t('detail.scanStarted'));
                    } catch (err: unknown) {
                      const msg = err instanceof ApiError && err.status === 400
                        ? t('detail.fileUnreachable')
                        : t('detail.scanError');
                      setRescanFeedback(msg);
                    }
                  }}
                  className="text-xs px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
                >
                  {t('detail.rescan')}
                </button>
                {rescanFeedback && (
                  <span className="text-xs text-zinc-400">{rescanFeedback}</span>
                )}
              </div>
            )}

            {/* Exclude / Restore */}
            <div className="mt-4 pt-3 border-t border-zinc-800">
              {doc.excluded ? (
                <button
                  onClick={async () => {
                    try {
                      await restoreDocument(doc.id);
                      const updated = await getDocument(doc.id);
                      setDoc(updated);
                    } catch { /* ignore */ }
                  }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-300 transition-colors"
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
                      onClose();
                    } catch { /* ignore */ }
                  }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-red-900/40 text-zinc-500 hover:text-red-300 transition-colors"
                >
                  <Trash2 size={12} />
                  {t('detail.exclude')}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-zinc-500">{t('detail.notFound')}</p>
        </div>
      )}
    </div>
  );
}
