import { describe, expect, it } from 'vitest';

import {
  baselineFromReport,
  compareRequirementEvaluationBaseline,
  V2_2_REQUIREMENT_EVALUATION_BASELINE,
} from './baseline.js';
import { REQUIREMENT_EVALUATION_CORPUS } from './corpus-v0.1.js';
import {
  evaluateRequirementCorpus,
  formatRequirementEvaluationDiagnostics,
  formatRequirementEvaluationReport,
} from './harness.js';
import { validateRequirementCorpus } from './validation.js';

describe('requirement extraction evaluation corpus', () => {
  it('passes independent corpus quality, coverage, safety, and privacy checks', () => {
    expect(validateRequirementCorpus(REQUIREMENT_EVALUATION_CORPUS)).toEqual(
      [],
    );
  });

  it('rejects malformed corpus metadata instead of trusting fixtures implicitly', () => {
    const first = REQUIREMENT_EVALUATION_CORPUS[0]!;
    const consequential = REQUIREMENT_EVALUATION_CORPUS.find(
      (testCase) => testCase.consequential,
    )!;
    const privateCase = {
      ...first,
      id: 'private-marker-probe',
      description: 'Private marker probe',
      input: {
        kind: 'PROVIDER_PAYLOAD' as const,
        provider: 'ashby' as const,
        payload: { title: 'Synthetic role', candidateId: 'private-marker' },
      },
    };
    const unsafeTagCase = {
      ...consequential,
      id: 'missing-safety-tag-probe',
      tags: consequential.tags.filter((tag) => tag !== 'safety'),
    };
    const errors = validateRequirementCorpus([
      ...REQUIREMENT_EVALUATION_CORPUS,
      first,
      privateCase,
      unsafeTagCase,
    ]);

    expect(errors.some((error) => error.includes('duplicate case id'))).toBe(
      true,
    );
    expect(
      errors.some((error) => error.includes('require the safety tag')),
    ).toBe(true);
    expect(
      errors.some((error) => error.includes('private fixture marker')),
    ).toBe(true);
  });

  it('requires all three provider variants in every equivalence group', () => {
    const incomplete = REQUIREMENT_EVALUATION_CORPUS.filter(
      (testCase) => testCase.id !== 'equivalence-required-typescript-ashby',
    );

    expect(
      validateRequirementCorpus(incomplete).some((error) =>
        error.includes(
          'required-typescript: equivalence group must contain Ashby, Lever, and Greenhouse',
        ),
      ),
    ).toBe(true);
  });

  it('records the actual reviewed V2.2 baseline separately from ground truth', () => {
    const report = evaluateRequirementCorpus(REQUIREMENT_EVALUATION_CORPUS);

    expect(baselineFromReport(report)).toEqual(
      V2_2_REQUIREMENT_EVALUATION_BASELINE,
    );
    expect(compareRequirementEvaluationBaseline(report)).toEqual([]);
    expect(report.safety.unsafeHardConstraints).toBe(3);
    expect(report.safety.falseConsequentialExtractions).toBe(4);
    expect(report.failingCaseIds).toContain('residency-requirement');
  });

  it('reports per-category TP, FP, and FN without an aggregate score', () => {
    const report = evaluateRequirementCorpus(REQUIREMENT_EVALUATION_CORPUS);

    expect(report.categoryMetrics.TECHNICAL_SKILL).toMatchObject({
      truePositive: 25,
      falsePositive: 2,
      falseNegative: 1,
    });
    expect(report.categoryMetrics.RESIDENCY).toMatchObject({
      truePositive: 0,
      falsePositive: 0,
      falseNegative: 1,
    });
    expect(report).not.toHaveProperty('accuracy');
    expect(report).not.toHaveProperty('score');
  });

  it('validates provenance, duplicate output, unknown preservation, and provider equivalence', () => {
    const report = evaluateRequirementCorpus(REQUIREMENT_EVALUATION_CORPUS);

    expect(report.provenanceFailures).toBe(0);
    expect(report.duplicateOutputViolations).toBe(0);
    expect(report.alternativeHandlingFailures).toBe(2);
    expect(report.unresolvedBehavior.unknownPreservationFailures).toBe(0);
    expect(report.crossProviderEquivalenceFailures).toBe(0);
  });

  it('is deterministic and exposes machine- and human-readable diagnostics', () => {
    const first = evaluateRequirementCorpus(REQUIREMENT_EVALUATION_CORPUS);
    const second = evaluateRequirementCorpus(REQUIREMENT_EVALUATION_CORPUS);
    const machineReport = JSON.parse(JSON.stringify(first)) as unknown;
    const summary = formatRequirementEvaluationReport(first);
    const diagnostics = formatRequirementEvaluationDiagnostics(first);

    expect(second).toEqual(first);
    expect(machineReport).toEqual(first);
    expect(summary).toContain('TECHNICAL_SKILL: TP 25 · FP 2 · FN 1');
    expect(summary).toContain('Unsafe hard constraints: 3');
    expect(diagnostics).toContain('CASE alternative-certification');
    expect(diagnostics).toContain('EXPECTED:');
    expect(diagnostics).toContain('ACTUAL:');
    expect(diagnostics).toContain('SAFETY VIOLATION:');
  });
});
