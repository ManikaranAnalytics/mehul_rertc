import type { DischargeTarget } from '../../types';

interface DischargeTargetToggleProps {
  value: DischargeTarget;
  onChange: (value: DischargeTarget) => void;
  compact?: boolean;
}

export default function DischargeTargetToggle({ value, onChange, compact }: DischargeTargetToggleProps) {
  return (
    <div
      className={`mini-segment-toggle${compact ? ' mini-segment-toggle--compact' : ''}`}
      role="group"
      aria-label="PSP discharge target"
    >
      <button
        type="button"
        className={value === 'compliance_floor' ? 'active' : ''}
        onClick={() => onChange('compliance_floor')}
        title="Discharge PSP only to meet the 50% regulatory floor"
      >
        Floor
      </button>
      <button
        type="button"
        className={value === 'rtc_commitment' ? 'active' : ''}
        onClick={() => onChange('rtc_commitment')}
        title="Discharge PSP toward full RTC commitment when SoC is available"
      >
        RTC
      </button>
    </div>
  );
}
