import './utils/chartSetup';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { OptimizerProvider } from './context/OptimizerContext';
import { MultiDayProvider } from './context/MultiDayContext';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Main app layout & pages
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import SingleDayPage from './pages/SingleDayPage';
import MultiDayPage from './pages/MultiDayPage';
import GenerationPage from './pages/GenerationPage';
import ConfigPage from './pages/ConfigPage';

// Admin module (separate auth)
import { AdminAuthProvider } from './admin/context/AdminAuthContext';
import AdminProtectedRoute from './admin/components/AdminProtectedRoute';
import AdminLayout from './admin/components/AdminLayout';
import AdminLoginPage from './admin/pages/AdminLoginPage';
import AdminDashboardPage from './admin/pages/AdminDashboardPage';
import AdminUsersPage from './admin/pages/AdminUsersPage';
import AdminPlaceholderPage from './admin/pages/AdminPlaceholderPage';

function AppProviders() {
  return (
    <OptimizerProvider>
      <MultiDayProvider>
        <Outlet />
      </MultiDayProvider>
    </OptimizerProvider>
  );
}

function MainAppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppProviders />}>
            <Route element={<AppLayout />}>
              <Route index element={<SingleDayPage />} />
              <Route path="multi-day" element={<MultiDayPage />} />
              <Route path="generation" element={<GenerationPage />} />
              <Route path="config" element={<ConfigPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Admin module — completely separate authentication */}
      <Route path="/admin" element={<AdminAuthProvider />}>
        <Route path="login" element={<AdminLoginPage />} />
        <Route element={<AdminProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboardPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="settings" element={<AdminPlaceholderPage title="System Settings" />} />
            <Route path="credentials" element={<AdminPlaceholderPage title="Plant Credentials" />} />
          </Route>
        </Route>
      </Route>

      {/* Main RE-RTC application */}
      <Route path="/*" element={<MainAppRoutes />} />
    </Routes>
  );
}
