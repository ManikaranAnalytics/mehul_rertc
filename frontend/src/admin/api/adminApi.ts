import { BASE_URL } from '../../utils/constants';
import { getAdminToken } from '../utils/adminAuthStorage';

export interface AdminUser {
  id: number;
  username: string;
  login_status: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  created_at: string;
  updated_at: string;
}

export interface UserListResult {
  items: AdminUser[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UserStats {
  total_users: number;
  active_users: number;
  inactive_users: number;
  locked_users: number;
}

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE_URL}/api/admin${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function adminLogin(username: string, password: string): Promise<{ access_token: string; username: string }> {
  const res = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    let detail = 'Login failed';
    try {
      const body = await res.json();
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return res.json();
}

export function fetchUserStats(): Promise<UserStats> {
  return adminFetch<UserStats>('/users/stats');
}

export function fetchUsers(page: number, pageSize: number, search: string): Promise<UserListResult> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (search.trim()) params.set('search', search.trim());
  return adminFetch<UserListResult>(`/users?${params.toString()}`);
}

export function createUser(payload: { username: string; password: string; login_status: string }): Promise<AdminUser> {
  return adminFetch<AdminUser>('/users', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateUser(id: number, payload: Partial<{ username: string; password: string; login_status: string }>): Promise<AdminUser> {
  return adminFetch<AdminUser>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteUser(id: number): Promise<void> {
  return adminFetch<void>(`/users/${id}`, { method: 'DELETE' });
}

export function resetUserPassword(id: number, password: string): Promise<AdminUser> {
  return adminFetch<AdminUser>(`/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function activateUser(id: number): Promise<AdminUser> {
  return adminFetch<AdminUser>(`/users/${id}/activate`, { method: 'POST' });
}

export function deactivateUser(id: number): Promise<AdminUser> {
  return adminFetch<AdminUser>(`/users/${id}/deactivate`, { method: 'POST' });
}

export function lockUser(id: number): Promise<AdminUser> {
  return adminFetch<AdminUser>(`/users/${id}/lock`, { method: 'POST' });
}
