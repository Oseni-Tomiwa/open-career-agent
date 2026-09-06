import { describe, expect, it } from 'vitest';

import type { EligibilityConstraint } from '../eligibility/extractor.js';
import type { FitRequirement } from '../fit/extractor.js';
import {
  buildV1CompatibilityRequirementSet,
  mapV1EligibilityConstraint,
  mapV1FitRequirement,
} from './compatibility.js';

const createdAt = new Date('2026-09-06T00:00:00.000Z');

describe('V1 Requirement Set compatibility mapping', () => {
  it('persists exactly the requirements V1 already extracts', () => {
    const artifact = buildV1CompatibilityRequirementSet(
      {
        id: 'snap-compat',
        title: 'Backend Engineer',
        content:
          'Required experience with TypeScript. We value collaborative writing.',
        fingerprint: 'snapshot-hash',
      },
      [{ id: 'so-compat', fingerprint: 'observation-hash' }],
      { createdAt },
    );

    expect(artifact.requirements).toHaveLength(1);
    expect(artifact.requirements[0]?.requirement).toMatchObject({
      category: 'TECHNICAL_SKILL',
      strength: 'REQUIRED',
      assertionBasis: 'EXPLICIT_TEXT',
      actionability: 'FIT_SIGNAL_SAFE',
    });
    expect(artifact.requirements[0]?.provenance[0]).toMatchObject({
      sourceObservationId: 'so-compat',
      snapshotId: 'snap-compat',
      normalizedSection: 'content',
      excerpt: 'Required experience with TypeScript.',
    });
  });

  it.each([
    ['mandatory', 'REQUIRED', 'HARD_CONSTRAINT_SAFE'],
    ['preferred', 'PREFERRED', 'REVIEW_ONLY'],
    ['ambiguous', 'CONTEXTUAL', 'REVIEW_ONLY'],
  ] as const)(
    'maps Eligibility %s without changing its modality meaning',
    (modality, strength, actionability) => {
      const constraint: EligibilityConstraint = {
        dimension: 'location',
        requirement: 'Synthetic location requirement',
        modality,
        scope: 'synthetic-scope',
        sourceText: 'Synthetic location requirement',
        extractionMethod: 'structured_field',
      };
      expect(
        mapV1EligibilityConstraint({
          constraint,
          requirementSetId: 'rqs-modalities',
          createdAt,
        }),
      ).toMatchObject({ strength, actionability });
    },
  );

  it.each([
    ['required', 'REQUIRED', 'FIT_SIGNAL_SAFE'],
    ['preferred', 'PREFERRED', 'FIT_SIGNAL_SAFE'],
    ['optional', 'CONTEXTUAL', 'REVIEW_ONLY'],
  ] as const)(
    'maps Fit %s without changing its modality meaning',
    (modality, strength, actionability) => {
      const requirement: FitRequirement = {
        id: `fit-${modality}`,
        dimension: 'technical_skill',
        normalizedValue: 'synthetic-skill',
        label: 'Synthetic skill',
        modality,
        sourceText: 'Synthetic skill statement',
        sourceReference: 'snapshot:synthetic',
        extractionConfidence: 'high',
      };
      expect(
        mapV1FitRequirement({
          requirement,
          requirementSetId: 'rqs-modalities',
          createdAt,
        }),
      ).toMatchObject({ strength, actionability });
    },
  );

  it('does not expand extraction for technical mentions without V1 cues', () => {
    const artifact = buildV1CompatibilityRequirementSet(
      {
        id: 'snap-no-expansion',
        title: 'Software Engineer',
        content: 'Our stack includes TypeScript, React, and PostgreSQL.',
        fingerprint: 'snapshot-no-expansion',
      },
      [{ id: 'so-no-expansion', fingerprint: 'observation-no-expansion' }],
      { createdAt },
    );
    expect(artifact.requirements).toHaveLength(0);
  });

  it('does not include candidate identity in set identity or content', () => {
    const build = () =>
      buildV1CompatibilityRequirementSet(
        {
          id: 'snap-independent',
          title: 'Engineer',
          content: 'TypeScript required.',
          fingerprint: 'snapshot-independent',
        },
        [{ id: 'so-independent', fingerprint: 'observation-independent' }],
        { createdAt },
      );
    expect(build()).toEqual(build());
    expect(build().set).not.toHaveProperty('candidateId');
    expect(build().requirements[0]?.requirement).not.toHaveProperty(
      'candidateId',
    );
  });
});
