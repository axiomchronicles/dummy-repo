import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import {
  Activity,
  AudioLines,
  ChevronDown,
  ChevronRight,
  ContactRound,
  FileBarChart2,
  Layers3,
  LayoutDashboard,
  LogOut,
  Mic,
  Menu,
  Plug,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api, command, ApiError, type Identity } from './api';
import { Button, ErrorState, Loading, ModeBadge } from './components/ui';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from './components/shadcn/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/shadcn/dropdown-menu';
import { Separator } from './components/shadcn/separator';
import { Chat } from './pages/Chat';
import { SignIn, Overview, Campaigns } from './pages/Workspace';
import { CampaignWizard } from './pages/CampaignWizard';
import { CampaignDetail, CallInspector } from './pages/CampaignDetail';
import { Contacts } from './pages/Contacts';
import { Agents } from './pages/Agents';
import {
  Reports,
  ActivityPage,
  Integrations,
  SettingsPage,
} from './pages/Operations';

const navigation = [
  ['/chat', 'Chat', AudioLines],
  ['/', 'Overview', LayoutDashboard],
  ['/campaigns', 'Campaigns', Layers3],
  ['/contacts', 'Contacts', ContactRound],
  ['/agents', 'Agents & Voices', Mic],
  ['/activity', 'Live activity', Activity],
  ['/reports', 'Reports', FileBarChart2],
  ['/integrations', 'Integrations', Plug],
  ['/audit', 'Audit history', ShieldCheck],
  ['/settings', 'Settings', Settings2],
] as const;

function NavigationContent({
  identity,
  close,
  logout,
  loggingOut,
}: {
  identity: Identity;
  close?: () => void;
  logout: () => Promise<void>;
  loggingOut: boolean;
}) {
  return (
    <>
      <NavLink className="brand" to="/" onClick={close}>
        <span className="brand-icon">
          <AudioLines size={19} />
        </span>
        <span>
          Outreach Intern<small>Campaign operations</small>
        </span>
      </NavLink>
      <div className="workspace-switch">
        <span className="workspace-avatar">
          {identity.workspace.name.slice(0, 1)}
        </span>
        <div>
          <strong>{identity.workspace.name}</strong>
          <small>Development workspace</small>
        </div>
      </div>
      <p className="nav-label">Workspace</p>
      <nav aria-label="Main navigation">
        {navigation.map(([path, text, Icon], index) => (
          <div key={path}>
            {index === 6 && <Separator className="nav-separator" />}
            <NavLink end={path === '/'} to={path} onClick={close}>
              <Icon size={16} />
              <span>{text}</span>
            </NavLink>
          </div>
        ))}
      </nav>
      <div className="sidebar-note">
        <ShieldCheck size={14} />
        <span>Safe to explore</span>
        <ModeBadge defaultMode />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="identity" disabled={loggingOut}>
            <span className="identity-avatar">{identity.name.slice(0, 1)}</span>
            <span>
              <strong>{identity.name}</strong>
              <small>
                {identity.role === 'owner'
                  ? 'Workspace owner'
                  : identity.role === 'viewer'
                    ? 'Read-only access'
                    : 'Campaign operator'}
              </small>
            </span>
            <ChevronDown size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuLabel>{identity.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <NavLink to="/settings" onClick={close}>
              <Settings2 />
              Workspace settings
            </NavLink>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void logout();
            }}
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export default function App() {
  const identity = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Identity>('/me'),
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<unknown>(null);
  const client = useQueryClient();
  const location = useLocation();
  if (identity.isPending)
    return (
      <div className="startup">
        <AudioLines size={28} />
        <Loading />
      </div>
    );
  if (
    identity.error &&
    !(identity.error instanceof ApiError && identity.error.status === 401)
  )
    return (
      <div className="startup">
        <ErrorState
          error={identity.error}
          retry={() => void identity.refetch()}
        />
      </div>
    );
  if (!identity.data) return <SignIn />;
  const logout = async () => {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await command('/auth/logout');
      client.clear();
      setOpen(false);
    } catch (error) {
      setLogoutError(error);
    } finally {
      setLoggingOut(false);
    }
  };
  const content = (
    <NavigationContent
      identity={identity.data}
      close={() => setOpen(false)}
      logout={logout}
      loggingOut={loggingOut}
    />
  );
  return (
    <div className="app-shell">
      <aside className="sidebar desktop-navigation">{content}</aside>
      <div className="main-shell">
        <header className="topbar">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="menu-button"
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="mobile-navigation"
              showCloseButton={false}
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Campaign workspace navigation.
              </SheetDescription>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="mobile-close"
                  aria-label="Close navigation"
                >
                  <X size={18} />
                </Button>
              </SheetClose>
              {content}
            </SheetContent>
          </Sheet>
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {navigation.find(
                ([path]) => path !== '/' && location.pathname.startsWith(path),
              )?.[1] || 'Overview'}
            </strong>
          </div>
          <div className="topbar-context">
            <span className="connection-dot" />
            <span className="environment-label">Local development</span>
            <ModeBadge defaultMode />
          </div>
        </header>
        <main id="main-content">
          {logoutError != null && <ErrorState error={logoutError} />}
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route
              path="/campaigns/new"
              element={<CampaignWizard workspace={identity.data.workspace} />}
            />
            <Route path="/campaigns/:id" element={<CampaignDetail />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/calls/:id" element={<CallInspector />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/audit" element={<ActivityPage audit />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route
              path="/settings"
              element={<SettingsPage workspace={identity.data.workspace} />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="workspace-footer">
          <span>Reviewed plans. Recorded outcomes.</span>
          <span>Outreach Intern</span>
        </footer>
      </div>
    </div>
  );
}
