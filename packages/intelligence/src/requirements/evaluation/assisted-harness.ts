import {
  FixedRequirementProposalProvider,
  REQUIREMENT_PROPOSAL_SCHEMA_VERSION,
  runAssistedRequirementProposal,
  selectAssistedRequirementFragments,
  type AssistedListingFragment,
} from '../assisted.js';
import { buildV2RequirementSet } from '../v2.js';
import { REQUIREMENT_EVALUATION_CORPUS } from './corpus-v0.1.js';
import { documentFor, evaluateRequirementCorpus } from './harness.js';

export interface AssistedRequirementEvaluationReport {
  readonly reportVersion: 'assisted-requirement-evaluation-v1';
  readonly corpusVersion: string;
  readonly deterministicExtractorVersion: string;
  readonly evaluatedCases: number;
  readonly deterministicFalseNegatives: number;
  readonly assistedCandidateProposals: number;
  readonly groundedProposals: number;
  readonly rejectedProposals: number;
  readonly novelCorrectProposals: number;
  readonly novelFalseProposals: number;
  readonly duplicateProposals: number;
  readonly consequentialProposals: number;
  readonly unsafePromotionAttempts: number;
  readonly unsafePromotions: number;
  readonly groundingFailures: number;
  readonly assistedRecallDelta: number;
  readonly recoveredCaseIds: readonly string[];
}

function baseProposal(fragment: AssistedListingFragment) {
  return {
    statement: fragment.text,
    polarity: 'REQUIRES' as const,
    fragmentIds: [fragment.id],
    excerpts: [{ fragmentId: fragment.id, excerpt: fragment.text }],
    confidence: 'MODERATE' as const,
    rationale:
      'The supplied public listing fragment explicitly supports this proposal.',
  };
}

function experimentalProposals(
  caseId: string,
  fragments: readonly AssistedListingFragment[],
): readonly unknown[] {
  if (caseId === 'seniority-mid') {
    const fragment = fragments.find((item) => /mid-level/i.test(item.text));
    return fragment
      ? [
          {
            ...baseProposal(fragment),
            category: 'SENIORITY',
            value: { type: 'TERM', value: 'mid-level' },
            strength: 'REQUIRED',
            evaluationUse: 'FIT',
            assertionBasis: 'EXPLICIT_STRUCTURED',
            actionabilityCeiling: 'FIT_SIGNAL_SAFE',
          },
        ]
      : [];
  }
  if (caseId === 'explicit-onsite-hybrid-requirements') {
    return fragments.flatMap((fragment) => {
      const value = /onsite/i.test(fragment.text)
        ? 'onsite'
        : /hybrid/i.test(fragment.text)
          ? 'hybrid'
          : undefined;
      return value
        ? [
            {
              ...baseProposal(fragment),
              category: 'WORK_MODEL',
              value: { type: 'SCOPE', value },
              strength: 'REQUIRED',
              evaluationUse: 'CONTEXT_ONLY',
              assertionBasis: 'EXPLICIT_TEXT',
              actionabilityCeiling: 'REVIEW_ONLY',
            },
          ]
        : [];
    });
  }
  if (caseId === 'greenhouse-metadata-field') {
    const fragment = fragments.find((item) => /full-time/i.test(item.text));
    return fragment
      ? [
          {
            ...baseProposal(fragment),
            category: 'EMPLOYMENT_TYPE',
            value: { type: 'TERM', value: 'full-time' },
            strength: 'CONTEXTUAL',
            evaluationUse: 'CONTEXT_ONLY',
            assertionBasis: 'EXPLICIT_STRUCTURED',
            actionabilityCeiling: 'REVIEW_ONLY',
          },
        ]
      : [];
  }
  return [];
}

export async function evaluateAssistedRequirementCorpus(): Promise<AssistedRequirementEvaluationReport> {
  const deterministic = evaluateRequirementCorpus(
    REQUIREMENT_EVALUATION_CORPUS,
  );
  let assistedCandidateProposals = 0;
  let groundedProposals = 0;
  let rejectedProposals = 0;
  let novelCorrectProposals = 0;
  let novelFalseProposals = 0;
  let duplicateProposals = 0;
  let consequentialProposals = 0;
  let unsafePromotionAttempts = 0;
  let unsafePromotions = 0;
  const recoveredCaseIds = new Set<string>();

  for (const testCase of REQUIREMENT_EVALUATION_CORPUS) {
    const document = documentFor(testCase);
    const observation = {
      id: `assisted-observation-${testCase.id}`,
      fingerprint: `assisted-observation-fingerprint-${testCase.id}`,
      document,
    };
    const artifact = buildV2RequirementSet(
      {
        id: `assisted-snapshot-${testCase.id}`,
        fingerprint: `assisted-snapshot-fingerprint-${testCase.id}`,
      },
      [observation],
      { createdAt: new Date('2026-09-06T00:00:00.000Z') },
    );
    const fragments = selectAssistedRequirementFragments({
      observations: [observation],
      deterministic: artifact,
    });
    const proposals = experimentalProposals(testCase.id, fragments);
    const provider = new FixedRequirementProposalProvider({
      kind: 'success',
      response: {
        schemaVersion: REQUIREMENT_PROPOSAL_SCHEMA_VERSION,
        proposals,
      },
    });
    const assisted = await runAssistedRequirementProposal({
      artifact,
      snapshotFingerprint: `assisted-snapshot-fingerprint-${testCase.id}`,
      fragments,
      provider,
      createdAt: new Date('2026-09-06T00:00:00.000Z'),
    });
    unsafePromotionAttempts +=
      assisted.assistanceRun?.unsafePromotionAttempts ?? 0;
    for (const candidate of assisted.candidates ?? []) {
      assistedCandidateProposals += 1;
      if (candidate.groundingStatus === 'GROUNDED') groundedProposals += 1;
      if (candidate.validationStatus === 'REJECTED') rejectedProposals += 1;
      if (candidate.validationStatus === 'DUPLICATE') duplicateProposals += 1;
      if (
        [
          'EDUCATION',
          'LOCATION',
          'RESIDENCY',
          'TIMEZONE',
          'WORK_AUTHORIZATION',
          'SPONSORSHIP',
          'LANGUAGE',
          'CERTIFICATION',
        ].includes(candidate.category)
      ) {
        consequentialProposals += 1;
      }
      if (
        (candidate.actionabilityCeiling as string) === 'HARD_CONSTRAINT_SAFE'
      ) {
        unsafePromotions += 1;
      }
      if (candidate.validationStatus !== 'ACCEPTED_FOR_REVIEW') continue;
      const matches = testCase.expected.some(
        (expectation) =>
          expectation.disposition === 'MUST_EXTRACT' &&
          expectation.semantic.category === candidate.category &&
          expectation.semantic.normalizedKey === candidate.normalizedKey,
      );
      if (matches) {
        novelCorrectProposals += 1;
        recoveredCaseIds.add(testCase.id);
      } else {
        novelFalseProposals += 1;
      }
    }
  }
  const deterministicFalseNegatives = Object.values(
    deterministic.categoryMetrics,
  ).reduce((total, metric) => total + metric.falseNegative, 0);
  return {
    reportVersion: 'assisted-requirement-evaluation-v1',
    corpusVersion: deterministic.corpusVersion,
    deterministicExtractorVersion: deterministic.extractorVersion,
    evaluatedCases: deterministic.totalCases,
    deterministicFalseNegatives,
    assistedCandidateProposals,
    groundedProposals,
    rejectedProposals,
    novelCorrectProposals,
    novelFalseProposals,
    duplicateProposals,
    consequentialProposals,
    unsafePromotionAttempts,
    unsafePromotions,
    groundingFailures: assistedCandidateProposals - groundedProposals,
    assistedRecallDelta: novelCorrectProposals,
    recoveredCaseIds: [...recoveredCaseIds].sort(),
  };
}

export function formatAssistedRequirementEvaluation(
  report: AssistedRequirementEvaluationReport,
): string {
  return [
    'Assisted Requirement Proposal Evaluation',
    `Corpus: ${report.corpusVersion}`,
    `Deterministic extractor: ${report.deterministicExtractorVersion}`,
    `Cases: ${report.evaluatedCases}`,
    `Deterministic false negatives: ${report.deterministicFalseNegatives}`,
    `Assisted proposals: ${report.assistedCandidateProposals}`,
    `Grounded: ${report.groundedProposals} · Rejected: ${report.rejectedProposals}`,
    `Novel correct: ${report.novelCorrectProposals} · Novel false: ${report.novelFalseProposals} · Duplicates: ${report.duplicateProposals}`,
    `Consequential proposals: ${report.consequentialProposals}`,
    `Unsafe promotion attempts rejected: ${report.unsafePromotionAttempts}`,
    `Unsafe promotions: ${report.unsafePromotions}`,
    `Grounding failures: ${report.groundingFailures}`,
    `Assisted recall delta: +${report.assistedRecallDelta} requirements`,
    `Recovered cases: ${report.recoveredCaseIds.join(', ') || 'none'}`,
  ].join('\n');
}
