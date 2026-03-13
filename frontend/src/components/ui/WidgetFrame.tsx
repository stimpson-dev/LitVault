import { Skeleton } from './Skeleton';

interface WidgetFrameProps {
  title: string;
  badge?: number;
  loading?: boolean;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
}

export function WidgetFrame({ title, badge, loading, children, headerActions }: WidgetFrameProps) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
          {badge !== undefined && (
            <span className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full">{badge}</span>
          )}
        </div>
        {headerActions}
      </div>
      <div className="p-4">
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : children}
      </div>
    </div>
  );
}
