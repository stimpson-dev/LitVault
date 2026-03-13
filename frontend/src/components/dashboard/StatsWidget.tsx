import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Sparkles, RotateCcw, ScanEye, Check, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats, classifyBatch, rescanAllErrors, rescanNoText } from '@/lib/api';
import type { DashboardStats } from '@/lib/types';
import { useTranslation } from '@/i18n';
import { WidgetFrame } from '@/components/ui/WidgetFrame';

type Accent = 'neutral' | 'red' | 'emerald' | 'amber' | 'orange';

interface StatCardProps {
  label: string;
  count: number;
  total?: number;
  accent?: Accent;
  icon?: React.ReactNode;
  onClick?: () => void;
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

function StatCard({ label, count, total, accent = 'neutral', icon, onClick }: StatCardProps) {
  const pct = total && total > 0 ? Math.round((count / total) * 100) : null;
  const cfg = accentConfig[accent];

  return (
    <div
      className={`
        relative bg-zinc-800/60 rounded-lg p-3 ring-1 ${cfg.ring} ${cfg.glow}
        hover:bg-zinc-800/80 transition-all duration-200
        ${onClick ? 'cursor-pointer' : ''}
      `}
      onClick={onClick}
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

const btnAccents: Record<string, string> = {
  emerald: 'hover:border-emerald-500/30 hover:text-emerald-300',
  red: 'hover:border-red-500/30 hover:text-red-300',
  orange: 'hover:border-orange-500/30 hover:text-orange-300',
};

interface ActionButtonProps {
  label: string;
  icon?: React.ReactNode;
  feedbackText: string | null;
  errorText: string;
  onClick: () => void;
  accent?: 'emerald' | 'red' | 'orange';
}

function ActionButton({ label, icon, feedbackText, errorText, onClick, accent = 'emerald' }: ActionButtonProps) {
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
        <span className={`text-[10px] ${feedbackText === errorText ? 'text-red-400' : 'text-zinc-500'}`}>
          {feedbackText}
        </span>
      )}
    </div>
  );
}

export function StatsWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
  }, [fetchStats]);

  const runAction = async (key: string, action: () => Promise<{ queued?: number; job_id?: string }>) => {
    setFeedback((prev) => ({ ...prev, [key]: '...' }));
    try {
      const result = await action();
      const count = result.queued ?? 1;
      setFeedback((prev) => ({ ...prev, [key]: `${count} ${t('stats.jobsStarted')}` }));
      fetchStats();
    } catch {
      setFeedback((prev) => ({ ...prev, [key]: t('jobs.error') }));
    }
    setTimeout(() => setFeedback((prev) => ({ ...prev, [key]: null })), 4000);
  };

  const handleRefresh = () => {
    setSpinning(true);
    fetchStats().finally(() => setTimeout(() => setSpinning(false), 600));
  };

  const refreshButton = (
    <button
      onClick={handleRefresh}
      className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all"
      title={t('stats.refresh')}
    >
      <RefreshCw size={13} className={spinning ? 'animate-spin' : ''} />
    </button>
  );

  return (
    <WidgetFrame
      title={t('dashboard.statistics')}
      loading={loading && !stats}
      headerActions={refreshButton}
    >
      {/* Stats grid */}
      <div className="-m-1">
        {stats ? (
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label={t('stats.total')}
              count={stats.total}
              icon={<span className="text-[11px] font-bold">#</span>}
              onClick={() => navigate('/')}
            />
            <StatCard
              label={t('stats.scanned')}
              count={stats.by_status.done}
              total={stats.total}
              icon={<Check size={13} />}
            />
            <StatCard
              label={t('stats.errors')}
              count={stats.errors}
              total={stats.total}
              accent="red"
              icon={<AlertCircle size={13} />}
              onClick={() => navigate('/?processing_status=error')}
            />
            <StatCard
              label={t('stats.aiAnalyzed')}
              count={stats.by_classification.ai}
              total={stats.total}
              accent="emerald"
              icon={<Sparkles size={13} />}
              onClick={() => navigate('/')}
            />
            <StatCard
              label={t('stats.awaitingAI')}
              count={stats.needs_ai}
              total={stats.total}
              accent="amber"
            />
            <StatCard
              label={t('stats.needsOCR')}
              count={stats.needs_ocr}
              total={stats.total}
              accent="orange"
              icon={<ScanEye size={13} />}
              onClick={() => navigate('/?processing_status=done')}
            />
          </div>
        ) : null}
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent mt-3 -mx-4" />

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-3">
        <ActionButton
          label={t('stats.aiBatch')}
          icon={<Sparkles size={11} />}
          feedbackText={feedback['classify'] ?? null}
          errorText={t('jobs.error')}
          onClick={() => runAction('classify', classifyBatch)}
          accent="emerald"
        />
        <ActionButton
          label={t('stats.scanErrors')}
          icon={<RotateCcw size={11} />}
          feedbackText={feedback['rescan-errors'] ?? null}
          errorText={t('jobs.error')}
          onClick={() => runAction('rescan-errors', rescanAllErrors)}
          accent="red"
        />
        <ActionButton
          label={t('stats.ocrRescan')}
          icon={<ScanEye size={11} />}
          feedbackText={feedback['rescan-notext'] ?? null}
          errorText={t('jobs.error')}
          onClick={() => runAction('rescan-notext', rescanNoText)}
          accent="orange"
        />
      </div>
    </WidgetFrame>
  );
}
