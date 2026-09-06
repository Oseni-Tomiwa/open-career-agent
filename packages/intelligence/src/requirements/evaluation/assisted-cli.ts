import {
  evaluateAssistedRequirementCorpus,
  formatAssistedRequirementEvaluation,
} from './assisted-harness.js';

const report = await evaluateAssistedRequirementCorpus();
process.stdout.write(
  process.argv.includes('--json')
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${formatAssistedRequirementEvaluation(report)}\n`,
);
if (report.unsafePromotions > 0) process.exitCode = 1;
