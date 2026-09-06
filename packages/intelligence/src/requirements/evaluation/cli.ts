import { compareRequirementEvaluationBaseline } from './baseline.js';
import { REQUIREMENT_EVALUATION_CORPUS } from './corpus-v0.1.js';
import {
  evaluateRequirementCorpus,
  formatRequirementEvaluationDiagnostics,
  formatRequirementEvaluationReport,
} from './harness.js';
import { validateRequirementCorpus } from './validation.js';

const corpusErrors = validateRequirementCorpus(REQUIREMENT_EVALUATION_CORPUS);
if (corpusErrors.length > 0) {
  process.stderr.write(
    `Corpus validation failed:\n${corpusErrors.join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  const report = evaluateRequirementCorpus(REQUIREMENT_EVALUATION_CORPUS);
  const baselineErrors = compareRequirementEvaluationBaseline(report);
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(
      `${formatRequirementEvaluationReport(report)}\n\n${formatRequirementEvaluationDiagnostics(report)}\n\nBaseline: ${baselineErrors.length === 0 ? 'matches reviewed V2.2 baseline' : 'DRIFT'}\n`,
    );
  }
  if (baselineErrors.length > 0) {
    process.stderr.write(`${baselineErrors.join('\n')}\n`);
    process.exitCode = 1;
  }
}
