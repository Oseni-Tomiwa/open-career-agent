import recordedV22Baseline from './baseline-v2.2-v0.1.json' with { type: 'json' };
import type { RequirementEvaluationReport } from './types.js';

export type RequirementEvaluationBaseline = Omit<
  RequirementEvaluationReport,
  'caseDiagnostics' | 'issues'
>;

export const V2_2_REQUIREMENT_EVALUATION_BASELINE =
  recordedV22Baseline as RequirementEvaluationBaseline;

export function baselineFromReport(
  report: RequirementEvaluationReport,
): RequirementEvaluationBaseline {
  const {
    caseDiagnostics: _caseDiagnostics,
    issues: _issues,
    ...baseline
  } = report;
  return baseline;
}

export function compareRequirementEvaluationBaseline(
  report: RequirementEvaluationReport,
): readonly string[] {
  const actual = JSON.stringify(baselineFromReport(report), null, 2);
  const expected = JSON.stringify(
    V2_2_REQUIREMENT_EVALUATION_BASELINE,
    null,
    2,
  );
  return actual === expected
    ? []
    : [
        'Current extraction evaluation differs from the reviewed V2.2 baseline. Review diagnostics and ground truth before updating the baseline.',
      ];
}
