import { CONTRACT_START_DATE, clampContractDate } from './constants';

const STORAGE_KEY = 'hindalco-generation-filter';

export interface GenerationFilterState {
  fromDate: string;
  toDate: string;
}

const DEFAULT_FILTER: GenerationFilterState = {
  fromDate: CONTRACT_START_DATE,
  toDate: '2026-06-07',
};

export function loadGenerationFilter(): GenerationFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FILTER };
    const parsed = JSON.parse(raw) as Partial<GenerationFilterState>;
    const fromDate = clampContractDate(parsed.fromDate ?? DEFAULT_FILTER.fromDate);
    let toDate = clampContractDate(parsed.toDate ?? DEFAULT_FILTER.toDate);
    if (toDate < fromDate) toDate = fromDate;
    return { fromDate, toDate };
  } catch {
    return { ...DEFAULT_FILTER };
  }
}

export function saveGenerationFilter(state: GenerationFilterState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}
