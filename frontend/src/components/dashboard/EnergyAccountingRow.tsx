import type { EnergyAccountingMetrics } from '../../utils/energyAccounting';

interface EnergyAccountingRowProps {
  metrics: EnergyAccountingMetrics;
  subtitle?: string;
}

const METRICS: Array<{
  key: keyof EnergyAccountingMetrics;
  label: string;
  color: string;
  hint: string;
}> = [
  {
    key: 'totalScheduledMwh',
    label: 'Total Schedule',
    color: '#34d399',
    hint: 'Sum of net schedule across all 15-min blocks',
  },
  {
    key: 'pspDeliveredMwh',
    label: 'Delivered by PSP',
    color: '#a78bfa',
    hint: 'Energy injected from PSP discharge',
  },
  {
    key: 'rtcScheduledMwh',
    label: 'Scheduled under RTC (PPA)',
    color: '#818cf8',
    hint: 'Net schedule capped at RTC commitment per block',
  },
  {
    key: 'rtmScheduledMwh',
    label: 'Scheduled in RTM',
    color: '#94a3b8',
    hint: 'Generation surplus above RTC (not charged to PSP)',
  },
];

export default function EnergyAccountingRow({ metrics, subtitle }: EnergyAccountingRowProps) {
  return (
    <section className="energy-accounting-row glass-panel">
      {METRICS.map((item, index) => (
        <div
          key={item.key}
          className="energy-accounting-cell"
          style={index < METRICS.length - 1 ? { borderRight: '1px solid rgba(255,255,255,0.07)' } : undefined}
        >
          <div className="energy-accounting-label">{item.label}</div>
          <div className="energy-accounting-value" style={{ color: item.color }}>
            {metrics[item.key].toFixed(1)}
            <span className="energy-accounting-unit">MWh</span>
          </div>
          <div className="energy-accounting-hint">{item.hint}</div>
        </div>
      ))}
      {subtitle && <div className="energy-accounting-subtitle">{subtitle}</div>}
    </section>
  );
}
