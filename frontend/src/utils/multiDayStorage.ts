import type { ScheduleResponse } from '../types';
import { loadStateFromDb, saveStateToDb, STATE_KEYS } from './apiStateStorage';

import { PSP_MAX_CAPACITY_MWH } from './constants';

const STORAGE_KEY = 'hindalco-multiday-analysis';

export function hasSavedMultiDayState(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

export interface PersistedDayResult {
  date: string;
  schedule: ScheduleResponse;
}

export interface PersistedMultiDayState {
  startDate: string;
  numDays: number;
  initialSocMwh: number;
  chartView: 'soc' | 'chargeWindow' | 'dispatch' | 'compliance';
  results: PersistedDayResult[];
  optimalRtcMw: number | null;
  optimalSearchError: string;
}

export function sanitizeMultiDayState(
  raw: Partial<PersistedMultiDayState> | null | undefined,
): PersistedMultiDayState | null {
  if (!raw?.startDate || typeof raw.numDays !== 'number' || !Array.isArray(raw.results)) {
    return null;
  }
  const chartView =
    raw.chartView === 'soc' ||
    raw.chartView === 'chargeWindow' ||
    raw.chartView === 'dispatch' ||
    raw.chartView === 'compliance'
      ? raw.chartView
      : 'soc';
  return {
    startDate: raw.startDate,
    numDays: Math.max(2, Math.min(30, raw.numDays)),
    initialSocMwh:
      typeof raw.initialSocMwh === 'number'
        ? Math.min(PSP_MAX_CAPACITY_MWH, Math.max(0, raw.initialSocMwh))
        : 0,
    chartView,
    results: raw.results,
    optimalRtcMw: typeof raw.optimalRtcMw === 'number' ? raw.optimalRtcMw : null,
    optimalSearchError: typeof raw.optimalSearchError === 'string' ? raw.optimalSearchError : '',
  };
}

export function loadMultiDayState(): PersistedMultiDayState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedMultiDayState>;
    return sanitizeMultiDayState(parsed);
  } catch {
    return null;
  }
}

/** Load from PostgreSQL via API; falls back to localStorage. */
export async function loadMultiDayStateFromDb(): Promise<PersistedMultiDayState | null> {
  const fromDb = await loadStateFromDb<PersistedMultiDayState>(STATE_KEYS.multidayAnalysis);
  const sanitizedDb = sanitizeMultiDayState(fromDb ?? undefined);
  if (sanitizedDb) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizedDb));
    } catch {
      // ignore
    }
    return sanitizedDb;
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
