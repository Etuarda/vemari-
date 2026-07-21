import { Navigate, Route, Routes } from 'react-router-dom';
import { hasPermission, Permission } from '@vemari/contracts';
import { useAuth } from './auth/AuthProvider';
import { AppShell } from './components/AppShell';
import { AuditPage } from './pages/AuditPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { ContactsPage } from './pages/ContactsPage';
import { DashboardPage } from './pages/DashboardPage';
import { InboxPage } from './pages/InboxPage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { UsersPage } from './pages/UsersPage';
import { CredentialSetupPage } from './pages/CredentialSetupPage';

function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Carregando ambiente seguro…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell />;
}

function PermissionRoute({
  permission,
  children,
}: {
  permission: Permission;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (!user || !hasPermission(user.role, permission)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/ativar-conta" element={<CredentialSetupPage mode="activation" />} />
      <Route path="/redefinir-senha" element={<CredentialSetupPage mode="reset" />} />
      <Route path="/activate-account" element={<Navigate to="/ativar-conta" replace />} />
      <Route path="/reset-password" element={<Navigate to="/redefinir-senha" replace />} />
      <Route element={<ProtectedLayout />}>
        <Route
          index
          element={
            <PermissionRoute permission={Permission.ANALYTICS_READ}>
              <DashboardPage />
            </PermissionRoute>
          }
        />
        <Route
          path="campaigns"
          element={
            <PermissionRoute permission={Permission.CAMPAIGN_READ}>
              <CampaignsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="contacts"
          element={
            <PermissionRoute permission={Permission.CONTACT_READ}>
              <ContactsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="templates"
          element={
            <PermissionRoute permission={Permission.TEMPLATE_READ}>
              <TemplatesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="inbox"
          element={
            <PermissionRoute permission={Permission.CONVERSATION_READ_ASSIGNED}>
              <InboxPage />
            </PermissionRoute>
          }
        />
        <Route
          path="users"
          element={
            <PermissionRoute permission={Permission.USER_READ}>
              <UsersPage />
            </PermissionRoute>
          }
        />
        <Route
          path="audit"
          element={
            <PermissionRoute permission={Permission.AUDIT_READ}>
              <AuditPage />
            </PermissionRoute>
          }
        />
        <Route
          path="settings"
          element={
            <PermissionRoute permission={Permission.META_INTEGRATION_READ}>
              <SettingsPage />
            </PermissionRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
