const ADMIN_TOKEN_KEY = 're-rtc-admin-token';
const ADMIN_USER_KEY = 're-rtc-admin-user';

export interface AdminSession {
  token: string;
  username: string;
}

export function loadAdminSession(): AdminSession | null {
  try {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    const username = localStorage.getItem(ADMIN_USER_KEY);
    if (token && username) return { token, username };
  } catch {
    // ignore
  }
  return null;
}

export function saveAdminSession(session: AdminSession): void {
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, session.token);
    localStorage.setItem(ADMIN_USER_KEY, session.username);
  } catch {
    // ignore
  }
}

export function clearAdminSession(): void {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
  } catch {
    // ignore
  }
}

export function getAdminToken(): string | null {
  return loadAdminSession()?.token ?? null;
}
