import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';

import { RequirementSetArtifactSchema } from './requirements.js';

function validArtifact() {
  return {
    set: {
      id: 'rqs_valid',
      snapshotId: 'snap_valid',
      modelVersion: 'requirement-set-v1',
      inputFingerprint: 'input-hash',
      extractorPipelineVersion: 'requirements-v2.1-v1-compat',
      deterministicExtractorVersion: 'eligibility-v1+fit-v1.3',
      status: 'COMPLETE',
      deterministicStatus: 'SUCCEEDED',
      assistedStatus: 'NOT_REQUESTED',
      createdAt: '2026-09-06T00:00:00.000Z',
    },
    requirements: [
      {
        requirement: {
          id: 'req_valid',
          requirementSetId: 'rqs_valid',
          category: 'TECHNICAL_SKILL',
          normalizedKey: 'programming_language:typescript',
          value: { type: 'TERM', value: 'typescript' },
          statement: 'TypeScript is required.',
          strength: 'REQUIRED',
          polarity: 'REQUIRES',
          assertionBasis: 'EXPLICIT_TEXT',
          evaluationUse: 'FIT',
          actionability: 'FIT_SIGNAL_SAFE',
          extractionConfidence: 'HIGH',
          extractorId: 'fit-v1',
          extractorVersion: 'fit-v1.3',
          canonicalHash: 'requirement-hash',
          createdAt: '2026-09-06T00:00:00.000Z',
        },
        provenance: [
          {
            id: 'rqp_valid',
            requirementId: 'req_valid',
            sourceObservationId: 'so_valid',
            snapshotId: 'snap_valid',
            normalizedSection: 'content',
            excerpt: 'TypeScript is required.',
            excerptHash: 'excerpt-hash',
            locatorVersion: 'normalized-v1',
            extractorId: 'fit-v1',
            extractorVersion: 'fit-v1.3',
          },
        ],
      },
    ],
  };
}

describe('Requirement Set schemas', () => {
  it('accepts a complete candidate-independent artifact with provenance', () => {
    expect(Value.Check(RequirementSetArtifactSchema, validArtifact())).toBe(
      true,
    );
  });

  it('rejects interpreted or non-required hard constraints', () => {
    const artifact = validArtifact();
    const item = artifact.requirements[0];
    if (!item) throw new Error('Expected synthetic requirement');
    item.requirement = {
      ...item.requirement,
      evaluationUse: 'ELIGIBILITY',
      actionability: 'HARD_CONSTRAINT_SAFE',
      assertionBasis: 'INTERPRETED',
    };
    expect(Value.Check(RequirementSetArtifactSchema, artifact)).toBe(false);
  });

  it('rejects an accepted requirement without provenance', () => {
    const artifact = validArtifact();
    artifact.requirements[0]!.provenance = [];
    expect(Value.Check(RequirementSetArtifactSchema, artifact)).toBe(false);
  });

  it('requires source offsets to be supplied as a complete pair', () => {
    const artifact = validArtifact();
    const provenance = artifact.requirements[0]!
      .provenance[0]! as unknown as Record<string, unknown>;
    provenance.startOffset = 0;
    expect(Value.Check(RequirementSetArtifactSchema, artifact)).toBe(false);
  });

  it('rejects candidate identity or candidate evidence fields', () => {
    const artifact = {
      ...validArtifact(),
      candidateId: 'candidate-must-not-enter-requirement-set',
    };
    expect(Value.Check(RequirementSetArtifactSchema, artifact)).toBe(false);
  });
});
