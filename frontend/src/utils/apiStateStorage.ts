import { BASE_URL } from './constants';

export const STATE_KEYS = {
  optimizerConfig: 'optimizer_config',
  multidayAnalysis: 'multiday_analysis',
  generationOverrides: 'generation_overrides',
} as const;

export type StateKey = (typeof STATE_KEYS)[keyof typeof STATE_KEYS];

export async function fetchDbHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/state/health`);
    if (!res.ok) return false;
    const body = await res.json() as { connected?: boolean };
    return body.connected === true;
  } catch {
    return false;
  }
}

export async function loadStateFromDb<T>(key: StateKey): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/state/${key}`);
    if (!res.ok) return null;
    const body = await res.json() as { data: T | null };
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function saveStateToDb<T extends Record<string, unknown>>(
  key: StateKey,
  data: T,
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/state/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteStateFromDb(key: StateKey): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/state/${key}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}
