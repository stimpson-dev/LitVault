import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SidebarSectionProps {
  title: string;
  slim: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function SidebarSection({ title, slim, defaultOpen = true, children }: SidebarSectionProps) {
  const storageKey = `litvault-sidebar-${title}`;
  const [open, setOpen] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    return stored !== null ? stored === 'true' : defaultOpen;
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem(storageKey, String(next));
  };

  if (slim) {
    // In slim mode, always show children (no section headers)
    return <div className="py-1">{children}</div>;
  }

  return (
    <div className="py-1">
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-400 transition-colors"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {title}
      </button>
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? '500px' : '0px' }}
      >
        {children}
      </div>
    </div>
  );
}
