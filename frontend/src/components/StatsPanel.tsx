import { useEffect, useState, useCallback } from 'react';
import { X, RefreshCw, Sparkles, RotateCcw, ScanEye, Check, AlertCircle } from 'lucide-react';
import { getDashboardStats, classifyBatch, rescanAllErrors, rescanNoText } from '@/lib/api';
import type { DashboardStats } from '@/lib/types';

interface StatsPanelProps {
  onClose: () => void;
}

type Accent = 'neutral' | 'red' | 'emerald' | 'amber' | 'orange';

interface StatCardProps {
  label: string;
  count: number;
  total?: number;
  accent?: Accent;
  icon?: React.ReactNode;
}

const accentConfig: Record<Accent, { ring: string; bar: string; num: string; glow: string; iconBg: string }> = {
  neutral: {
    ring: 'ring-zinc-700/50',
    bar: 'bg-zinc-500',
    num: 'text-zinc-50',
    glow: '',
    iconBg: 'bg-zinc-800 text-zinc-400',
  },
  red: {
    ring: 'ring-red-500/20',
    bar: 'bg-red-500',
    num: 'text-red-400',
    glow: 'shadow-[inset_0_1px_0_0_rgba(239,68,68,0.06)]',
    iconBg: 'bg-red-500/10 text-red-400',
  },
  emerald: {
    ring: 'ring-emerald-500/20',
    bar: 'bg-emerald-500',
    num: 'text-emerald-400',
    glow: 'shadow-[inset_0_1px_0_0_rgba(16,185,129,0.06)]',
    iconBg: 'bg-emerald-500/10 text-emerald-400',
  },
  amber: {
    ring: 'ring-amber-500/20',
    bar: 'bg-amber-400',
    num: 'text-amber-300',
    glow: 'shadow-[inset_0_1px_0_0_rgba(245,158,11,0.06)]',
    iconBg: 'bg-amber-500/10 text-amber-400',
  },
  orange: {
    ring: 'ring-orange-500/20',
    bar: 'bg-orange-400',
    num: 'text-orange-300',
    glow: 'shadow-[inset_0_1px_0_0_rgba(249,115,22,0.06)]',
    iconBg: 'bg-orange-500/10 text-orange-400',
  },
};

function StatCard({ label, count, total, accent = 'neutral', icon }: StatCardProps) {
  const pct = total && total > 0 ? Math.round((count / total) * 100) : null;
  const cfg = accentConfig[accent];

  return (
    <div
      className={`
        relative bg-zinc-800/60 rounded-lg p-3 ring-1 ${cfg.ring} ${cfg.glow}
        hover:bg-zinc-800/80 transition-all duration-200
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[11px] text-zinc-500 leading-tight tracking-wide uppercase">
            {label}
          </span>
          <span className={`text-xl font-semibold tabular-nums leading-none ${cfg.num}`}>
            {count.toLocaleString('de-DE')}
          </span>
        </div>
        {icon && (
          <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${cfg.iconBg}`}>
            {icon}
          </div>
        )}
      </div>
      {pct !== null && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="flex-1 h-1 bg-zinc-700/60 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-zinc-500 shrink-0">{pct}%</span>
        </div>
      )}
    </div>
  );
}

type ButtonFeedback = Record<string, string | null>;

export function StatsPanel({ onClose }: StatsPanelProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<ButtonFeedback>({});
  const [spinning, setSpinning] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch {
      // silently keep previous data on refresh failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const runAction = async (key: string, action: () => Promise<{ queued?: number; job_id?: string }>) => {
    setFeedback((prev) => ({ ...prev, [key]: '...' }));
    try {
      const result = await action();
      const count = result.queued ?? 1;
      setFeedback((prev) => ({ ...prev, [key]: `${count} Jobs gestartet` }));
      fetchStats();
    } catch {
      setFeedback((prev) => ({ ...prev, [key]: 'Fehler' }));
    }
    setTimeout(() => setFeedback((prev) => ({ ...prev, [key]: null })), 4000);
  };

  const handleRefresh = () => {
    setSpinning(true);
    fetchStats().finally(() => setTimeout(() => setSpinning(false), 600));
  };

  return (
    <div
      className="
        bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50
        rounded-xl shadow-2xl shadow-black/40 w-[540px] max-w-full
        ring-1 ring-white/[0.03]
      "
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[13px] font-medium text-zinc-200 tracking-tight">Dashboard</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all"
            title="Aktualisieren"
          >
            <RefreshCw
              size={13}
              className={spinning ? 'animate-spin' : ''}
            />
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

      {/* Stats grid */}
      <div className="px-3 pb-3">
        {loading && !stats ? (
          <div className="text-xs text-zinc-600 py-8 text-center">Lade Statistiken…</div>
        ) : stats ? (
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="Gesamt"
              count={stats.total}
              icon={<span className="text-[11px] font-bold">#</span>}
            />
            <StatCard
              label="Gescannt"
              count={stats.by_status.done}
              total={stats.total}
              icon={<Check size={13} />}
            />
            <StatCard
              label="Fehler"
              count={stats.errors}
              total={stats.total}
              accent="red"
              icon={<AlertCircle size={13} />}
            />
            <StatCard
              label="KI analysiert"
              count={stats.by_classification.ai}
              total={stats.total}
              accent="emerald"
              icon={<Sparkles size={13} />}
            />
            <StatCard
              label="Wartet auf KI"
              count={stats.needs_ai}
              total={stats.total}
              accent="amber"
            />
            <StatCard
              label="OCR nötig"
              count={stats.needs_ocr}
              total={stats.total}
              accent="orange"
              icon={<ScanEye size={13} />}
            />
          </div>
        ) : null}
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent" />

      {/* Action buttons */}
      <div className="flex items-center gap-2 px-4 py-3">
        <ActionButton
          label="KI-Batch"
          icon={<Sparkles size={11} />}
          feedbackText={feedback['classify'] ?? null}
          onClick={() => runAction('classify', classifyBatch)}
          accent="emerald"
        />
        <ActionButton
          label="Fehler scannen"
          icon={<RotateCcw size={11} />}
          feedbackText={feedback['rescan-errors'] ?? null}
          onClick={() => runAction('rescan-errors', rescanAllErrors)}
          accent="red"
        />
        <ActionButton
          label="OCR Re-Scan"
          icon={<ScanEye size={11} />}
          feedbackText={feedback['rescan-notext'] ?? null}
          onClick={() => runAction('rescan-notext', rescanNoText)}
          accent="orange"
        />
      </div>
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  icon?: React.ReactNode;
  feedbackText: string | null;
  onClick: () => void;
  accent?: 'emerald' | 'red' | 'orange';
}

const btnAccents: Record<string, string> = {
  emerald: 'hover:border-emerald-500/30 hover:text-emerald-300',
  red: 'hover:border-red-500/30 hover:text-red-300',
  orange: 'hover:border-orange-500/30 hover:text-orange-300',
};

function ActionButton({ label, icon, feedbackText, onClick, accent = 'emerald' }: ActionButtonProps) {
  const isFeedback = feedbackText !== null;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onClick}
        disabled={feedbackText === '...'}
        className={`
          inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md
          bg-zinc-800/60 border border-zinc-700/50 text-zinc-400
          transition-all duration-200 disabled:opacity-50
          ${btnAccents[accent]}
        `}
      >
        {icon}
        {label}
      </button>
      {isFeedback && (
        <span className={`text-[10px] ${feedbackText === 'Fehler' ? 'text-red-400' : 'text-zinc-500'}`}>
          {feedbackText}
        </span>
      )}
    </div>
  );
}
