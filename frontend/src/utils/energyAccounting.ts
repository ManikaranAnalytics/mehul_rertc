import type { BlockData } from '../types';

export interface EnergyAccountingMetrics {
  totalScheduledMwh: number;
  pspDeliveredMwh: number;
  rtcScheduledMwh: number;
  rtmScheduledMwh: number;
}

const BLOCK_HOURS = 0.25;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Per-day energy accounting from 96 dispatch blocks. */
export function computeEnergyAccounting(
  blocks: BlockData[],
  rtcCommitmentMw: number,
): EnergyAccountingMetrics {
  let totalScheduledMwh = 0;
  let pspDeliveredMwh = 0;
  let rtcScheduledMwh = 0;
  let rtmScheduledMwh = 0;

  for (const b of blocks) {
    totalScheduledMwh += b.net_schedule * BLOCK_HOURS;
    pspDeliveredMwh += b.psp_discharge * BLOCK_HOURS;
    rtcScheduledMwh += Math.min(b.net_schedule, rtcCommitmentMw) * BLOCK_HOURS;
    rtmScheduledMwh += b.rtm_surplus * BLOCK_HOURS;
  }

  return {
    totalScheduledMwh: round1(totalScheduledMwh),
    pspDeliveredMwh: round1(pspDeliveredMwh),
    rtcScheduledMwh: round1(rtcScheduledMwh),
    rtmScheduledMwh: round1(rtmScheduledMwh),
  };
}

export function sumEnergyAccounting(
  items: EnergyAccountingMetrics[],
): EnergyAccountingMetrics {
  const total = items.reduce(
    (acc, m) => ({
      totalScheduledMwh: acc.totalScheduledMwh + m.totalScheduledMwh,
      pspDeliveredMwh: acc.pspDeliveredMwh + m.pspDeliveredMwh,
      rtcScheduledMwh: acc.rtcScheduledMwh + m.rtcScheduledMwh,
      rtmScheduledMwh: acc.rtmScheduledMwh + m.rtmScheduledMwh,
    }),
    { totalScheduledMwh: 0, pspDeliveredMwh: 0, rtcScheduledMwh: 0, rtmScheduledMwh: 0 },
  );
  return {
    totalScheduledMwh: round1(total.totalScheduledMwh),
    pspDeliveredMwh: round1(total.pspDeliveredMwh),
    rtcScheduledMwh: round1(total.rtcScheduledMwh),
    rtmScheduledMwh: round1(total.rtmScheduledMwh),
  };
}
