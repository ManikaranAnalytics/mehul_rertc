import { useCallback, useEffect, useRef, useState } from 'react';
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

  // Load generation data from PostgreSQL (isolated from single/multi-day analysis)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetchGenerationFromDb(fromDate, solarAc);
        if (cancelled) return;
        setHasUploadForDate(response.has_upload);
        setPageEdits({});
        setDisplayRows(buildDisplayRows(response.rows, {}));
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
  }, [fromDate, solarAc, buildDisplayRows]);

  // Recompute wind MW when local edits or curtailment change
  useEffect(() => {
    setDisplayRows((prev) => buildDisplayRows(prev, pageEdits));
  }, [pageEdits, curtailmentEnabled, curtailmentSegments, wtgCount, buildDisplayRows]);

  const handleFileUpload = async (file: File) => {
    setUploadMessage(null);
    try {
      const result = await uploadGenerationCsv(file, fromDate, solarAc);
      const response = await fetchGenerationFromDb(fromDate, solarAc);
      setHasUploadForDate(response.has_upload);
      applyPageEdits({});
      setDisplayRows(buildDisplayRows(response.rows, {}));
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
            {loading && (
              <span className="generation-badge generation-badge--modified" style={{ color: '#94a3b8' }}>
                Loading from database…
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

          {fromDate >= JULY_START_DATE && hasUploadForDate && (
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
        <span>Wind Speed and Solar Gen are set via CSV upload — not editable in the table</span>
        <span>Wind Gen (MW) is calculated from wind speed</span>
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
              const isCurtailed = row.curtail_flag;

              const effWindSpeed = row.wind_speed.toFixed(2);
              const effWindMW = row.wind_mw_raw;
              const effSolarMW = row.solar_mw.toFixed(3);

              const rowBg = isCurtailed ? 'rgba(239,68,68,0.03)' : 'transparent';

              return (
                <tr
                  key={row.block}
                  style={{ background: rowBg, borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                >
                  <td className="mono-col" style={{ color: '#64748b' }}>
                    {row.block}
                  </td>
                  <td className="mono-col" style={{ color: '#64748b' }}>{row.time.substring(0, 5)}</td>

                  <td style={{ padding: '4px 8px' }}>
                    {isCurtailed ? (
                      <span className="generation-curtailed-label">Curtailed</span>
                    ) : (
                      <div
                        className={`generation-readonly-value generation-readonly-value--wind ${hasUploadForDate ? 'generation-readonly-value--active' : ''}`}
                        aria-readonly="true"
                        tabIndex={-1}
                        title="Set via CSV upload (read-only)"
                      >
                        {effWindSpeed}
                      </div>
                    )}
                  </td>

                  <td style={{ padding: '4px 8px' }}>
                    {isCurtailed ? (
                      <span className="generation-readonly-value generation-readonly-value--wind">0.000</span>
                    ) : (
                      <div
                        className={`generation-readonly-value generation-readonly-value--wind ${hasUploadForDate ? 'generation-readonly-value--active' : ''}`}
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
                      <div
                        className={`generation-readonly-value generation-readonly-value--solar ${hasUploadForDate ? 'generation-readonly-value--active' : ''}`}
                        aria-readonly="true"
                        tabIndex={-1}
                        title="Set via CSV upload (read-only)"
                      >
                        {effSolarMW}
                      </div>
                    )}
                  </td>

                  <td>
                    {isCurtailed ? (
                      <span className="cell-badge curtail">Curtailed</span>
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
