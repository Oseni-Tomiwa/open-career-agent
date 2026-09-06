import { describe, expect, it } from 'vitest';

import {
  AshbyNormalizer,
  GreenhouseNormalizer,
  LeverNormalizer,
  type NormalizedListingDocument,
  type OpportunityNormalizer,
  type SourceOpportunity,
} from '@oca/sources';

import { buildV2RequirementSet } from './v2.js';

const createdAt = new Date('2026-09-06T00:00:00.000Z');

function documentFor(
  sourceSystem: string,
  payload: Record<string, unknown>,
  normalizer: OpportunityNormalizer,
): NormalizedListingDocument {
  const record: SourceOpportunity = {
    sourceSystem,
    sourceExternalId: `${sourceSystem}-fixture`,
    sourceUrl: `https://example.test/${sourceSystem}/fixture`,
    observedAt: createdAt,
    rawPayload: JSON.stringify(payload),
  };
  return normalizer.normalize(record).document;
}

function extract(document: NormalizedListingDocument) {
  return buildV2RequirementSet(
    { id: 'snap-v2-fixture', fingerprint: 'snapshot-v2-fixture' },
    [{ id: 'observation-v2-fixture', fingerprint: 'obs-v2', document }],
    { createdAt },
  );
}

function leverDocument(overrides: Record<string, unknown> = {}) {
  return documentFor(
    'lever',
    {
      text: 'Backend Engineer',
      _siteId: 'synthetic-company',
      descriptionPlain: 'A legacy summary without requirement cues.',
      ...overrides,
    },
    new LeverNormalizer(),
  );
}

describe('V2.3.1 deterministic requirement extraction', () => {
  it('fixes the Metabase-like Lever structured-list failure with exact provenance', () => {
    const artifact = extract(
      leverDocument({
        openingPlain: 'Our company uses Kubernetes to run its services.',
        lists: [
          {
            text: 'Requirements',
            content:
              '<ul><li>3–5 years of TypeScript experience</li><li>PostgreSQL</li></ul>',
          },
          {
            text: 'Nice to have',
            content: '<ul><li>React experience is a plus</li></ul>',
          },
        ],
      }),
    );

    expect(artifact.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirement: expect.objectContaining({
            normalizedKey: 'technical:typescript',
            strength: 'REQUIRED',
          }),
          provenance: [
            expect.objectContaining({
              sourceFieldPath: '$.lists[0].content',
              normalizedSection: 'requirements',
              excerpt: '3–5 years of TypeScript experience',
              normalizedFragmentId: expect.stringMatching(/^fragment_/),
            }),
          ],
        }),
        expect.objectContaining({
          requirement: expect.objectContaining({
            normalizedKey: 'experience:3:typescript',
            value: expect.objectContaining({ minimumYears: 3 }),
          }),
        }),
        expect.objectContaining({
          requirement: expect.objectContaining({
            normalizedKey: 'technical:react',
            strength: 'PREFERRED',
          }),
        }),
      ]),
    );
    expect(artifact.set.deterministicExtractorVersion).toBe(
      'requirements-deterministic-v2.3.1',
    );
    expect(
      artifact.requirements.every(
        (item) =>
          item.requirement.extractorVersion ===
            artifact.set.deterministicExtractorVersion &&
          item.provenance.every(
            (provenance) =>
              provenance.extractorVersion ===
              artifact.set.deterministicExtractorVersion,
          ),
      ),
    ).toBe(true);
    expect(
      artifact.requirements.some(
        (item) => item.requirement.normalizedKey === 'technical:kubernetes',
      ),
    ).toBe(false);
  });

  it('preserves technology alternatives as one disjunctive requirement', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content: '<ul><li>AWS, GCP, or Azure</li></ul>',
          },
        ],
      }),
    );
    const requirement = artifact.requirements.find(
      (item) => item.requirement.category === 'TECHNICAL_SKILL',
    )?.requirement;
    expect(requirement?.value).toEqual({
      type: 'TERM',
      value: 'aws',
      alternatives: ['aws', 'azure', 'gcp'],
    });
    expect(
      artifact.requirements.filter(
        (item) => item.requirement.category === 'TECHNICAL_SKILL',
      ),
    ).toHaveLength(1);
  });

  it('does not turn negated skills or company-context skills into requirements', () => {
    const artifact = extract(
      leverDocument({
        openingPlain: 'Our platform is built with Kubernetes.',
        lists: [
          {
            text: 'Requirements',
            content: '<ul><li>We do not require React experience</li></ul>',
          },
        ],
      }),
    );
    expect(
      artifact.requirements.filter(
        (item) => item.requirement.category === 'TECHNICAL_SKILL',
      ),
    ).toHaveLength(0);
  });

  it('does not leak a requirement cue across unrelated prose sentences', () => {
    const artifact = extract(
      leverDocument({
        descriptionPlain:
          'We require careful written communication. Our internal stack uses Kubernetes and Redis.',
      }),
    );
    expect(
      artifact.requirements.filter(
        (item) => item.requirement.category === 'TECHNICAL_SKILL',
      ),
    ).toHaveLength(0);
  });

  it('extracts explicit consequential requirements conservatively', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content: `<ul>
              <li>Must be based in Germany or the Netherlands.</li>
              <li>Must overlap UTC+1 to UTC+3.</li>
              <li>Must be legally authorized to work in Germany.</li>
              <li>English fluency is required.</li>
              <li>CISSP certification required.</li>
              <li>We cannot sponsor visas.</li>
            </ul>`,
          },
        ],
      }),
    );
    for (const category of [
      'LOCATION',
      'TIMEZONE',
      'WORK_AUTHORIZATION',
      'LANGUAGE',
      'CERTIFICATION',
      'SPONSORSHIP',
    ] as const) {
      expect(
        artifact.requirements.find(
          (item) => item.requirement.category === category,
        )?.requirement,
      ).toMatchObject({
        strength: 'REQUIRED',
        evaluationUse: 'ELIGIBILITY',
        actionability: 'HARD_CONSTRAINT_SAFE',
      });
    }
  });

  it('keeps Global Remote and sponsorship availability contextual', () => {
    const artifact = extract(
      leverDocument({
        country: 'Global Remote',
        workplaceType: 'remote',
        lists: [
          {
            text: 'Additional information',
            content: '<p>Visa sponsorship is available.</p>',
          },
        ],
      }),
    );
    expect(
      artifact.requirements.find(
        (item) => item.requirement.category === 'LOCATION',
      )?.requirement,
    ).toMatchObject({
      strength: 'CONTEXTUAL',
      polarity: 'PERMITS',
      actionability: 'REVIEW_ONLY',
    });
    expect(
      artifact.requirements.find(
        (item) => item.requirement.category === 'SPONSORSHIP',
      )?.requirement,
    ).toMatchObject({
      polarity: 'PERMITS',
      actionability: 'REVIEW_ONLY',
    });
  });

  it('represents degree negation and equivalent-experience wording without a hard gate', () => {
    const negated = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content: '<ul><li>No degree required.</li></ul>',
          },
        ],
      }),
    );
    expect(
      negated.requirements.find(
        (item) => item.requirement.category === 'EDUCATION',
      )?.requirement,
    ).toMatchObject({
      polarity: 'PERMITS',
      strength: 'CONTEXTUAL',
      actionability: 'REVIEW_ONLY',
    });

    const alternative = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content:
              '<ul><li>Bachelor degree or equivalent practical experience.</li></ul>',
          },
        ],
      }),
    );
    expect(
      alternative.requirements.find(
        (item) => item.requirement.category === 'EDUCATION',
      )?.requirement,
    ).toMatchObject({
      normalizedKey: 'education:bachelor',
      strength: 'CONTEXTUAL',
      actionability: 'REVIEW_ONLY',
    });
  });

  it('keeps years-or-equivalent experience review-only', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content:
              '<ul><li>3 years experience or equivalent practical experience.</li></ul>',
          },
        ],
      }),
    );

    expect(
      artifact.requirements.find(
        (item) => item.requirement.category === 'EXPERIENCE',
      )?.requirement,
    ).toMatchObject({
      strength: 'CONTEXTUAL',
      evaluationUse: 'CONTEXT_ONLY',
      actionability: 'REVIEW_ONLY',
    });
  });

  it('distinguishes residency from a hard location restriction', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content: '<ul><li>Candidates must reside in Germany.</li></ul>',
          },
        ],
      }),
    );

    expect(
      artifact.requirements.find(
        (item) => item.requirement.category === 'RESIDENCY',
      )?.requirement,
    ).toMatchObject({
      normalizedKey: 'residency:germany',
      actionability: 'HARD_CONSTRAINT_SAFE',
    });
    expect(
      artifact.requirements.some(
        (item) => item.requirement.category === 'LOCATION',
      ),
    ).toBe(false);
  });

  it('keeps certification alternatives review-only instead of requiring one branch', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content: '<ul><li>PMP or CISSP certification required.</li></ul>',
          },
        ],
      }),
    );
    const certification = artifact.requirements.find(
      (item) => item.requirement.category === 'CERTIFICATION',
    )?.requirement;

    expect(certification).toMatchObject({
      strength: 'CONTEXTUAL',
      actionability: 'REVIEW_ONLY',
      value: { alternatives: ['cissp', 'pmp'] },
    });
    expect(
      artifact.requirements.some(
        (item) =>
          item.requirement.category === 'CERTIFICATION' &&
          item.requirement.actionability === 'HARD_CONSTRAINT_SAFE',
      ),
    ).toBe(false);
  });

  it('does not extract a positive certification from negated language', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content: `<ul><li>We don't require CISSP certification.</li></ul>`,
          },
        ],
      }),
    );

    expect(
      artifact.requirements.some(
        (item) => item.requirement.category === 'CERTIFICATION',
      ),
    ).toBe(false);
  });

  it('keeps mixed AND/OR technology wording review-only', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content: '<ul><li>React and Vue or Angular.</li></ul>',
          },
        ],
      }),
    );

    expect(
      artifact.requirements.find(
        (item) => item.requirement.category === 'TECHNICAL_SKILL',
      )?.requirement,
    ).toMatchObject({
      normalizedKey: 'technical:angular|react|vue',
      strength: 'CONTEXTUAL',
      actionability: 'REVIEW_ONLY',
    });
  });

  it('neutralizes a required/not-required skill contradiction and retains both sources', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content:
              '<ul><li>TypeScript is required.</li><li>TypeScript is not required.</li></ul>',
          },
        ],
      }),
    );
    const typescript = artifact.requirements.find(
      (item) => item.requirement.normalizedKey === 'technical:typescript',
    );

    expect(typescript?.requirement).toMatchObject({
      strength: 'CONTEXTUAL',
      actionability: 'REVIEW_ONLY',
    });
    expect(typescript?.provenance).toHaveLength(2);
  });

  it('does not neutralize unrelated preferred education during a degree contradiction', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content:
              '<ul><li>Bachelor degree required.</li><li>No degree required.</li></ul>',
          },
          {
            text: 'Preferred qualifications',
            content: '<ul><li>Master degree preferred.</li></ul>',
          },
        ],
      }),
    );
    const education = artifact.requirements.filter(
      (item) => item.requirement.category === 'EDUCATION',
    );

    expect(
      education.find(
        (item) => item.requirement.normalizedKey === 'education:bachelor',
      )?.requirement,
    ).toMatchObject({ strength: 'CONTEXTUAL', actionability: 'REVIEW_ONLY' });
    expect(
      education.find(
        (item) => item.requirement.normalizedKey === 'education:master',
      )?.requirement,
    ).toMatchObject({ strength: 'PREFERRED' });
  });

  it('scopes negation by sentence without suppressing a positive skill', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content:
              '<ul><li>No Kubernetes experience is required. Strong TypeScript experience is required.</li></ul>',
          },
        ],
      }),
    );

    expect(
      artifact.requirements.find(
        (item) => item.requirement.normalizedKey === 'technical:typescript',
      )?.requirement,
    ).toMatchObject({ strength: 'REQUIRED', actionability: 'FIT_SIGNAL_SAFE' });
    expect(
      artifact.requirements.some(
        (item) => item.requirement.normalizedKey === 'technical:kubernetes',
      ),
    ).toBe(false);
  });

  it('uses the final safety boundary for unresolved location exclusions', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content:
              '<ul><li>Remote anywhere except Germany or the Netherlands.</li></ul>',
          },
        ],
      }),
    );

    expect(
      artifact.requirements.find(
        (item) => item.requirement.category === 'LOCATION',
      )?.requirement,
    ).toMatchObject({
      strength: 'CONTEXTUAL',
      evaluationUse: 'CONTEXT_ONLY',
      actionability: 'REVIEW_ONLY',
    });
  });

  it('downgrades contradictory consequential statements from hard actionability', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content:
              '<ul><li>We cannot sponsor visas.</li><li>Visa sponsorship is available.</li></ul>',
          },
        ],
      }),
    );
    const sponsorship = artifact.requirements.filter(
      (item) => item.requirement.category === 'SPONSORSHIP',
    );
    expect(sponsorship).toHaveLength(2);
    expect(
      sponsorship.every(
        (item) =>
          item.requirement.strength === 'CONTEXTUAL' &&
          item.requirement.actionability === 'REVIEW_ONLY',
      ),
    ).toBe(true);
  });

  it('treats tentative sponsorship availability as a material contradiction', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content:
              '<ul><li>We cannot sponsor visas.</li><li>We may sponsor in exceptional cases.</li></ul>',
          },
        ],
      }),
    );
    const sponsorship = artifact.requirements.find(
      (item) => item.requirement.category === 'SPONSORSHIP',
    );

    expect(sponsorship?.requirement).toMatchObject({
      strength: 'CONTEXTUAL',
      evaluationUse: 'CONTEXT_ONLY',
      actionability: 'REVIEW_ONLY',
    });
    expect(sponsorship?.provenance).toHaveLength(2);
  });

  it('persists employment and compensation as context, not Fit or Eligibility', () => {
    const artifact = extract(
      leverDocument({
        categories: { commitment: 'Full-time' },
        salaryRange: {
          min: 120000,
          max: 150000,
          currency: 'USD',
          interval: 'year',
        },
      }),
    );
    expect(
      artifact.requirements.find(
        (item) => item.requirement.category === 'EMPLOYMENT_TYPE',
      )?.requirement,
    ).toMatchObject({ evaluationUse: 'CONTEXT_ONLY' });
    expect(
      artifact.requirements.find(
        (item) => item.requirement.category === 'COMPENSATION',
      )?.requirement,
    ).toMatchObject({ evaluationUse: 'CONTEXT_ONLY' });
  });

  it('leaves sponsorship silent when the listing is silent', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          { text: 'Requirements', content: '<ul><li>TypeScript</li></ul>' },
        ],
      }),
    );
    expect(
      artifact.requirements.some(
        (item) => item.requirement.category === 'SPONSORSHIP',
      ),
    ).toBe(false);
  });

  it('extracts prose requirements and domain experience without needing a structured list', () => {
    const artifact = extract(
      leverDocument({
        descriptionPlain:
          'You have at least 4 years of Python experience and required payments experience.',
      }),
    );
    expect(
      artifact.requirements.find(
        (item) => item.requirement.normalizedKey === 'technical:python',
      )?.requirement.strength,
    ).toBe('REQUIRED');
    expect(
      artifact.requirements.find(
        (item) => item.requirement.category === 'EXPERIENCE',
      )?.requirement.value,
    ).toMatchObject({ minimumYears: 4, focus: 'python' });
    expect(
      artifact.requirements.find(
        (item) => item.requirement.category === 'DOMAIN_EXPERIENCE',
      )?.requirement,
    ).toMatchObject({ strength: 'REQUIRED' });
  });

  it('distinguishes required and preferred degrees', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content: '<ul><li>Bachelor degree required.</li></ul>',
          },
          {
            text: 'Preferred qualifications',
            content: '<ul><li>Master degree.</li></ul>',
          },
        ],
      }),
    );
    const education = artifact.requirements
      .filter((item) => item.requirement.category === 'EDUCATION')
      .map((item) => item.requirement.strength)
      .sort();
    expect(education).toEqual(['PREFERRED', 'REQUIRED']);
  });

  it('preserves explicit remote exclusions without turning broad remote labels into gates', () => {
    const artifact = extract(
      leverDocument({
        lists: [
          {
            text: 'Requirements',
            content: '<ul><li>Remote anywhere except Germany.</li></ul>',
          },
        ],
      }),
    );
    expect(
      artifact.requirements.find(
        (item) => item.requirement.category === 'LOCATION',
      )?.requirement,
    ).toMatchObject({
      polarity: 'EXCLUDES',
      actionability: 'HARD_CONSTRAINT_SAFE',
    });
  });
});

describe('V2.3.1 cross-provider consistency and deduplication', () => {
  it('converges equivalent Ashby, Lever, and Greenhouse requirements', () => {
    const documents = [
      documentFor(
        'ashby',
        {
          title: 'Engineer',
          _boardId: 'synthetic-company',
          descriptionHtml:
            '<h3>Requirements</h3><ul><li>3+ years of TypeScript experience</li></ul>',
        },
        new AshbyNormalizer(),
      ),
      leverDocument({
        lists: [
          {
            text: 'Minimum qualifications',
            content: '<ul><li>3+ years of TypeScript experience</li></ul>',
          },
        ],
      }),
      documentFor(
        'greenhouse',
        {
          title: 'Engineer',
          company_name: 'Synthetic Company',
          content:
            '<h3>Minimum qualifications</h3><ul><li>3+ years of TypeScript experience</li></ul>',
        },
        new GreenhouseNormalizer(),
      ),
    ];
    const outputs = documents.map((document) => extract(document));
    const semanticHashes = outputs.map((artifact) =>
      artifact.requirements
        .filter((item) =>
          ['TECHNICAL_SKILL', 'EXPERIENCE'].includes(item.requirement.category),
        )
        .map((item) => item.requirement.canonicalHash)
        .sort(),
    );
    expect(semanticHashes[1]).toEqual(semanticHashes[0]);
    expect(semanticHashes[2]).toEqual(semanticHashes[0]);
  });

  it('merges duplicate semantic requirements while preserving independent provenance', () => {
    const document = leverDocument({
      lists: [
        {
          text: 'Requirements',
          content:
            '<ul><li>TypeScript experience required.</li><li>TypeScript experience required for production services.</li></ul>',
        },
      ],
    });
    const artifact = extract(document);
    const typescript = artifact.requirements.filter(
      (item) => item.requirement.normalizedKey === 'technical:typescript',
    );
    expect(typescript).toHaveLength(1);
    expect(typescript[0]?.provenance).toHaveLength(2);
  });

  it('bounds linked observations deterministically and reports partial output', () => {
    const document = leverDocument({
      lists: [
        {
          text: 'Requirements',
          content: '<ul><li>TypeScript experience required.</li></ul>',
        },
      ],
    });
    const observations = Array.from({ length: 17 }, (_, index) => ({
      id: `observation-${String(index).padStart(2, '0')}`,
      fingerprint: `fingerprint-${String(16 - index).padStart(2, '0')}`,
      document,
    }));
    const artifact = buildV2RequirementSet(
      { id: 'snap-v2-bounds', fingerprint: 'snapshot-v2-bounds' },
      observations,
      { createdAt },
    );

    expect(artifact.set.status).toBe('PARTIAL');
    expect(artifact.requirements).toHaveLength(1);
    expect(artifact.requirements[0]?.provenance).toHaveLength(8);
    expect(artifact.requirements[0]?.provenance[0]?.sourceObservationId).toBe(
      'observation-16',
    );
  });
});
