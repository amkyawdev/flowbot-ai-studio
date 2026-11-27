import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useApp } from '@/store/app';
import { BottomNav, SideNav } from '@/components/Nav';
import { Toasts, Loading } from '@/components/ui';
import { LoginPage } from '@/pages/Login';
import { DashboardPage } from '@/pages/Dashboard';
import { WorkflowsPage } from '@/pages/Workflows';
import { WorkflowEditorPage } from '@/pages/WorkflowEditor';
import { BotsPage } from '@/pages/Bots';
import { IntegrationsPage } from '@/pages/Integrations';
import { AgentsPage } from '@/pages/Agents';
import { CredentialsPage } from '@/pages/Credentials';
import { ExecutionsPage } from '@/pages/Executions';
import { SettingsPage } from '@/pages/Settings';

export default function App() {
  const { user, ready } = useAppWrapper();
  return (
    <>
      {!ready ? (
        <div className="app"><Loading /></div>
      ) : user ? (
        <div className="app">
          <SideNav />
          <main className="main">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/workflows" element={<WorkflowsPage />} />
              <Route path="/workflows/:id" element={<WorkflowEditorPage />} />
              <Route path="/bots" element={<BotsPage />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/credentials" element={<CredentialsPage />} />
              <Route path="/executions" element={<ExecutionsPage />} />
              <Route path="/executions/:id" element={<ExecutionsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <BottomNav />
        </div>
      ) : (
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      )}
      <Toasts />
    </>
  );
}

function useAppWrapper() {
  const { user, ready, boot, logout } = useApp();
  const location = useLocation();
  useEffect(() => { void boot(); }, []);
  useEffect(() => { if (location.pathname === '/logout' && user) void logout(); }, [location, user]);
  return { user, ready, boot, logout };
}