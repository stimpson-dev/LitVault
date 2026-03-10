import { useState, useEffect, useRef } from 'react';
import { listJobs, cancelJob } from '@/lib/api';
import type { Job } from '@/lib/types';
import { X, RefreshCw, XCircle, Loader2, CheckCircle2, AlertCircle, Clock, Ban } from 'lucide-react';

interface JobProgressProps {
  onClose: () => void;
}

type JobStatus = 'processing' | 'done' | 'error' | 'cancelled' | 'queued';

const statusConfig: Record<JobStatus, { dot: string; label: string; text: string; ring: string; bg: string }> = {
  processing: {
    dot: 'bg-amber-400',
    label: 'Läuft',
    text: 'text-amber-300',
    ring: 'ring-amber-500/20',
    bg: 'bg-amber-500/5',
  },
  done: {
    dot: 'bg-emerald-500',
    label: 'Fertig',
    text: 'text-emerald-400',
    ring: 'ring-emerald-500/20',
    bg: 'bg-emerald-500/5',
  },
  error: {
    dot: 'bg-red-500',
    label: 'Fehler',
    text: 'text-red-400',
    ring: 'ring-red-500/20',
    bg: 'bg-red-500/5',
  },
  cancelled: {
    dot: 'bg-orange-400',
    label: 'Abgebrochen',
    text: 'text-orange-400',
    ring: 'ring-orange-500/20',
    bg: 'bg-orange-500/5',
  },
  queued: {
    dot: 'bg-blue-400',
    label: 'Wartend',
    text: 'text-blue-400',
    ring: 'ring-blue-500/20',
    bg: 'bg-blue-500/5',
  },
};

function getStatusConfig(status: string) {
  return statusConfig[status as JobStatus] ?? {
    dot: 'bg-zinc-500',
    label: status,
    text: 'text-zinc-400',
    ring: 'ring-zinc-700/50',
    bg: 'bg-zinc-800/30',
  };
}

function StatusIcon({ status, size = 12 }: { status: string; size?: number }) {
  const cls = getStatusConfig(status).text;
  if (status === 'processing') return <Loader2 size={size} className={`${cls} animate-spin`} />;
  if (status === 'done') return <CheckCircle2 size={size} className={cls} />;
  if (status === 'error') return <AlertCircle size={size} className={cls} />;
  if (status === 'cancelled') return <Ban size={size} className={cls} />;
  if (status === 'queued') return <Clock size={size} className={cls} />;
  return <div className={`w-1.5 h-1.5 rounded-full ${getStatusConfig(status).dot}`} />;
}

function typeLabel(type: string) {
  if (type === 'crawl') return 'Crawl';
  if (type === 'classify') return 'KI-Analyse';
  if (type === 'rescan') return 'Re-Scan';
  return type;
}

function shortenMessage(msg: string) {
  if (!msg) return '';
  const parts = msg.replace(/\\/g, '/').split('/');
  const last = parts[parts.length - 1];
  const prefix = msg.split(':')[0];
  if (prefix !== msg && last) return `${prefix}: ...${last}`;
  return msg.length > 60 ? '...' + msg.slice(-55) : msg;
}

export function JobProgress({ onClose }: JobProgressProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeProgress, setActiveProgress] = useState<{
    status: string;
    current: number;
    total: number;
    message: string;
  } | null>(null);
  const [spinning, setSpinning] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchJobs() {
    try {
      const fetched = await listJobs();
      setJobs(fetched);
      return fetched;
    } catch {
      return [] as Job[];
    }
  }

  function connectSSE(jobId: string) {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    const es = new EventSource(`/api/jobs/${jobId}/progress`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          status: string;
          current: number;
          total: number;
          message: string;
        };
        setActiveProgress({
          status: data.status,
          current: data.current,
          total: data.total,
          message: data.message,
        });
        if (data.status === 'done' || data.status === 'error' || data.status === 'cancelled') {
          es.close();
          esRef.current = null;
          fetchJobs();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
    };
  }

  useEffect(() => {
    fetchJobs().then((fetched) => {
      const processing = fetched.find((j) => j.status === 'processing');
      if (processing) {
        connectSSE(processing.id);
      }
    });

    intervalRef.current = setInterval(async () => {
      const fetched = await fetchJobs();
      const processing = fetched.find((j) => j.status === 'processing');
      if (processing && !esRef.current) {
        connectSSE(processing.id);
      } else if (!processing && esRef.current) {
        esRef.current.close();
        esRef.current = null;
        setActiveProgress(null);
      }
    }, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (esRef.current) esRef.current.close();
    };
  }, []);

  const activeJob = jobs.find((j) => j.status === 'processing');
  const queuedJobs = jobs.filter((j) => j.status === 'queued');
  const recentJobs = jobs.filter((j) => j.status !== 'processing' && j.status !== 'queued').slice(0, 8);

  const progressPercent =
    activeProgress && activeProgress.total > 0
      ? (activeProgress.current / activeProgress.total) * 100
      : 0;

  const handleRefresh = () => {
    setSpinning(true);
    fetchJobs().finally(() => setTimeout(() => setSpinning(false), 600));
  };

  return (
    <div
      className="
        bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50
        rounded-xl shadow-2xl shadow-black/40 w-[500px] max-w-full
        ring-1 ring-white/[0.03]
      "
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          {activeJob ? (
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          )}
          <span className="text-[13px] font-medium text-zinc-200 tracking-tight">Jobs</span>
          {queuedJobs.length > 0 && (
            <span className="text-[11px] text-zinc-500 tabular-nums">
              {queuedJobs.length} wartend
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all"
            title="Aktualisieren"
          >
            <RefreshCw size={13} className={spinning ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all"
            title="Schließen"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Active job */}
      {activeJob && (
        <div className="px-3 pb-3">
          <div
            className="
              relative bg-zinc-800/60 rounded-lg p-3 ring-1 ring-amber-500/20
              shadow-[inset_0_1px_0_0_rgba(245,158,11,0.06)]
            "
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center">
                  <Loader2 size={12} className="text-amber-300 animate-spin" />
                </div>
                <span className="text-[12px] font-medium text-amber-200">
                  {typeLabel(activeJob.type)}
                </span>
              </div>
              <button
                onClick={async () => {
                  try {
                    await cancelJob(activeJob.id);
                    fetchJobs();
                  } catch { /* ignore */ }
                }}
                className="
                  p-1 rounded-md text-zinc-600 hover:text-red-400
                  hover:bg-red-500/10 transition-all duration-200
                "
                title="Abbrechen"
              >
                <XCircle size={13} />
              </button>
            </div>

            {activeProgress ? (
              <>
                <div className="w-full h-1.5 bg-zinc-700/60 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500 truncate max-w-[320px]">
                    {shortenMessage(activeProgress.message)}
                  </span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[10px] tabular-nums text-zinc-500">
                      {activeProgress.current}/{activeProgress.total}
                    </span>
                    <span className="text-[10px] tabular-nums text-amber-400/80">
                      {Math.round(progressPercent)}%
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-1.5 bg-zinc-700/60 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-amber-400/60 w-1/3 animate-pulse" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Queued jobs */}
      {queuedJobs.length > 0 && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent" />
          <div className="px-4 py-2.5">
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Warteschlange</span>
            <ul className="mt-1.5 space-y-0.5">
              {queuedJobs.slice(0, 5).map((job) => (
                <li
                  key={job.id}
                  className="
                    flex items-center justify-between py-1.5 px-2 rounded-md
                    hover:bg-zinc-800/40 transition-colors duration-150
                  "
                >
                  <span className="text-[11px] text-zinc-400">{typeLabel(job.type)}</span>
                  <div className="flex items-center gap-1.5">
                    <StatusIcon status={job.status} size={11} />
                    <span className="text-[11px] text-blue-400/70">{getStatusConfig(job.status).label}</span>
                  </div>
                </li>
              ))}
              {queuedJobs.length > 5 && (
                <li className="text-[10px] text-zinc-600 py-1 px-2">
                  +{queuedJobs.length - 5} weitere
                </li>
              )}
            </ul>
          </div>
        </>
      )}

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent" />

      {/* Recent jobs */}
      <div className="px-4 py-2.5">
        <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Letzte Jobs</span>
        {recentJobs.length === 0 ? (
          <p className="text-[11px] text-zinc-600 py-3 text-center">Keine abgeschlossenen Jobs</p>
        ) : (
          <ul className="mt-1.5 space-y-0.5">
            {recentJobs.map((job) => {
              const cfg = getStatusConfig(job.status);
              return (
                <li
                  key={job.id}
                  className={`
                    flex items-center justify-between py-1.5 px-2 rounded-md
                    hover:${cfg.bg} transition-colors duration-150
                  `}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusIcon status={job.status} size={11} />
                    <span className="text-[11px] text-zinc-400 truncate">{typeLabel(job.type)}</span>
                  </div>
                  <span className={`text-[11px] shrink-0 ml-2 ${cfg.text} opacity-70`}>
                    {cfg.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
