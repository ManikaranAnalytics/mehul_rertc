const AUTH_KEY = 're-rtc-auth';

export interface StoredAuth {
  userId: number;
  username: string;
  loggedInAt: number;
}

export function loadAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    if (parsed?.username && typeof parsed.userId === 'number') {
      return {
        userId: parsed.userId,
        username: parsed.username,
        loggedInAt: parsed.loggedInAt ?? Date.now(),
      };
    }
  } catch {
    // ignore corrupt entries
  }
  return null;
}

export function saveAuth(auth: StoredAuth): void {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    sessionStorage.removeItem(AUTH_KEY);
  } catch {
    // private browsing / quota — ignore
  }
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
  } catch {
    // ignore
  }
}

/** Remove auth session from browser storage (including legacy sessionStorage entries). */
export function clearAllAuthStorage(): void {
  clearAuth();
}
