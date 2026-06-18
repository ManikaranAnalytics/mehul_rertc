import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Outlet } from 'react-router-dom';
import {
  clearAdminSession,
  loadAdminSession,
  saveAdminSession,
} from '../utils/adminAuthStorage';
import { adminLogin as apiAdminLogin } from '../api/adminApi';

interface AdminAuthContextValue {
  isAdminAuthenticated: boolean;
  adminUsername: string | null;
  adminLogin: (username: string, password: string) => Promise<void>;
  adminLogout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within <AdminAuthProvider>');
  return ctx;
}

export function AdminAuthProvider() {
  const [session, setSession] = useState(() => loadAdminSession());

  const adminLogin = useCallback(async (username: string, password: string) => {
    const result = await apiAdminLogin(username, password);
    const next = { token: result.access_token, username: result.username };
    saveAdminSession(next);
    setSession(next);
  }, []);

  const adminLogout = useCallback(() => {
    clearAdminSession();
    setSession(null);
  }, []);

  const value = useMemo<AdminAuthContextValue>(() => ({
    isAdminAuthenticated: session !== null,
    adminUsername: session?.username ?? null,
    adminLogin,
    adminLogout,
  }), [session, adminLogin, adminLogout]);

  return (
    <AdminAuthContext.Provider value={value}>
      <Outlet />
    </AdminAuthContext.Provider>
  );
}
