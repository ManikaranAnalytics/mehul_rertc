// In production the frontend is served by FastAPI on the same origin → use relative URLs.
// In Vite dev mode (port 5173) Vite proxies /api to port 9000, so empty string still works.
export const BASE_URL = '';

/** PSP max storage slider ceiling (MWh) */
export const PSP_MAX_CAPACITY_MWH = 450;

/** PSP power limits (MW) — defaults match Orvakallu nominal ratings */
export const PSP_DEFAULT_MAX_CHARGE_MW = 60;
export const PSP_DEFAULT_MAX_DISCHARGE_MW = 50;
export const PSP_DEFAULT_MIN_DISPATCH_MW = 6;
export const PSP_DEFAULT_TRANSMISSION_LOSS_PCT = 3;
export const PSP_MAX_TRANSMISSION_LOSS_PCT = 15;
export const PSP_SLIDER_MAX_CHARGE_MW = 100;
export const PSP_SLIDER_MAX_DISCHARGE_MW = 100;
export const PSP_SLIDER_MAX_MIN_DISPATCH_MW = 60;

// Generate date options for June 2026
export const JUNE_DATES = Array.from({ length: 30 }, (_, i) => {
  const day = String(i + 1).padStart(2, '0');
  return `2026-06-${day}`;
});

/** RTC contract window — generation page filters are capped at these dates */
export const CONTRACT_START_DATE = '2026-06-01';
const CONTRACT_YEAR = CONTRACT_START_DATE.slice(0, 4);
export const CONTRACT_END_DATE = '2027-05-31';
export const JULY_START_DATE = `${CONTRACT_YEAR}-07-01`;
export const JULY_END_DATE = `${CONTRACT_YEAR}-07-31`;

export const CONTRACT_DATES = (() => {
  const dates: string[] = [];
  const start = new Date(`${CONTRACT_START_DATE}T00:00:00`);
  const end = new Date(`${CONTRACT_END_DATE}T00:00:00`);
  const current = new Date(start);
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
})();

export function clampContractDate(isoDate: string): string {
  if (isoDate < CONTRACT_START_DATE) return CONTRACT_START_DATE;
  if (isoDate > CONTRACT_END_DATE) return CONTRACT_END_DATE;
  return isoDate;
}

export function isContractDate(isoDate: string): boolean {
  return isoDate >= CONTRACT_START_DATE && isoDate <= CONTRACT_END_DATE;
}

export function formatContractDateLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ── Suzlon S144 3.0/3.15 MW Power Curve (kW per turbine) ──────────────
// Cut-in: 3.0 m/s  |  Rated: 11.0 m/s  |  Cut-out: 18.0 m/s
export const POWER_CURVE_KW: Record<string, number> = {
  '3.0': 35, '3.1': 50.2, '3.2': 65.4, '3.3': 80.6, '3.4': 95.8, '3.5': 111, '3.6': 133.2, '3.7': 155.4, '3.8': 177.6, '3.9': 199.8,
  '4.0': 222, '4.1': 250.8, '4.2': 279.6, '4.3': 308.4, '4.4': 337.2, '4.5': 366, '4.6': 403.6, '4.7': 441.2, '4.8': 478.8, '4.9': 516.4,
  '5.0': 554, '5.1': 596.8, '5.2': 639.6, '5.3': 682.4, '5.4': 725.2, '5.5': 768, '5.6': 818.2, '5.7': 868.4, '5.8': 918.6, '5.9': 968.8,
  '6.0': 1019, '6.1': 1076.4, '6.2': 1133.8, '6.3': 1191.2, '6.4': 1248.6, '6.5': 1306, '6.6': 1373.2, '6.7': 1440.4, '6.8': 1507.6, '6.9': 1574.8,
  '7.0': 1642, '7.1': 1718.2, '7.2': 1794.4, '7.3': 1870.6, '7.4': 1946.8, '7.5': 2023, '7.6': 2104.2, '7.7': 2185.4, '7.8': 2266.6, '7.9': 2347.8,
  '8.0': 2429, '8.1': 2493.4, '8.2': 2557.8, '8.3': 2622.2, '8.4': 2686.6, '8.5': 2751, '8.6': 2792.4, '8.7': 2833.8, '8.8': 2875.2, '8.9': 2916.6,
  '9.0': 2958, '9.1': 2979.2, '9.2': 3000.4, '9.3': 3021.6, '9.4': 3042.8, '9.5': 3064, '9.6': 3073.8, '9.7': 3083.6, '9.8': 3093.4, '9.9': 3103.2,
  '10.0': 3113, '10.1': 3118.2, '10.2': 3123.4, '10.3': 3128.6, '10.4': 3133.8, '10.5': 3139, '10.6': 3141.2, '10.7': 3143.4, '10.8': 3145.6, '10.9': 3147.8,
  '11.0': 3150, '11.1': 3150, '11.2': 3150, '11.3': 3150, '11.4': 3150, '11.5': 3150, '11.6': 3150, '11.7': 3150, '11.8': 3150, '11.9': 3150,
  '12.0': 3150, '12.1': 3150, '12.2': 3150, '12.3': 3150, '12.4': 3150, '12.5': 3150, '12.6': 3150, '12.7': 3150, '12.8': 3150, '12.9': 3150,
  '13.0': 3150, '13.1': 3150, '13.2': 3150, '13.3': 3150, '13.4': 3150, '13.5': 3150, '13.6': 3150, '13.7': 3150, '13.8': 3150, '13.9': 3150,
  '14.0': 3150, '14.1': 3150, '14.2': 3150, '14.3': 3150, '14.4': 3150, '14.5': 3150, '14.6': 3150, '14.7': 3150, '14.8': 3150, '14.9': 3150,
  '15.0': 3150, '15.1': 3150, '15.2': 3150, '15.3': 3150, '15.4': 3150, '15.5': 3150, '15.6': 3150, '15.7': 3150, '15.8': 3150, '15.9': 3150,
  '16.0': 3150, '16.1': 3150, '16.2': 3150, '16.3': 3150, '16.4': 3150, '16.5': 3150, '16.6': 3150, '16.7': 3150, '16.8': 3150, '16.9': 3150,
  '17.0': 3150, '17.1': 3150, '17.2': 3150, '17.3': 3150, '17.4': 3150, '17.5': 3150, '17.6': 3150, '17.7': 3150, '17.8': 3150, '17.9': 3150,
  '18.0': 3150,
};
