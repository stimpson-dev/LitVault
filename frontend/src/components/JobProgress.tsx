import { useState, useEffect, useRef } from 'react';
import { listJobs } from '@/lib/api';
import type { Job } from '@/lib/types';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';

export function JobProgress() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeProgress, setActiveProgress] = useState<{
    status: string;
    current: number;
    total: number;
    message: string;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);

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
        if (data.status === 'done' || data.status === 'error') {
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
    }, 15000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (esRef.current) esRef.current.close();
    };
  }, []);

  const recentJobs = jobs.slice(0, 5);
  const activeJob = jobs.find((j) => j.status === 'processing');

  if (!activeJob && recentJobs.length === 0) return null;

  const progressPercent =
    activeProgress && activeProgress.total > 0
      ? (activeProgress.current / activeProgress.total) * 100
      : 0;

  function statusDotClass(status: string) {
    if (status === 'processing') return 'bg-yellow-400';
    if (status === 'done') return 'bg-green-500';
    if (status === 'error') return 'bg-red-500';
    return 'bg-zinc-500';
  }

  function statusLabel(status: string) {
    if (status === 'processing') return 'Läuft';
    if (status === 'done') return 'Fertig';
    if (status === 'error') return 'Fehler';
    return status;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl p-3 w-72">
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-medium">
              <Activity size={13} />
              <span>Jobs</span>
              {activeJob && (
                <span
                  className={`inline-block w-2 h-2 rounded-full ${statusDotClass('processing')}`}
                />
              )}
            </div>
            {expanded ? <ChevronUp size={13} className="text-zinc-500" /> : <ChevronDown size={13} className="text-zinc-500" />}
          </div>

          {activeJob && activeProgress && (
            <>
              <div className="w-full bg-zinc-700 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                {activeProgress.current}/{activeProgress.total} — {activeProgress.message}
              </p>
            </>
          )}

          {activeJob && !activeProgress && (
            <div className="w-full bg-zinc-700 rounded-full h-2">
              <div className="bg-yellow-400 h-2 rounded-full w-1/3 animate-pulse" />
            </div>
          )}
        </button>

        {expanded && (
          <div className="mt-2 border-t border-zinc-800 pt-2">
            {recentJobs.length === 0 ? (
              <p className="text-xs text-zinc-500">Keine Jobs</p>
            ) : (
              <ul>
                {recentJobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex items-center justify-between py-1 border-b border-zinc-800 last:border-0"
                  >
                    <span className="text-xs text-zinc-400 truncate max-w-[140px]">{job.type}</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${statusDotClass(job.status)}`}
                      />
                      <span className="text-xs text-zinc-500">{statusLabel(job.status)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
