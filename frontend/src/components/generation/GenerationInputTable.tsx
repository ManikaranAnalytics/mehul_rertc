import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, Download, Upload } from 'lucide-react';
import { useOptimizer } from '../../context/OptimizerContext';
import {
  CONTRACT_END_DATE,
  CONTRACT_START_DATE,
  JULY_START_DATE,
  clampContractDate,
} from '../../utils/constants';
import { lookupWindMW } from '../../utils/powerCurve';
import {
  resetJulyGenerationDb,
  dbRowsToGenEdits,
  downloadGenerationTemplate,
  fetchGenerationFromDb,
  patchGenerationBlocks,
  uploadGenerationCsv,
  type GenerationDbRow,
} from '../../utils/generationDbApi';
import {
  loadGenerationFilter,
  saveGenerationFilter,
  type GenerationFilterState,
} from '../../utils/generationFilterStorage';
import type { GenEdit } from '../../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatSimulationDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDatesInRange(from: string, to: string): string[] {
  const clampedFrom = clampContractDate(from);
  const clampedTo = clampContractDate(to);
  if (!clampedFrom || !clampedTo || clampedFrom > clampedTo) return [];
  const dates: string[] = [];
  const current = new Date(clampedFrom + 'T00:00:00');
  const end = new Date(clampedTo + 'T00:00:00');
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function zeroRows(forDate: string): GenerationDbRow[] {
  return Array.from({ length: 96 }, (_, i) => ({
    date: forDate,
    block: i + 1,
    time: `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00`,
    wind_speed: 0,
    solar_mw: 0,
    has_upload: false,
  }));
}

interface DisplayRow extends GenerationDbRow {
  curtail_flag: boolean;
  wind_mw_raw: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GenerationInputTable() {
  const {
    wtgCount,
    solarAc,
    curtailmentEnabled,
    curtailmentSegments,
    selectedDate,
    setSelectedDate,
    setGenTableEdits,
    refreshGenerationEdits,
  } = useOptimizer();

  const [filter, setFilter] = useState<GenerationFilterState>(loadGenerationFilter);
  const { fromDate, toDate } = filter;

  const [pageEdits, setPageEdits] = useState<Record<number, GenEdit>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const genTableRef = useRef<HTMLDivElement>(null);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasUploadForDate, setHasUploadForDate] = useState(false);
  const [displayRows, setDisplayRows] = useState<DisplayRow[]>([]);
  const [saving, setSaving] = useState(false);

  const pageEditsRef = useRef(pageEdits);
  const displayRowsRef = useRef(displayRows);
  const pendingSavesRef = useRef<Set<number>>(new Set());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { pageEditsRef.current = pageEdits; }, [pageEdits]);
  useEffect(() => { displayRowsRef.current = displayRows; }, [displayRows]);

  const modifiedCount = Object.keys(pageEdits).length;
  const datesInRange = getDatesInRange(fromDate, toDate);

  const updateFilter = useCallback((patch: Partial<GenerationFilterState>) => {
    setFilter((prev) => {
      const next = { ...prev, ...patch };
      saveGenerationFilter(next);
      return next;
    });
  }, []);

  const syncEditsToOptimizer = useCallback((edits: Record<number, GenEdit>) => {
    if (fromDate === selectedDate) {
      setGenTableEdits(edits);
    }
  }, [fromDate, selectedDate, setGenTableEdits]);

  const applyPageEdits = useCallback((edits: Record<number, GenEdit>) => {
    setPageEdits(edits);
    syncEditsToOptimizer(edits);
  }, [syncEditsToOptimizer]);

  const buildDisplayRows = useCallback((rows: GenerationDbRow[], edits: Record<number, GenEdit>): DisplayRow[] => {
    return rows.map((row) => {
      const seg = curtailmentEnabled
        ? curtailmentSegments.find((s) => s.startBlock <= row.block && row.block <= s.endBlock)
        : undefined;
      const curtail_flag = seg !== undefined && seg.maxMw === 0;
      const edit = edits[row.block];
      const windSpeed = edit?.wind_speed !== undefined
        ? parseFloat(edit.wind_speed)
        : row.wind_speed;
      const wind_mw_raw = !isNaN(windSpeed) ? lookupWindMW(windSpeed, wtgCount) : 0;
      return { ...row, curtail_flag, wind_mw_raw };
    });
  }, [curtailmentEnabled, curtailmentSegments, wtgCount]);

  const getBlockPersistValues = useCallback((block: number): { wind_speed: number; solar_mw: number } | null => {
    const row = displayRowsRef.current.find((r) => r.block === block);
    if (!row) return null;
    const edit = pageEditsRef.current[block] ?? {};
    const windStr = edit.wind_speed !== undefined ? edit.wind_speed : String(row.wind_speed);
    const solarStr = edit.solar_mw !== undefined ? edit.solar_mw : String(row.solar_mw);
    const wind_speed = parseFloat(windStr);
    const solar_mw = parseFloat(solarStr);
    if (isNaN(wind_speed) || isNaN(solar_mw)) return null;
    return { wind_speed, solar_mw };
  }, []);

  const flushSavesRef = useRef<() => Promise<void>>(async () => {});

  const flushSaves = useCallback(async () => {
    const blocks = Array.from(pendingSavesRef.current);
    pendingSavesRef.current.clear();
    if (blocks.length === 0) return;

    const rows = blocks
      .map((block) => {
        const values = getBlockPersistValues(block);
        return values ? { block, ...values } : null;
      })
      .filter((r): r is { block: number; wind_speed: number; solar_mw: number } => r !== null);

    if (rows.length === 0) return;

    setSaving(true);
    try {
      await patchGenerationBlocks(fromDate, rows, solarAc);
      setHasUploadForDate(true);
      await refreshGenerationEdits();
      const response = await fetchGenerationFromDb(fromDate);
      const edits = response.has_upload ? dbRowsToGenEdits(response.rows) : {};
      setPageEdits(edits);
      syncEditsToOptimizer(edits);
      setDisplayRows(buildDisplayRows(response.rows, edits));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save changes.';
      setUploadMessage({ type: 'error', text: message });
    } finally {
      setSaving(false);
    }
  }, [fromDate, solarAc, refreshGenerationEdits, getBlockPersistValues, buildDisplayRows, syncEditsToOptimizer]);

  useEffect(() => { flushSavesRef.current = flushSaves; }, [flushSaves]);

  const updateBlockEdit = useCallback((block: number, patch: Partial<GenEdit>) => {
    setPageEdits((prev) => {
      const next = {
        ...prev,
        [block]: { ...(prev[block] ?? {}), ...patch },
      };
      syncEditsToOptimizer(next);
      return next;
    });
    pendingSavesRef.current.add(block);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void flushSavesRef.current(); }, 400);
  }, [syncEditsToOptimizer]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  // Load generation data from PostgreSQL (isolated from single/multi-day analysis)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetchGenerationFromDb(fromDate);
        if (cancelled) return;
        setHasUploadForDate(response.has_upload);
        const edits = response.has_upload ? dbRowsToGenEdits(response.rows) : {};
        setPageEdits(edits);
        setDisplayRows(buildDisplayRows(response.rows, edits));
      } catch {
        if (!cancelled) {
          setHasUploadForDate(false);
          setPageEdits({});
          setDisplayRows(buildDisplayRows(zeroRows(fromDate), {}));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [fromDate, buildDisplayRows]);

  // Recompute wind MW when local edits or curtailment change
  useEffect(() => {
    setDisplayRows((prev) => buildDisplayRows(prev, pageEdits));
  }, [pageEdits, curtailmentEnabled, curtailmentSegments, wtgCount, buildDisplayRows]);

  const cellInputStyle = (color: string, modified: boolean): React.CSSProperties => ({
    width: '100%',
    background: modified ? 'rgba(245,158,11,0.08)' : '#0a1020',
    border: `1px solid ${modified ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.07)'}`,
    borderRadius: '5px',
    color: modified ? '#fbbf24' : color,
    padding: '4px 7px',
    fontSize: '12px',
    fontFamily: 'JetBrains Mono, monospace',
    fontWeight: modified ? '700' : '400',
    outline: 'none',
    transition: 'border-color 0.15s',
  });

  const handleFileUpload = async (file: File) => {
    setUploadMessage(null);
    try {
      const result = await uploadGenerationCsv(file, fromDate, solarAc);
      const response = await fetchGenerationFromDb(fromDate);
      setHasUploadForDate(response.has_upload);
      const edits = response.has_upload ? dbRowsToGenEdits(response.rows) : {};
      applyPageEdits(edits);
      setDisplayRows(buildDisplayRows(response.rows, edits));
      await refreshGenerationEdits();
      setUploadMessage({
        type: 'success',
        text: `Saved ${result.rows_upserted} rows across ${result.dates_updated} date(s) to PostgreSQL. Data persists — no re-upload needed.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not upload file.';
      setUploadMessage({ type: 'error', text: message });
    }
  };

  const handleResetJuly = async () => {
    setUploadMessage(null);
    try {
      const result = await resetJulyGenerationDb();
      if (fromDate >= JULY_START_DATE) {
        applyPageEdits({});
        setHasUploadForDate(false);
        setDisplayRows(buildDisplayRows(zeroRows(fromDate), {}));
      }
      await refreshGenerationEdits();
      setUploadMessage({
        type: 'success',
        text: `Removed ${result.rows_deleted} July row(s) from PostgreSQL. June data was not changed.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset July data.';
      setUploadMessage({ type: 'error', text: message });
    }
  };

  const handleDownloadTemplate = () => {
    if (datesInRange.length === 0) {
      setUploadMessage({ type: 'error', text: 'Invalid date range. "From" must be before "To".' });
      return;
    }
    setTemplateLoading(true);
    setUploadMessage(null);
    try {
      downloadGenerationTemplate(fromDate, toDate);
    } catch {
      setUploadMessage({ type: 'error', text: 'Failed to download template.' });
    } finally {
      setTemplateLoading(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent, startBlock: number) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return;

    const newEdits = { ...pageEdits };
    const affectedBlocks: number[] = [];
    lines.forEach((line, i) => {
      const cells = line.includes('\t') ? line.split('\t') : line.split(',');
      const block = parseInt(cells[0], 10) || startBlock + i;
      if (block < 1 || block > 96) return;
      const wind = cells[1]?.trim();
      const solar = cells[2]?.trim();
      newEdits[block] = {
        ...(newEdits[block] ?? {}),
        ...(wind ? { wind_speed: wind } : {}),
        ...(solar ? { solar_mw: solar } : {}),
      };
      affectedBlocks.push(block);
    });
    setPageEdits(newEdits);
    syncEditsToOptimizer(newEdits);
    affectedBlocks.forEach((b) => pendingSavesRef.current.add(b));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void flushSavesRef.current(); }, 400);
  };

  const handleFilterDateChange = (field: 'from' | 'to', value: string) => {
    const clamped = clampContractDate(value);
    if (field === 'from') {
      const nextTo = clamped > toDate ? clamped : toDate;
      updateFilter({ fromDate: clamped, toDate: nextTo });
      setSelectedDate(clamped);
    } else {
      const nextFrom = clamped < fromDate ? clamped : fromDate;
      updateFilter({ fromDate: nextFrom, toDate: clamped });
    }
  };

  return (
    <section className="glass-panel generation-input-panel">
      <div className="generation-input-toolbar">
        <div className="generation-input-toolbar__left">
          <div>
            <h2 className="generation-input-title">Generation Input</h2>
            <p className="generation-input-subtitle">
              Upload CSV once — data is stored in PostgreSQL and feeds single-day and multi-day analysis.
              Dates after {formatSimulationDate(CONTRACT_END_DATE)} are blocked.
            </p>
          </div>
          <div className="generation-input-badges">
            <span className="generation-badge generation-badge--date">
              {formatSimulationDate(fromDate)} – {formatSimulationDate(toDate)}
              &nbsp;·&nbsp;{datesInRange.length} day{datesInRange.length !== 1 ? 's' : ''}
              &nbsp;·&nbsp;{datesInRange.length * 96} blocks
            </span>
            {loading && !saving && (
              <span className="generation-badge generation-badge--modified" style={{ color: '#94a3b8' }}>
                Loading from database…
              </span>
            )}
            {saving && (
              <span className="generation-badge generation-badge--modified" style={{ color: '#60a5fa' }}>
                Saving to database…
              </span>
            )}
            {!loading && !hasUploadForDate && (
              <span className="generation-badge generation-badge--modified" style={{ color: '#94a3b8' }}>
                No upload for this date — showing zeros
              </span>
            )}
            {!loading && hasUploadForDate && (
              <span className="generation-badge generation-badge--stored">
                Loaded from PostgreSQL
              </span>
            )}
            {modifiedCount > 0 && (
              <span className="generation-badge generation-badge--modified">
                {modifiedCount} edited on screen
              </span>
            )}
          </div>
        </div>

        <div className="generation-input-toolbar__right">
          <div className="date-range-picker">
            <Calendar size={14} style={{ color: '#64748b', flexShrink: 0 }} />
            <label className="generation-control" style={{ gap: '6px' }}>
              <span>From</span>
              <input
                id="gen-from-date"
                type="date"
                className="date-input"
                min={CONTRACT_START_DATE}
                max={CONTRACT_END_DATE}
                value={fromDate}
                onChange={(e) => handleFilterDateChange('from', e.target.value)}
              />
            </label>
            <span style={{ color: '#475569', fontSize: '12px' }}>→</span>
            <label className="generation-control" style={{ gap: '6px' }}>
              <span>To</span>
              <input
                id="gen-to-date"
                type="date"
                className="date-input"
                min={CONTRACT_START_DATE}
                max={CONTRACT_END_DATE}
                value={toDate}
                onChange={(e) => handleFilterDateChange('to', e.target.value)}
              />
            </label>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileUpload(file);
              e.target.value = '';
            }}
          />

          <button
            id="gen-upload-btn"
            type="button"
            className="generation-action-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} />
            Upload CSV
          </button>

          <button
            id="gen-template-btn"
            type="button"
            className="generation-action-btn"
            onClick={handleDownloadTemplate}
            disabled={templateLoading || datesInRange.length === 0}
          >
            <Download size={14} />
            {templateLoading ? 'Fetching…' : 'Template'}
          </button>

          {fromDate >= JULY_START_DATE && (modifiedCount > 0 || hasUploadForDate) && (
            <button
              id="gen-reset-btn"
              type="button"
              className="generation-action-btn generation-action-btn--danger"
              onClick={() => { void handleResetJuly(); }}
            >
              Reset July
            </button>
          )}
        </div>
      </div>

      {uploadMessage && (
        <div className={`generation-upload-message generation-upload-message--${uploadMessage.type}`}>
          {uploadMessage.text}
        </div>
      )}

      <div className="generation-input-help">
        <span>Upload columns: <strong>date</strong>, <strong>block</strong>, <strong>wind_speed</strong>, <strong>solar_mw</strong></span>
        <span>Contract window: {CONTRACT_START_DATE} to {CONTRACT_END_DATE}</span>
        <span>Template downloads data for the selected filter range (uploaded values or zeros)</span>
        <span>Wind Gen (MW) is calculated from wind speed — not directly editable</span>
        <span>Cell edits auto-save to PostgreSQL</span>
      </div>

      <div className="table-container gen-input-table" ref={genTableRef} key={fromDate}>
        <table className="schedule-table generation-input-table__grid">
          <thead>
            <tr>
              <th>TB</th>
              <th>Time</th>
              <th>Wind Speed (m/s)</th>
              <th>Wind Gen (MW)</th>
              <th>Solar Gen (MW)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const edit = pageEdits[row.block] ?? {};
              const isModified = !!pageEdits[row.block];
              const isCurtailed = row.curtail_flag;

              const effWindSpeed =
                edit.wind_speed !== undefined ? edit.wind_speed : row.wind_speed.toFixed(2);
              const effWindMW =
                edit.wind_speed !== undefined && edit.wind_speed !== ''
                  ? lookupWindMW(parseFloat(edit.wind_speed), wtgCount)
                  : row.wind_mw_raw;
              const effSolarMW =
                edit.solar_mw !== undefined ? edit.solar_mw : row.solar_mw.toFixed(3);

              const rowBg = isModified
                ? 'rgba(245,158,11,0.07)'
                : isCurtailed
                  ? 'rgba(239,68,68,0.03)'
                  : 'transparent';

              return (
                <tr
                  key={row.block}
                  className={isModified ? 'gen-modified-row' : ''}
                  style={{ background: rowBg, borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                >
                  <td className="mono-col" style={{ color: isModified ? '#fbbf24' : '#64748b', fontWeight: isModified ? '700' : '400' }}>
                    {row.block}
                  </td>
                  <td className="mono-col" style={{ color: '#64748b' }}>{row.time.substring(0, 5)}</td>

                  <td style={{ padding: '4px 8px' }}>
                    {isCurtailed ? (
                      <span className="generation-curtailed-label">Curtailed</span>
                    ) : (
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="25"
                        value={effWindSpeed}
                        style={cellInputStyle('#00d2ff', edit.wind_speed !== undefined)}
                        onChange={(e) => {
                          updateBlockEdit(row.block, { wind_speed: e.target.value });
                        }}
                        onPaste={(e) => handlePaste(e, row.block)}
                      />
                    )}
                  </td>

                  <td style={{ padding: '4px 8px' }}>
                    {isCurtailed ? (
                      <span className="generation-readonly-value generation-readonly-value--wind">0.000</span>
                    ) : (
                      <div
                        className={`generation-readonly-value generation-readonly-value--wind ${edit.wind_speed !== undefined ? 'generation-readonly-value--active' : ''}`}
                        aria-readonly="true"
                        tabIndex={-1}
                        title="Calculated from wind speed (read-only)"
                      >
                        {effWindMW.toFixed(3)}
                      </div>
                    )}
                  </td>

                  <td style={{ padding: '4px 8px' }}>
                    {isCurtailed ? (
                      <span className="generation-readonly-value generation-readonly-value--solar">0.000</span>
                    ) : (
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={effSolarMW}
                        style={cellInputStyle('var(--color-solar)', edit.solar_mw !== undefined)}
                        onChange={(e) => {
                          updateBlockEdit(row.block, { solar_mw: e.target.value });
                        }}
                        onPaste={(e) => handlePaste(e, row.block)}
                      />
                    )}
                  </td>

                  <td>
                    {isCurtailed ? (
                      <span className="cell-badge curtail">Curtailed</span>
                    ) : isModified ? (
                      <span className="cell-badge generation-edited-badge">Edited</span>
                    ) : hasUploadForDate ? (
                      <span className="generation-status-default">Uploaded</span>
                    ) : (
                      <span className="generation-status-default">Zero</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="generation-input-footer">
        <span>Siemens Gamesa SG 3.15-114 · {wtgCount} WTGs · Cut-in 3 m/s · Rated 11 m/s · Cut-out 18 m/s</span>
      </div>
    </section>
  );
}
