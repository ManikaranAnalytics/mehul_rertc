import type { ScheduleResponse } from '../types';
import { loadStateFromDb, saveStateToDb, STATE_KEYS } from './apiStateStorage';

const STORAGE_KEY = 'hindalco-multiday-analysis';

export interface PersistedDayResult {
  date: string;
  schedule: ScheduleResponse;
}

export interface PersistedMultiDayState {
  startDate: string;
  numDays: number;
  chartView: 'soc' | 'chargeWindow' | 'dispatch' | 'compliance';
  results: PersistedDayResult[];
  optimalRtcMw: number | null;
  optimalSearchError: string;
}

export function loadMultiDayState(): PersistedMultiDayState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedMultiDayState;
    if (!parsed.startDate || typeof parsed.numDays !== 'number') return null;
    if (!Array.isArray(parsed.results)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Load from PostgreSQL via API; falls back to localStorage. */
export async function loadMultiDayStateFromDb(): Promise<PersistedMultiDayState | null> {
  const fromDb = await loadStateFromDb<PersistedMultiDayState>(STATE_KEYS.multidayAnalysis);
  if (fromDb?.startDate && typeof fromDb.numDays === 'number' && Array.isArray(fromDb.results)) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fromDb));
    } catch {
      // ignore
    }
    return fromDb;
  }
  return loadMultiDayState();
}

export function saveMultiDayState(state: PersistedMultiDayState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or private browsing — ignore
  }
  void saveStateToDb(STATE_KEYS.multidayAnalysis, state);
}

export function clearMultiDayState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
