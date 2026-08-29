import type {
  Decision,
  EligibilityState,
  EvidenceState,
  FitLevel,
  QualityLevel,
} from '../data/types.js';
import { Icon, type IconName } from './Icon.js';

const eligibilityCopy: Record<EligibilityState, string> = {
  eligible: 'Eligible',
  ineligible: 'Blocked',
  investigate: 'Investigate',
  unknown: 'Unknown',
};

const eligibilityIcon: Record<EligibilityState, IconName> = {
  eligible: 'check',
  ineligible: 'blocker',
  investigate: 'warning',
  unknown: 'unknown',
};

export function EligibilityStatus({
  state,
}: {
  readonly state: EligibilityState;
}) {
  return (
    <span className="status-label" data-status={state}>
      <Icon name={eligibilityIcon[state]} size={15} />
      {eligibilityCopy[state]}
    </span>
  );
}

export function DecisionBadge({ decision }: { readonly decision: Decision }) {
  const labels: Record<Decision, string> = {
    'high-priority': 'High priority',
    consider: 'Consider',
    investigate: 'Investigate',
    'low-priority': 'Low priority',
    ineligible: 'Ineligible',
  };
  return (
    <span className="decision-label" data-decision={decision}>
      {labels[decision]}
    </span>
  );
}

export function SignalScore({
  label,
  level,
  score,
}: {
  readonly label: string;
  readonly level: FitLevel | QualityLevel;
  readonly score: number;
}) {
  return (
    <div className="signal-score" data-level={level}>
      <div className="signal-score-copy">
        <span>{label}</span>
        <strong>{level}</strong>
      </div>
      <div
        aria-label={`${label}: ${level}, ${score} out of 100`}
        className="score-track"
        role="img"
      >
        <span style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function EvidenceStateLabel({
  state,
}: {
  readonly state: EvidenceState;
}) {
  const labels: Record<EvidenceState, string> = {
    'source-verified': 'Source verified',
    'candidate-confirmed': 'Candidate confirmed',
    unreviewed: 'Needs verification',
    disputed: 'Disputed',
  };
  return (
    <span className="evidence-state" data-evidence-state={state}>
      <Icon name={state === 'disputed' ? 'warning' : 'evidence'} size={14} />
      {labels[state]}
    </span>
  );
}
