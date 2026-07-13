import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type {
  ScheduleResponse, RTCRangeData, RawForecastRow, GenEdit, BlockData, SummaryData,
  CurtailmentSegment, PspDischargeSegment, DischargeTarget,
} from '../types';
import { BASE_URL, CONTRACT_DATES } from '../utils/constants';
import {
  fetchAllGenerationEdits,
  genEditsToBlockOverrides,
} from '../utils/generationDbApi';
import {
  loadOptimizerConfig,
  loadOptimizerConfigFromDb,
  saveOptimizerConfig,
  inferOverrideFlags,
  deriveAutoChargeMw,
  deriveAutoDischargeMw,
  deriveAutoMinDispatchMw,
  hasSavedOptimizerConfig,
  type PersistedOptimizerConfig,
} from '../utils/optimizerConfigStorage';
import { lookupWindMW } from '../utils/powerCurve';

/* ───────────────────── Context Type ───────────────────── */

interface OptimizerContextValue {
  // Config
  selectedDate: string;
  setSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  wtgCount: number;
  setWtgCount: React.Dispatch<React.SetStateAction<number>>;
  solarAc: number;
  setSolarAc: React.Dispatch<React.SetStateAction<number>>;
  rtcCommitment: number;
  setRtcCommitment: React.Dispatch<React.SetStateAction<number>>;
  maxSocMwh: number;
  setMaxSocMwh: React.Dispatch<React.SetStateAction<number>>;
  maxChargeMw: number;
  setMaxChargeMw: React.Dispatch<React.SetStateAction<number>>;
  maxDischargeMw: number;
  setMaxDischargeMw: React.Dispatch<React.SetStateAction<number>>;
  minDispatchMw: number;
  setMinDispatchMw: React.Dispatch<React.SetStateAction<number>>;

  // Auto-derive override flags — true = user has manually set this field
  chargeOverridden: boolean;
  setChargeOverridden: React.Dispatch<React.SetStateAction<boolean>>;
  dischargeOverridden: boolean;
  setDischargeOverridden: React.Dispatch<React.SetStateAction<boolean>>;
  minDispatchOverridden: boolean;
  setMinDispatchOverridden: React.Dispatch<React.SetStateAction<boolean>>;
  // Auto-derived values (always computed from maxSocMwh, regardless of override)
  autoChargeMw: number;
  autoDischargeMw: number;
  autoMinDispatchMw: number;

  // Curtailment — segment-based
  curtailmentEnabled: boolean;
  setCurtailmentEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  curtailmentSegments: CurtailmentSegment[];
  setCurtailmentSegments: React.Dispatch<React.SetStateAction<CurtailmentSegment[]>>;
  // Legacy kept for backward compat (generation table curtail_flag overlay)
  curtailmentStart: number;
  curtailmentEnd: number;

  // PSP Discharge Curtailment
  pspDischargeSegments: PspDischargeSegment[];
  setPspDischargeSegments: React.Dispatch<React.SetStateAction<PspDischargeSegment[]>>;

  // PSP
  transmissionLoss: number;
  setTransmissionLoss: React.Dispatch<React.SetStateAction<number>>;
  roundtripLoss: number;
  setRoundtripLoss: React.Dispatch<React.SetStateAction<number>>;

  /** PSP discharge target mode (Config tab toggle) */
  dischargeTarget: DischargeTarget;
  setDischargeTarget: React.Dispatch<React.SetStateAction<DischargeTarget>>;

  // Sidebar
  sideTab: 'config' | 'data';
  setSideTab: React.Dispatch<React.SetStateAction<'config' | 'data'>>;
  blockOverrides: Record<number, { wind_mw: string; solar_mw: string }>;
  setBlockOverrides: React.Dispatch<React.SetStateAction<Record<number, { wind_mw: string; solar_mw: string }>>>;

  // API state
  scheduleData: ScheduleResponse | null;
  loading: boolean;
  error: string;

  // RTC Range
  rtcRange: RTCRangeData | null;
  rangeLoading: boolean;
  rangeExpanded: boolean;
  setRangeExpanded: React.Dispatch<React.SetStateAction<boolean>>;

  // Carry forward
  initialSocMwh: number;
  setInitialSocMwh: React.Dispatch<React.SetStateAction<number>>;
  prevDayChargeSchedule: number[] | null;
  carryFromDate: string | null;

  // Modal
  socModalOpen: boolean;
  setSocModalOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Raw forecast
  rawForecast: RawForecastRow[];

  // Gen table
  genTableEdits: Record<number, GenEdit>;
  setGenTableEdits: React.Dispatch<React.SetStateAction<Record<number, GenEdit>>>;
  genTableExpanded: boolean;
  setGenTableExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  // Multi-day uploaded edits (date → block → edit)
  multiDayGenEdits: Record<string, Record<number, GenEdit>>;
  setMultiDayGenEdits: React.Dispatch<React.SetStateAction<Record<string, Record<number, GenEdit>>>>;
  refreshGenerationEdits: () => Promise<void>;

  // Derived
  blocks: BlockData[];
  summary: SummaryData | undefined;

  // Handlers
  handleRollToNextDay: () => void;
  handleClearCarry: () => void;
  buildScheduleRequest: () => Record<string, unknown>;
}

const OptimizerContext = createContext<OptimizerContextValue | null>(null);

/* ───────────────────── Hook ───────────────────── */

export function useOptimizer(): OptimizerContextValue {
  const ctx = useContext(OptimizerContext);
  if (!ctx) throw new Error('useOptimizer must be used within <OptimizerProvider>');
  return ctx;
}

/* ───────────────────── Provider ───────────────────── */

export function OptimizerProvider({ children }: { children: React.ReactNode }) {
  const [savedConfig] = useState(loadOptimizerConfig);
  const savedOverrides = inferOverrideFlags(savedConfig);

  // Config state (restored from localStorage on first load)
  const [selectedDate, setSelectedDate] = useState(savedConfig.selectedDate);
  const [wtgCount, setWtgCount] = useState(savedConfig.wtgCount);
  const [solarAc, setSolarAc] = useState(savedConfig.solarAc);
  const [rtcCommitment, setRtcCommitment] = useState(savedConfig.rtcCommitment);
  const [maxSocMwh, setMaxSocMwh] = useState(savedConfig.maxSocMwh);
  const [maxChargeMw, setMaxChargeMw] = useState(savedConfig.maxChargeMw);
  const [maxDischargeMw, setMaxDischargeMw] = useState(savedConfig.maxDischargeMw);
  const [minDispatchMw, setMinDispatchMw] = useState(savedConfig.minDispatchMw);

  // Override flags: restored from saved values so auto-derive does not reset manual PSP limits
  const [chargeOverridden, setChargeOverridden] = useState(savedOverrides.chargeOverridden);
  const [dischargeOverridden, setDischargeOverridden] = useState(savedOverrides.dischargeOverridden);
  const [minDispatchOverridden, setMinDispatchOverridden] = useState(savedOverrides.minDispatchOverridden);


  // Curtailment config
  const [curtailmentEnabled, setCurtailmentEnabled] = useState(savedConfig.curtailmentEnabled);
  const [curtailmentSegments, setCurtailmentSegments] = useState<CurtailmentSegment[]>(savedConfig.curtailmentSegments);
  // Legacy: kept so rawForecast overlay still works (derived from first segment)
  const curtailmentStart = curtailmentSegments.length > 0 ? curtailmentSegments[0].startBlock : 37;
  const curtailmentEnd   = curtailmentSegments.length > 0 ? curtailmentSegments[0].endBlock   : 64;

  // PSP Discharge Curtailment
  const [pspDischargeSegments, setPspDischargeSegments] = useState<PspDischargeSegment[]>(savedConfig.pspDischargeSegments);

  // PSP loss %
  const [roundtripLoss, setRoundtripLoss] = useState(savedConfig.roundtripLoss);
  const [transmissionLoss, setTransmissionLoss] = useState(savedConfig.transmissionLoss);
  const [dischargeTarget, setDischargeTarget] = useState<DischargeTarget>(savedConfig.dischargeTarget);

  // Active sidebar tab
  const [sideTab, setSideTab] = useState<'config' | 'data'>('config');

  // Per-block editable overrides
  const [blockOverrides, setBlockOverrides] = useState(savedConfig.blockOverrides);

  // API response state
  const [scheduleData, setScheduleData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // RTC Range suggestion state
  const [rtcRange, setRtcRange] = useState<RTCRangeData | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeExpanded, setRangeExpanded] = useState(true);

  // Carry-forward state
  const [initialSocMwh, setInitialSocMwh] = useState(savedConfig.initialSocMwh);
  const [prevDayChargeSchedule, setPrevDayChargeSchedule] = useState<number[] | null>(
    savedConfig.prevDayChargeSchedule,
  );
  const [carryFromDate, setCarryFromDate] = useState<string | null>(savedConfig.carryFromDate);

  const skipPersistRef = useRef(true);
  const configEditedRef = useRef(false);
  const hadLocalConfigRef = useRef(hasSavedOptimizerConfig());

  const applyPersistedConfig = useCallback((config: PersistedOptimizerConfig) => {
    const flags = inferOverrideFlags(config);
    setChargeOverridden(flags.chargeOverridden);
    setDischargeOverridden(flags.dischargeOverridden);
    setMinDispatchOverridden(flags.minDispatchOverridden);
    setSelectedDate(config.selectedDate);
    setWtgCount(config.wtgCount);
    setSolarAc(config.solarAc);
    setRtcCommitment(config.rtcCommitment);
    setMaxSocMwh(config.maxSocMwh);
    setMaxChargeMw(config.maxChargeMw);
    setMaxDischargeMw(config.maxDischargeMw);
    setMinDispatchMw(config.minDispatchMw);
    setCurtailmentEnabled(config.curtailmentEnabled);
    setCurtailmentSegments(config.curtailmentSegments);
    setPspDischargeSegments(config.pspDischargeSegments);
    setRoundtripLoss(config.roundtripLoss);
    setTransmissionLoss(config.transmissionLoss);
    setDischargeTarget(config.dischargeTarget);
    setInitialSocMwh(config.initialSocMwh);
    setPrevDayChargeSchedule(config.prevDayChargeSchedule);
    setCarryFromDate(config.carryFromDate);
    setBlockOverrides(config.blockOverrides);
  }, []);

  // Hydrate from PostgreSQL only when localStorage is empty (new browser / cleared cache).
  // Avoids async DB response overwriting in-session config changes.
  useEffect(() => {
    if (hadLocalConfigRef.current) return;

    let cancelled = false;
    loadOptimizerConfigFromDb().then((dbConfig) => {
      if (cancelled || configEditedRef.current) return;
      skipPersistRef.current = true;
      applyPersistedConfig(dbConfig);
    });
    return () => { cancelled = true; };
  }, [applyPersistedConfig]);

  // ── Auto-derive from maxSocMwh when not manually overridden ──
  const derivedCharge     = deriveAutoChargeMw(maxSocMwh);
  const derivedDischarge  = deriveAutoDischargeMw(maxSocMwh);
  const effectiveMaxDrawal = dischargeOverridden ? maxDischargeMw : derivedDischarge;
  const derivedMinDispatch = deriveAutoMinDispatchMw(effectiveMaxDrawal);

  useEffect(() => {
    if (!chargeOverridden) setMaxChargeMw(derivedCharge);
  }, [derivedCharge, chargeOverridden]);

  useEffect(() => {
    if (!dischargeOverridden) setMaxDischargeMw(derivedDischarge);
  }, [derivedDischarge, dischargeOverridden]);

  useEffect(() => {
    if (!minDispatchOverridden) setMinDispatchMw(derivedMinDispatch);
  }, [derivedMinDispatch, minDispatchOverridden]);


  const persistConfig = useCallback((): PersistedOptimizerConfig => {
    const config: PersistedOptimizerConfig = {
      selectedDate,
      wtgCount,
      solarAc,
      rtcCommitment,
      maxSocMwh,
      maxChargeMw,
      maxDischargeMw,
      minDispatchMw,
      curtailmentEnabled,
      curtailmentSegments,
      curtailmentStart,
      curtailmentEnd,
      roundtripLoss,
      transmissionLoss,
      initialSocMwh,
      carryFromDate,
      prevDayChargeSchedule,
      blockOverrides,
      pspDischargeSegments,
      dischargeTarget,
    };
    saveOptimizerConfig(config);
    return config;
  }, [
    selectedDate, wtgCount, solarAc, rtcCommitment,
    maxSocMwh, maxChargeMw, maxDischargeMw, minDispatchMw,
    curtailmentEnabled, curtailmentSegments, roundtripLoss, transmissionLoss,
    initialSocMwh, carryFromDate, prevDayChargeSchedule, blockOverrides,
    pspDischargeSegments, dischargeTarget,
  ]);

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    configEditedRef.current = true;
    persistConfig();
  }, [persistConfig]);

  useEffect(() => {
    const onBeforeUnload = () => persistConfig();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      persistConfig();
    };
  }, [persistConfig]);

  // SoC detail modal
  const [socModalOpen, setSocModalOpen] = useState(false);

  // Raw forecast data
  const [rawForecast, setRawForecast] = useState<RawForecastRow[]>([]);

  // Generation table edits
  const [genTableEdits, setGenTableEdits] = useState<Record<number, GenEdit>>({});
  const [genTableExpanded, setGenTableExpanded] = useState(true);
  // Multi-day uploaded edits keyed by ISO date string
  const [multiDayGenEdits, setMultiDayGenEdits] = useState<Record<string, Record<number, GenEdit>>>({});
  const multiDayGenEditsRef = useRef<Record<string, Record<number, GenEdit>>>({});
  useEffect(() => { multiDayGenEditsRef.current = multiDayGenEdits; }, [multiDayGenEdits]);

  // Load uploaded generation data from PostgreSQL for analysis tabs
  const refreshGenerationEdits = useCallback(async () => {
    const { edits } = await fetchAllGenerationEdits();
    setMultiDayGenEdits(edits);
  }, []);

  useEffect(() => {
    refreshGenerationEdits().catch(() => {});
  }, [refreshGenerationEdits]);

  // ── Build block_overrides list for API ──
  const buildOverridesList = useCallback(() => {
    const fromGenTable: Record<number, { wind_mw?: number; solar_mw?: number }> = {};
    Object.entries(genTableEdits).forEach(([blockStr, edit]) => {
      const block = parseInt(blockStr);
      const entry: { wind_mw?: number; solar_mw?: number } = {};
      if (edit.wind_speed !== undefined && edit.wind_speed !== '') {
        const spd = parseFloat(edit.wind_speed);
        if (!isNaN(spd)) entry.wind_mw = lookupWindMW(spd, wtgCount);
      }
      if (edit.solar_mw !== undefined && edit.solar_mw !== '') {
        const sol = parseFloat(edit.solar_mw);
        if (!isNaN(sol)) entry.solar_mw = sol;
      }
      if (Object.keys(entry).length > 0) fromGenTable[block] = entry;
    });

    const fromPg: Record<number, { wind_mw?: number; solar_mw?: number }> = {};
    genEditsToBlockOverrides(multiDayGenEdits[selectedDate], wtgCount).forEach((ov) => {
      fromPg[ov.block] = { wind_mw: ov.wind_mw, solar_mw: ov.solar_mw };
    });

    const fromLegacy: Record<number, { wind_mw?: number; solar_mw?: number }> = {};
    Object.entries(blockOverrides).forEach(([blockStr, v]) => {
      const block = parseInt(blockStr);
      const entry: { wind_mw?: number; solar_mw?: number } = {};
      if (v.wind_mw !== '') entry.wind_mw = parseFloat(v.wind_mw);
      if (v.solar_mw !== '') entry.solar_mw = parseFloat(v.solar_mw);
      if (Object.keys(entry).length > 0) fromLegacy[block] = entry;
    });

    const merged = { ...fromPg, ...fromLegacy, ...fromGenTable };
    return Object.entries(merged).map(([block, v]) => ({ block: parseInt(block), ...v }));
  }, [blockOverrides, genTableEdits, multiDayGenEdits, selectedDate, wtgCount]);

  const buildScheduleRequest = useCallback(() => ({
    date: selectedDate,
    wtg_count: wtgCount,
    solar_ac_mw: solarAc,
    rtc_commitment_mw: rtcCommitment,
    curtailment_enabled: curtailmentEnabled,
    curtailment_segments: curtailmentSegments,
    transmission_loss_pct: transmissionLoss,
    roundtrip_loss_pct: roundtripLoss,
    min_compliance_ratio: 0.50,
    max_soc_mwh: maxSocMwh,
    max_charge_mw: maxChargeMw,
    max_discharge_mw: maxDischargeMw,
    min_dispatch_mw: minDispatchMw,
    block_overrides: buildOverridesList(),
    initial_soc_mwh: initialSocMwh,
    prev_day_charge_schedule: prevDayChargeSchedule,
    psp_discharge_segments: pspDischargeSegments.length > 0 ? pspDischargeSegments : null,
    discharge_target: dischargeTarget,
  }), [
    selectedDate, wtgCount, solarAc, rtcCommitment, curtailmentEnabled, curtailmentSegments,
    transmissionLoss, roundtripLoss, maxSocMwh, maxChargeMw, maxDischargeMw, minDispatchMw,
    buildOverridesList, initialSocMwh, prevDayChargeSchedule, pspDischargeSegments, dischargeTarget,
  ]);

  // ── Fetch schedule on state change ──
  useEffect(() => {
    const fetchSchedule = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${BASE_URL}/api/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildScheduleRequest()),
        });
        if (!response.ok) {
          let detail = response.statusText;
          try {
            const errBody = await response.json();
            if (Array.isArray(errBody.detail)) {
              detail = errBody.detail.map((d: { msg?: string; loc?: string[] }) =>
                d.loc ? `${d.loc.join('.')}: ${d.msg}` : d.msg
              ).join('; ');
            } else if (typeof errBody.detail === 'string') {
              detail = errBody.detail;
            }
          } catch { /* ignore parse errors */ }
          throw new Error(detail);
        }
        const data: ScheduleResponse = await response.json();
        setScheduleData(data);
      } catch (err: unknown) {
        console.error("Failed to fetch schedule data:", err);
        const message = err instanceof Error ? err.message : String(err);
        const isNetwork =
          err instanceof TypeError ||
          message.toLowerCase().includes('failed to fetch') ||
          message.toLowerCase().includes('network');
        setError(
          isNetwork
            ? "Could not connect to the optimization backend. Please ensure the FastAPI server is running."
            : `Schedule request failed: ${message}`
        );
      } finally {
        setLoading(false);
      }
    };

    const handler = setTimeout(() => { fetchSchedule(); }, 150);
    return () => clearTimeout(handler);
  }, [buildScheduleRequest]);

  // ── Roll to next day ──
  const handleRollToNextDay = useCallback(() => {
    if (!scheduleData) return;
    const nextDate = CONTRACT_DATES[CONTRACT_DATES.indexOf(selectedDate) + 1];
    if (!nextDate) return;
    const endSoc = scheduleData.summary.end_soc_mwh;
    const todayCharges = scheduleData.carry_forward?.today_charge_schedule ?? null;
    setCarryFromDate(selectedDate);
    setInitialSocMwh(endSoc);
    setPrevDayChargeSchedule(todayCharges);
    setSelectedDate(nextDate);
  }, [scheduleData, selectedDate]);

  // ── Clear carry-forward ──
  const handleClearCarry = useCallback(() => {
    setInitialSocMwh(0.0);
    setPrevDayChargeSchedule(null);
    setCarryFromDate(null);
  }, []);

  // ── Fetch RTC Range ──
  useEffect(() => {
    const fetchRange = async () => {
      setRangeLoading(true);
      try {
        const response = await fetch(`${BASE_URL}/api/rtc-range`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: selectedDate,
            wtg_count: wtgCount,
            solar_ac_mw: solarAc,
            curtailment_enabled: curtailmentEnabled,
            curtailment_segments: curtailmentSegments,
            transmission_loss_pct: transmissionLoss,
            roundtrip_loss_pct: roundtripLoss,
            min_compliance_ratio: 0.50,
            max_soc_mwh: maxSocMwh,
            max_charge_mw: maxChargeMw,
            max_discharge_mw: maxDischargeMw,
            min_dispatch_mw: minDispatchMw,
            initial_soc_mwh: initialSocMwh,
            block_overrides: buildOverridesList(),
            psp_discharge_segments: pspDischargeSegments.length > 0 ? pspDischargeSegments : null,
            discharge_target: dischargeTarget,
          })
        });
        if (response.ok) {
          const data: RTCRangeData = await response.json();
          setRtcRange(data);
        }
      } catch (e) {
        console.warn('RTC range fetch failed:', e);
      } finally {
        setRangeLoading(false);
      }
    };
    const handler = setTimeout(fetchRange, 300);
    return () => clearTimeout(handler);
  }, [selectedDate, wtgCount, solarAc, curtailmentEnabled, curtailmentSegments, transmissionLoss, roundtripLoss, maxSocMwh, maxChargeMw, maxDischargeMw, minDispatchMw, initialSocMwh, pspDischargeSegments, dischargeTarget, buildOverridesList]);

  // ── Fetch raw forecast ──
  useEffect(() => {
    const fetchRaw = async () => {
      try {
        const params = new URLSearchParams({
          wtg_count: String(wtgCount),
          solar_ac_mw: String(solarAc),
        });
        const response = await fetch(`${BASE_URL}/api/generation/${selectedDate}?${params.toString()}`);
        if (response.ok) {
          const data: RawForecastRow[] = await response.json();
          // Apply curtail_flag overlay using segments (first matching segment wins)
          const withCurtail = data.map(row => {
            if (!curtailmentEnabled) return { ...row, curtail_flag: false };
            const seg = curtailmentSegments.find(
              s => s.startBlock <= row.block && row.block <= s.endBlock
            );
            return { ...row, curtail_flag: seg !== undefined && seg.maxMw === 0 };
          });
          setRawForecast(withCurtail);
          // Restore any previously uploaded edits for this date
          const savedEdits = multiDayGenEditsRef.current[selectedDate];
          setGenTableEdits(savedEdits ? { ...savedEdits } : {});
        }
      } catch (e) {
        console.warn('Raw forecast fetch failed:', e);
      }
    };
    const handler = setTimeout(fetchRaw, 200);
    return () => clearTimeout(handler);
  }, [selectedDate, wtgCount, solarAc, curtailmentEnabled, curtailmentSegments]);

  // ── Derived ──
  const blocks = scheduleData?.blocks || [];
  const summary = scheduleData?.summary;

  const value: OptimizerContextValue = {
    selectedDate, setSelectedDate,
    wtgCount, setWtgCount,
    solarAc, setSolarAc,
    rtcCommitment, setRtcCommitment,
    maxSocMwh, setMaxSocMwh,
    maxChargeMw, setMaxChargeMw,
    maxDischargeMw, setMaxDischargeMw,
    minDispatchMw, setMinDispatchMw,
    chargeOverridden, setChargeOverridden,
    dischargeOverridden, setDischargeOverridden,
    minDispatchOverridden, setMinDispatchOverridden,
    autoChargeMw: derivedCharge,
    autoDischargeMw: derivedDischarge,
    autoMinDispatchMw: derivedMinDispatch,
    curtailmentEnabled, setCurtailmentEnabled,
    curtailmentSegments, setCurtailmentSegments,
    curtailmentStart,
    curtailmentEnd,
    pspDischargeSegments, setPspDischargeSegments,
    transmissionLoss, setTransmissionLoss,
    roundtripLoss, setRoundtripLoss,
    dischargeTarget, setDischargeTarget,
    sideTab, setSideTab,
    blockOverrides, setBlockOverrides,
    scheduleData, loading, error,
    rtcRange, rangeLoading, rangeExpanded, setRangeExpanded,
    initialSocMwh, setInitialSocMwh,
    prevDayChargeSchedule, carryFromDate,
    socModalOpen, setSocModalOpen,
    rawForecast,
    genTableEdits, setGenTableEdits,
    genTableExpanded, setGenTableExpanded,
    multiDayGenEdits, setMultiDayGenEdits,
    refreshGenerationEdits,
    blocks, summary,
    handleRollToNextDay, handleClearCarry,
    buildScheduleRequest,
  };

  return (
    <OptimizerContext.Provider value={value}>
      {children}
    </OptimizerContext.Provider>
  );
}
