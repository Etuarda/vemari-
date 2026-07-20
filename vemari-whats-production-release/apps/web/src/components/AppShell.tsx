import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  BarChart3,
  ContactRound,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Send,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { hasPermission, Permission } from '@vemari/contracts';
import { useAuth } from '../auth/AuthProvider';

const links = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard, permission: Permission.ANALYTICS_READ },
  { to: '/campaigns', label: 'Campanhas', icon: Send, permission: Permission.CAMPAIGN_READ },
  { to: '/contacts', label: 'Contatos', icon: ContactRound, permission: Permission.CONTACT_READ },
  { to: '/templates', label: 'Templates', icon: FileText, permission: Permission.TEMPLATE_READ },
  { to: '/inbox', label: 'Atendimento', icon: MessageSquareText, permission: Permission.CONVERSATION_READ_ASSIGNED },
  { to: '/users', label: 'Usuários', icon: Users, permission: Permission.USER_READ },
  { to: '/audit', label: 'Auditoria', icon: ShieldCheck, permission: Permission.AUDIT_READ },
  { to: '/settings', label: 'Integração Meta', icon: Settings, permission: Permission.META_INTEGRATION_READ },
] as const;

export function AppShell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`} aria-label="Navegação principal">
        <div className="brand">
          <div className="brand-mark">V</div>
          <div><strong>Vemari Whats</strong><span>Marketing e atendimento</span></div>
          <button className="icon-button mobile-only" aria-label="Fechar menu" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <nav>
          {links.filter((link) => hasPermission(user.role, link.permission)).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}>
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip"><span>{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role}</small></div></div>
          <button className="ghost-button" onClick={() => void logout()}><LogOut size={18} /> Sair</button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-only" aria-label="Abrir menu" onClick={() => setOpen(true)}><Menu size={22} /></button>
          <div><span className="environment-dot" /> Ambiente interno Vemari</div>
          <BarChart3 size={18} aria-hidden="true" />
        </header>
        <div className="page-container"><Outlet /></div>
      </main>
    </div>
  );
}
