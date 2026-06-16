import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { appLogin } from '../api/appAuthApi';
import {
  clearAllAuthStorage,
  loadAuth,
  saveAuth,
} from '../utils/authStorage';

interface AuthContextValue {
  isAuthenticated: boolean;
  userId: number | null;
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState(() => loadAuth());

  const login = useCallback(async (username: string, password: string) => {
    const result = await appLogin(username, password);
    const next = {
      userId: result.user.id,
      username: result.user.username,
      loggedInAt: Date.now(),
    };
    saveAuth(next);
    setAuth(next);
  }, []);

  const logout = useCallback(() => {
    clearAllAuthStorage();
    setAuth(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    isAuthenticated: auth !== null,
    userId: auth?.userId ?? null,
    username: auth?.username ?? null,
    login,
    logout,
  }), [auth, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
