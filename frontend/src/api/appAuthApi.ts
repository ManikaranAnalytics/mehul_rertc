import { BASE_URL } from '../utils/constants';

export interface AppLoginUser {
  id: number;
  username: string;
}

export interface AppLoginResponse {
  success: boolean;
  user: AppLoginUser;
}

export async function appLogin(username: string, password: string): Promise<AppLoginResponse> {
  const res = await fetch(`${BASE_URL}/api/login`, {
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

  return res.json() as Promise<AppLoginResponse>;
}
