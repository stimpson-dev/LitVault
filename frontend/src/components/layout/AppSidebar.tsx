import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  ClipboardCheck,
  Bookmark,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useTranslation } from '@/i18n';
import { SidebarSection } from './SidebarSection';

interface AppSidebarProps {
  slim: boolean;
  onToggleSlim: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenSettings: () => void;
}

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  slim: boolean;
  onClick?: () => void;
  end?: boolean;
}

function NavItem({ to, icon, label, slim, onClick, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 mx-2 rounded-md text-sm transition-colors ${
          isActive
            ? 'bg-zinc-800 text-zinc-100'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
        } ${slim ? 'justify-center' : ''}`
      }
      title={slim ? label : undefined}
    >
      <span className="shrink-0">{icon}</span>
      {!slim && (
        <span className="truncate transition-opacity duration-100">{label}</span>
      )}
    </NavLink>
  );
}

function SidebarButton({ icon, label, slim, onClick }: {
  icon: React.ReactNode;
  label: string;
  slim: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 mx-2 rounded-md text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors w-[calc(100%-16px)] ${
        slim ? 'justify-center' : ''
      }`}
      title={slim ? label : undefined}
    >
      <span className="shrink-0">{icon}</span>
      {!slim && <span className="truncate transition-opacity duration-100">{label}</span>}
    </button>
  );
}

export function AppSidebar({ slim, onToggleSlim, mobileOpen, onCloseMobile, onOpenSettings }: AppSidebarProps) {
  const { t } = useTranslation();

  const closeMobileOnNav = () => {
    if (mobileOpen) onCloseMobile();
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`
          fixed top-14 bottom-0 z-40 bg-zinc-950 border-r border-zinc-800
          flex flex-col overflow-y-auto overflow-x-hidden
          transition-all duration-200 ease-in-out
          ${mobileOpen ? 'left-0 w-64' : '-left-64 md:left-0'}
          md:sticky md:top-14
        `}
        style={{
          width: mobileOpen ? '256px' : undefined,
          ...(!mobileOpen ? { width: slim ? '50px' : '256px' } : {}),
        }}
      >
        {/* Main navigation */}
        <SidebarSection title={t('toolbar.navigation')} slim={slim} defaultOpen>
          <NavItem
            to="/dashboard"
            icon={<LayoutDashboard className="size-4" />}
            label={t('toolbar.dashboard')}
            slim={slim}
            onClick={closeMobileOnNav}
          />
          <NavItem
            to="/"
            end
            icon={<FileText className="size-4" />}
            label={t('toolbar.documents')}
            slim={slim}
            onClick={closeMobileOnNav}
          />
          <NavItem
            to="/review"
            icon={<ClipboardCheck className="size-4" />}
            label={t('toolbar.review')}
            slim={slim}
            onClick={closeMobileOnNav}
          />
        </SidebarSection>

        {/* Saved Views placeholder */}
        <SidebarSection title={t('toolbar.savedSearches')} slim={slim} defaultOpen>
          {!slim && (
            <p className="px-5 py-2 text-xs text-zinc-500">
              {t('sidebar.noSavedSearches')}
            </p>
          )}
          {slim && (
            <div className="flex justify-center py-2" title={t('toolbar.savedSearches')}>
              <Bookmark className="size-4 text-zinc-500" />
            </div>
          )}
        </SidebarSection>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Manage section */}
        <SidebarSection title={t('toolbar.manage')} slim={slim} defaultOpen>
          <SidebarButton
            icon={<Settings className="size-4" />}
            label={t('toolbar.settings')}
            slim={slim}
            onClick={() => {
              onOpenSettings();
              closeMobileOnNav();
            }}
          />
        </SidebarSection>

        {/* Footer: slim toggle + version */}
        <div className="border-t border-zinc-800 p-2">
          <button
            onClick={onToggleSlim}
            className="hidden md:flex items-center gap-3 px-3 py-2 mx-0 rounded-md text-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors w-full"
            title={slim ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          >
            {slim ? (
              <PanelLeft className="size-4 mx-auto" />
            ) : (
              <>
                <PanelLeftClose className="size-4" />
                <span className="text-xs transition-opacity duration-100">Einklappen</span>
              </>
            )}
          </button>
          {!slim && (
            <p className="px-3 py-1 text-[10px] text-zinc-600">LitVault v0.2.0</p>
          )}
        </div>
      </aside>
    </>
  );
}
