import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import type { ScheduleResponse } from '../types';
import { clampContractDate } from '../utils/constants';
import { loadMultiDayState, loadMultiDayStateFromDb, saveMultiDayState, hasSavedMultiDayState, type PersistedMultiDayState } from '../utils/multiDayStorage';

export interface DayResult {
  date: string;
  schedule: ScheduleResponse;
}

export type MultiDayChartView = 'soc' | 'chargeWindow' | 'dispatch' | 'compliance';

interface MultiDayContextValue {
  startDate: string;
  setStartDate: React.Dispatch<React.SetStateAction<string>>;
  numDays: number;
  setNumDays: React.Dispatch<React.SetStateAction<number>>;
  initialSocMwh: number;
  setInitialSocMwh: React.Dispatch<React.SetStateAction<number>>;
  results: DayResult[];
  setResults: React.Dispatch<React.SetStateAction<DayResult[]>>;
  optimalRtcMw: number | null;
  setOptimalRtcMw: React.Dispatch<React.SetStateAction<number | null>>;
  optimalSearchError: string;
  setOptimalSearchError: React.Dispatch<React.SetStateAction<string>>;
  chartView: MultiDayChartView;
  setChartView: React.Dispatch<React.SetStateAction<MultiDayChartView>>;
}

const MultiDayContext = createContext<MultiDayContextValue | null>(null);

const VALID_CHART_VIEWS = new Set<MultiDayChartView>(['soc', 'chargeWindow', 'dispatch', 'compliance']);

function readInitial() {
  const saved = loadMultiDayState();
  const savedView = saved?.chartView;
  const chartView: MultiDayChartView =
    savedView && VALID_CHART_VIEWS.has(savedView as MultiDayChartView)
      ? (savedView as MultiDayChartView)
      : 'soc';
  return {
    startDate:          clampContractDate(saved?.startDate ?? '2026-06-01'),
    numDays:            saved?.numDays            ?? 7,
    initialSocMwh:      saved?.initialSocMwh       ?? 0,
    results:            (saved?.results ?? []) as DayResult[],
    optimalRtcMw:       saved?.optimalRtcMw       ?? null,
    optimalSearchError: saved?.optimalSearchError ?? '',
    chartView,
  };
}

export function MultiDayProvider({ children }: { children: React.ReactNode }) {
  const [initial] = useState(readInitial);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [numDays, setNumDays] = useState(initial.numDays);
  const [initialSocMwh, setInitialSocMwh] = useState(initial.initialSocMwh);
  const [results, setResults] = useState<DayResult[]>(initial.results);
  const [optimalRtcMw, setOptimalRtcMw] = useState<number | null>(initial.optimalRtcMw);
  const [optimalSearchError, setOptimalSearchError] = useState(initial.optimalSearchError);
  const [chartView, setChartView] = useState<MultiDayChartView>(initial.chartView);

  const skipPersistRef = useRef(true);
  const configEditedRef = useRef(false);
  const hadLocalStateRef = useRef(hasSavedMultiDayState());

  const applyConfigFromSaved = useCallback((saved: PersistedMultiDayState) => {
    setStartDate(clampContractDate(saved.startDate));
    setNumDays(saved.numDays);
    setInitialSocMwh(saved.initialSocMwh);
    setOptimalRtcMw(saved.optimalRtcMw);
    setOptimalSearchError(saved.optimalSearchError);
    if (VALID_CHART_VIEWS.has(saved.chartView)) {
      setChartView(saved.chartView);
    }
  }, []);

  // Hydrate from PostgreSQL on startup (localStorage used for fast first paint)
  useEffect(() => {
    let cancelled = false;
    loadMultiDayStateFromDb().then((saved) => {
      if (cancelled || !saved) return;

      skipPersistRef.current = true;
      if (!hadLocalStateRef.current) {
        applyConfigFromSaved(saved);
        setResults(saved.results as DayResult[]);
        return;
      }

      if (!configEditedRef.current) {
        applyConfigFromSaved(saved);
      }
    });
    return () => { cancelled = true; };
  }, [applyConfigFromSaved]);
  const persist = useCallback(() => {
    saveMultiDayState({
      startDate,
      numDays,
      initialSocMwh,
      chartView,
      results,
      optimalRtcMw,
      optimalSearchError,
    });
  }, [startDate, numDays, initialSocMwh, chartView, results, optimalRtcMw, optimalSearchError]);

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    configEditedRef.current = true;
    persist();
  }, [persist]);

  useEffect(() => {
    const onBeforeUnload = () => persist();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      persist();
    };
  }, [persist]);

  const value: MultiDayContextValue = {
    startDate,
    setStartDate,
    numDays,
    setNumDays,
    initialSocMwh,
    setInitialSocMwh,
    results,
    setResults,
    optimalRtcMw,
    setOptimalRtcMw,
    optimalSearchError,
    setOptimalSearchError,
    chartView,
    setChartView,
  };

  return (
    <MultiDayContext.Provider value={value}>
      {children}
    </MultiDayContext.Provider>
  );
}

export function useMultiDay() {
  const ctx = useContext(MultiDayContext);
  if (!ctx) throw new Error('useMultiDay must be used within MultiDayProvider');
  return ctx;
}
