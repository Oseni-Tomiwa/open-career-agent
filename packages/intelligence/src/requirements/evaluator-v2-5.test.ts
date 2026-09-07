import {
  requirementId,
  requirementProvenanceId,
  requirementSetId,
  snapshotId,
  sourceObservationId,
  type CanonicalRequirement,
  type CompleteRequirementSet,
  type RequirementCategory,
  type RequirementValue,
} from '@oca/domain';
import { describe, expect, it } from 'vitest';

import { DecisionEngine } from '../decision/engine.js';
import { EligibilityEngine } from '../eligibility/engine.js';
import {
  CANONICAL_FIT_ENGINE_VERSION,
  evaluateFitRequirements,
} from '../fit/engine.js';
import {
  CANONICAL_ELIGIBILITY_ENGINE_VERSION,
  canonicalEligibilityConstraints,
  canonicalFitRequirements,
} from './evaluator-v2-5.js';

const createdAt = new Date('2026-01-01T00:00:00.000Z');

function artifact(
  requirements: readonly {
    category: RequirementCategory;
    value: RequirementValue;
    evaluationUse: 'ELIGIBILITY' | 'FIT' | 'CONTEXT_ONLY';
    actionability: 'HARD_CONSTRAINT_SAFE' | 'FIT_SIGNAL_SAFE' | 'REVIEW_ONLY';
    strength?: 'REQUIRED' | 'PREFERRED' | 'CONTEXTUAL';
    polarity?: 'REQUIRES' | 'PERMITS' | 'EXCLUDES' | 'UNAVAILABLE';
    statement?: string;
  }[],
  options: { candidates?: readonly never[]; fingerprint?: string } = {},
): CompleteRequirementSet {
  const setId = requirementSetId(`rqs-${options.fingerprint ?? 'one'}`);
  return {
    set: {
      id: setId,
      snapshotId: snapshotId('snapshot-v2-5'),
      modelVersion: 'requirement-set-v1',
      inputFingerprint: options.fingerprint ?? 'requirements-one',
      extractorPipelineVersion: 'requirements-v2.2-rich-document',
      deterministicExtractorVersion: 'requirements-deterministic-v2.3.1',
      status: 'COMPLETE',
      deterministicStatus: 'SUCCEEDED',
      assistedStatus: 'NOT_REQUESTED',
      createdAt,
    },
    requirements: requirements.map((input, index) => {
      const id = requirementId(`req-${index}`);
      const statement = input.statement ?? `Required ${input.category}`;
      const requirement: CanonicalRequirement = {
        id,
        requirementSetId: setId,
        category: input.category,
        normalizedKey: `${input.category.toLowerCase()}:${index}`,
        value: input.value,
        statement,
        strength: input.strength ?? 'REQUIRED',
        polarity: input.polarity ?? 'REQUIRES',
        assertionBasis: 'EXPLICIT_TEXT',
        evaluationUse: input.evaluationUse,
        actionability: input.actionability,
        extractionConfidence: 'HIGH',
        extractorId: 'synthetic-v2-5',
        extractorVersion: '1',
        canonicalHash: `hash-${index}`,
        createdAt,
      };
      return {
        requirement,
        provenance: [
          {
            id: requirementProvenanceId(`rqp-${index}`),
            requirementId: id,
            sourceObservationId: sourceObservationId('observation-v2-5'),
            snapshotId: snapshotId('snapshot-v2-5'),
            sourceFieldPath: '$.requirements',
            normalizedSection: 'requirements',
            normalizedFragmentId: `fragment-${index}`,
            excerpt: statement,
            excerptHash: `excerpt-${index}`,
            locatorVersion: 'listing-fragment-v2.2',
            extractorId: 'synthetic-v2-5',
            extractorVersion: '1',
          },
        ],
      };
    }),
    ...(options.candidates ? { candidates: options.candidates } : {}),
  };
}

const technical = (strength: 'REQUIRED' | 'PREFERRED' = 'REQUIRED') => ({
  category: 'TECHNICAL_SKILL' as const,
  value: { type: 'TERM' as const, value: 'typescript' },
  evaluationUse: 'FIT' as const,
  actionability: 'FIT_SIGNAL_SAFE' as const,
  strength,
  statement: `${strength === 'PREFERRED' ? 'TypeScript preferred' : 'TypeScript required'}`,
});

function evaluateFit(
  set: CompleteRequirementSet,
  claims: Parameters<typeof evaluateFitRequirements>[1],
) {
  return evaluateFitRequirements(
    canonicalFitRequirements(set),
    claims,
    CANONICAL_FIT_ENGINE_VERSION,
  );
}

describe('V2.5 synthetic evaluator acceptance matrix', () => {
  it('A/L assesses one required technical requirement with supported evidence', () => {
    const result = evaluateFit(artifact([technical()]), [
      { kind: 'skill', value: 'TypeScript', state: 'SUPPORTED' },
    ]);
    expect(result).toMatchObject({
      assessmentStatus: 'ASSESSED',
      overallLevel: 'strong',
    });
    expect(result.findings[0]).toMatchObject({
      requirementId: 'req-0',
      state: 'STRONG_MATCH',
    });
  });

  it('B preserves no evidence without calling it a mismatch', () => {
    const result = evaluateFit(artifact([technical()]), []);
    expect(result).toMatchObject({
      assessmentStatus: 'INSUFFICIENT_CANDIDATE_EVIDENCE',
      overallLevel: null,
    });
    expect(result.findings[0]?.state).toBe('NO_EVIDENCE');
    expect(result.findings[0]?.explanation).toContain('not evidence');
  });

  it('C assesses a supported preferred requirement without treating it as required', () => {
    const result = evaluateFit(artifact([technical('PREFERRED')]), [
      { kind: 'skill', value: 'TypeScript', state: 'SUPPORTED' },
    ]);
    expect(result).toMatchObject({
      assessmentStatus: 'ASSESSED',
      overallLevel: 'moderate',
    });
    expect(result.findings[0]?.modality).toBe('preferred');
  });

  it('D/E/F evaluates an explicit work-authorization gate against supported, conflicting, and unknown candidate facts', () => {
    const set = artifact([
      {
        category: 'WORK_AUTHORIZATION',
        value: { type: 'SCOPE', value: 'us' },
        evaluationUse: 'ELIGIBILITY',
        actionability: 'HARD_CONSTRAINT_SAFE',
        statement: 'Must be authorized to work in the US',
      },
    ]);
    const constraints = canonicalEligibilityConstraints(set);
    const engine = new EligibilityEngine();
    const evaluate = (state: string) =>
      engine.evaluateConstraints(
        constraints,
        [{ kind: 'work_authorization', value: 'us', scope: 'us', state }],
        CANONICAL_ELIGIBILITY_ENGINE_VERSION,
      );
    expect(evaluate('supported').overallState).toBe('eligible');
    expect(evaluate('conflict').overallState).toBe('ineligible');
    expect(evaluate('unknown').overallState).toBe('investigate');
    expect(evaluate('supported').findings[0]?.canonicalRequirementId).toBe(
      'req-0',
    );
  });

  it('G keeps sponsorship silence unresolved when the candidate needs sponsorship', () => {
    const result = new EligibilityEngine().evaluateConstraints(
      canonicalEligibilityConstraints(artifact([])),
      [
        {
          kind: 'sponsorship',
          value: 'requires_sponsorship',
          state: 'supported',
        },
      ],
      CANONICAL_ELIGIBILITY_ENGINE_VERSION,
    );
    expect(result).toMatchObject({ overallState: 'investigate' });
    expect(result.findings[0]?.summary).toContain('policy is unknown');
  });

  it('H does not turn Global Remote context into an Eligibility gate', () => {
    const set = artifact([
      {
        category: 'LOCATION',
        value: { type: 'SCOPE', value: 'global' },
        evaluationUse: 'CONTEXT_ONLY',
        actionability: 'REVIEW_ONLY',
        strength: 'CONTEXTUAL',
        polarity: 'PERMITS',
        statement: 'Global Remote',
      },
    ]);
    expect(canonicalEligibilityConstraints(set)).toHaveLength(0);
  });

  it('I/J/K excludes contradictory, context-only, and non-evaluable listing content from Fit sufficiency', () => {
    const set = artifact(
      [
        {
          ...technical(),
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
          strength: 'CONTEXTUAL',
        },
      ],
      { candidates: [{} as never] },
    );
    expect(evaluateFit(set, [])).toMatchObject({
      assessmentStatus: 'INSUFFICIENT_LISTING_REQUIREMENTS',
      overallLevel: null,
    });
  });

  it('M evaluates multiple requirements with mixed supported and partial evidence', () => {
    const result = evaluateFit(
      artifact([
        technical(),
        {
          category: 'EXPERIENCE',
          value: { type: 'DURATION', minimumYears: 5 },
          evaluationUse: 'FIT',
          actionability: 'FIT_SIGNAL_SAFE',
          statement: 'At least 5 years of experience required',
        },
      ]),
      [
        { kind: 'skill', value: 'TypeScript', state: 'SUPPORTED' },
        { kind: 'experience', value: '3 years', state: 'SUPPORTED' },
      ],
    );
    expect(result).toMatchObject({
      assessmentStatus: 'ASSESSED',
      overallLevel: 'moderate',
    });
    expect(result.findings.map((finding) => finding.state)).toEqual([
      'STRONG_MATCH',
      'PARTIAL',
    ]);
  });

  it('N preserves Requirement Set identity as an explicit versioned input', () => {
    const first = artifact([technical()], { fingerprint: 'requirements-one' });
    const second = artifact([technical()], { fingerprint: 'requirements-two' });
    expect(first.set.inputFingerprint).not.toBe(second.set.inputFingerprint);
    expect(canonicalFitRequirements(first)[0]?.canonicalRequirementId).toBe(
      'req-0',
    );
  });

  it('Q/R never evaluates RequirementCandidates, including consequential attempts', () => {
    const set = artifact([], { candidates: [{} as never] });
    expect(canonicalFitRequirements(set)).toHaveLength(0);
    expect(canonicalEligibilityConstraints(set)).toHaveLength(0);
  });

  it('S sends insufficient listing requirements to Investigate rather than Low Priority', () => {
    const result = new DecisionEngine().evaluate({
      eligibility: { state: 'eligible' },
      fit: {
        assessmentStatus: 'INSUFFICIENT_LISTING_REQUIREMENTS',
        level: null,
      },
      quality: { level: 'strong' },
      evaluatedAt: createdAt,
    });
    expect(result).toMatchObject({
      state: 'investigate',
      action: 'review',
      reasonCodes: ['FIT_REQUIREMENTS_INSUFFICIENT'],
    });
  });
});
