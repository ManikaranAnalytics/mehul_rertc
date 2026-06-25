import { BASE_URL } from './constants';
import type { GenEdit } from '../types';
import { lookupWindMW } from './powerCurve';

export interface GenerationDbRow {
  date: string;
  block: number;
  time: string;
  wind_speed: number;
  solar_mw: number;
  has_upload?: boolean;
}

export interface GenerationDbDateResponse {
  date: string;
  has_upload: boolean;
  rows: GenerationDbRow[];
}

export async function fetchGenerationFromDb(
  date: string,
  solarAcMw?: number,
): Promise<GenerationDbDateResponse> {
  const params = solarAcMw != null ? `?solar_ac_mw=${solarAcMw}` : '';
  const res = await fetch(`${BASE_URL}/api/generation/db/${date}${params}`);
  if (!res.ok) throw new Error('Failed to load generation data');
  return res.json();
}

export async function uploadGenerationCsv(
  file: File,
  defaultDate?: string,
  solarAcMw = 60,
): Promise<{ rows_upserted: number; dates_updated: number }> {
  const form = new FormData();
  form.append('file', file);
  const params = new URLSearchParams();
  if (defaultDate) params.set('default_date', defaultDate);
  params.set('solar_ac_mw', String(solarAcMw));
  const res = await fetch(`${BASE_URL}/api/generation/db/upload?${params.toString()}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Upload failed');
  }
  return res.json();
}

export function downloadGenerationTemplate(fromDate: string, toDate: string): void {
  const url = `${BASE_URL}/api/generation/db/template?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`;
  const link = document.createElement('a');
  link.href = url;
  link.download = `generation_input_${fromDate}_to_${toDate}.csv`;
  link.click();
}

export async function fetchAllGenerationEdits(): Promise<{
  edits: Record<string, Record<number, GenEdit>>;
  uploadMeta: Record<string, { solar_ac_mw: number; mode: string }>;
}> {
  const res = await fetch(`${BASE_URL}/api/generation/db/edits`);
  if (!res.ok) return { edits: {}, uploadMeta: {} };
  const body = await res.json() as {
    edits: Record<string, Record<string, GenEdit>>;
    upload_meta?: Record<string, { solar_ac_mw: number; mode: string }>;
  };
  const result: Record<string, Record<number, GenEdit>> = {};
  Object.entries(body.edits ?? {}).forEach(([date, blocks]) => {
    result[date] = {};
    Object.entries(blocks).forEach(([blockStr, edit]) => {
      result[date][parseInt(blockStr, 10)] = edit;
    });
  });
  return { edits: result, uploadMeta: body.upload_meta ?? {} };
}

export function genEditsToBlockOverrides(
  edits: Record<number, GenEdit> | undefined,
  wtgCount: number,
): Array<{ block: number; wind_mw?: number; solar_mw?: number }> {
  if (!edits) return [];
  const overrides: Array<{ block: number; wind_mw?: number; solar_mw?: number }> = [];
  Object.entries(edits).forEach(([blockStr, edit]) => {
    const block = parseInt(blockStr, 10);
    const entry: { block: number; wind_mw?: number; solar_mw?: number } = { block };
    if (edit.wind_speed !== undefined && edit.wind_speed !== '') {
      const spd = parseFloat(edit.wind_speed);
      if (!isNaN(spd)) entry.wind_mw = lookupWindMW(spd, wtgCount);
    }
    if (edit.solar_mw !== undefined && edit.solar_mw !== '') {
      const sol = parseFloat(edit.solar_mw);
      if (!isNaN(sol)) entry.solar_mw = sol;
    }
    if (entry.wind_mw !== undefined || entry.solar_mw !== undefined) {
      overrides.push(entry);
    }
  });
  return overrides;
}

/** Remove July generation uploads from PostgreSQL; June data is preserved. */
export async function resetJulyGenerationDb(): Promise<{ rows_deleted: number }> {
  const res = await fetch(`${BASE_URL}/api/generation/db`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to reset July generation data');
  return res.json();
}

export async function patchGenerationBlocks(
  date: string,
  rows: Array<{ block: number; wind_speed: number; solar_mw: number }>,
  solarAcMw: number,
): Promise<{ rows_upserted: number; dates_updated: number }> {
  const res = await fetch(
    `${BASE_URL}/api/generation/db/${encodeURIComponent(date)}?solar_ac_mw=${solarAcMw}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Failed to save generation data');
  }
  return res.json();
}

export function dbRowsToGenEdits(rows: GenerationDbRow[]): Record<number, GenEdit> {
  const edits: Record<number, GenEdit> = {};
  rows.forEach((row) => {
    if (!row.has_upload && row.wind_speed === 0 && row.solar_mw === 0) return;
    edits[row.block] = {
      wind_speed: row.wind_speed.toFixed(2),
      solar_mw: row.solar_mw.toFixed(3),
    };
  });
  return edits;
}
