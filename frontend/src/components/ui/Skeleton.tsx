interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`bg-zinc-800 animate-pulse rounded ${className}`} />;
}
