import { describe, expect, it } from 'vitest';

import { evaluateAssistedRequirementCorpus } from './assisted-harness.js';

describe('assisted requirement proposal evaluation', () => {
  it('reports assisted proposals separately without unsafe promotion', async () => {
    const report = await evaluateAssistedRequirementCorpus();

    expect(report).toMatchObject({
      evaluatedCases: 50,
      deterministicFalseNegatives: 4,
      assistedCandidateProposals: 4,
      groundedProposals: 4,
      rejectedProposals: 0,
      novelCorrectProposals: 4,
      novelFalseProposals: 0,
      duplicateProposals: 0,
      consequentialProposals: 0,
      unsafePromotionAttempts: 0,
      unsafePromotions: 0,
      groundingFailures: 0,
      assistedRecallDelta: 4,
    });
    expect(report.recoveredCaseIds).toEqual([
      'explicit-onsite-hybrid-requirements',
      'greenhouse-metadata-field',
      'seniority-mid',
    ]);
  });
});
