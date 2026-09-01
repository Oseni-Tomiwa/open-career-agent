import { describe, expect, it } from 'vitest';
import { FitEngine, aggregateFit, type FitFinding } from './engine.js';
import { FitRequirementExtractor } from './extractor.js';

const engine = new FitEngine();
const supported = (kind: string, value: string, id = `${kind}-${value}`) => ({
  id,
  kind,
  value,
  state: 'SUPPORTED' as const,
});

describe('FitRequirementExtractor', () => {
  it('preserves normalized requirements, modality, excerpt, and provenance', () => {
    const result = new FitRequirementExtractor().extract({
      id: 'snap-1',
      title: 'Senior Backend Engineer',
      content:
        '<li>Node.js experience required.</li><li>Kubernetes is a plus.</li><li>Must be authorized to work in the US.</li>',
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          normalizedValue: 'node.js',
          modality: 'required',
          sourceReference: 'snapshot:snap-1',
        }),
        expect.objectContaining({
          normalizedValue: 'kubernetes',
          modality: 'preferred',
        }),
        expect.objectContaining({
          dimension: 'seniority',
          normalizedValue: 'senior',
        }),
      ]),
    );
    expect(result.some((item) => /authori/i.test(item.sourceText))).toBe(false);
  });

  it('extracts supported duration without fabricating precision', () => {
    const [requirement] = new FitRequirementExtractor().extract({
      content: 'At least 5+ years of backend experience required.',
    });
    expect(requirement).toMatchObject({
      dimension: 'specialization',
      normalizedValue: 'backend',
    });
    expect(
      new FitRequirementExtractor()
        .extract({
          content: 'At least 5+ years of backend experience required.',
        })
        .find((item) => item.dimension === 'experience_depth'),
    ).toMatchObject({ minimumYears: 5, normalizedValue: 'backend' });
  });

  it('preserves explicit alternatives as one requirement', () => {
    const result = new FitRequirementExtractor().extract({
      content: 'Experience with AWS, GCP, or Azure required.',
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      normalizedValue: 'aws|azure|gcp',
      label: 'aws or azure or gcp',
    });
  });

  it('preserves conjunctive platform requirements outside a provider alternative group', () => {
    const result = new FitRequirementExtractor().extract({
      content:
        'Hands-on experience with a major cloud provider (AWS, Azure, or GCP), Linux, and containers is required.',
    });
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ normalizedValue: 'aws|azure|gcp' }),
        expect.objectContaining({ normalizedValue: 'linux' }),
        expect.objectContaining({ normalizedValue: 'docker' }),
      ]),
    );
    expect(result).toHaveLength(3);
  });

  it('does not turn an explicit negation into a requirement', () => {
    const result = new FitRequirementExtractor().extract({
      content: "You don't need to be a Ruby language specialist.",
    });
    expect(result).toHaveLength(0);
    expect(
      new FitRequirementExtractor().extract({
        content: 'You don’t need to be a Ruby language specialist.',
      }),
    ).toHaveLength(0);
  });

  it('does not mistake go-to-market language for the Go programming language', () => {
    const result = new FitRequirementExtractor().extract({
      content:
        'Experience building a repeatable go-to-market strategy is required.',
    });
    expect(result).toHaveLength(0);
  });
});

describe('FitEngine technical and evidence semantics', () => {
  it('matches required Node.js from supported evidence', () => {
    const result = engine.evaluate(
      { content: 'Node.js experience required.' },
      [supported('skill', 'NodeJS', 'claim-node')],
    );
    expect(result.findings[0]).toMatchObject({
      state: 'STRONG_MATCH',
      candidateEvidenceReferences: ['claim:claim-node'],
    });
  });

  it('does not overstate explicitly limited proficiency as a strong match', () => {
    const language = engine.evaluate(
      { content: 'Strong programming experience in Ruby is required.' },
      [
        {
          ...supported('programming_language', 'Ruby'),
          scope: 'Introductory',
        },
      ],
    );
    expect(language.findings[0]).toMatchObject({
      state: 'PARTIAL',
      confidence: 'high',
    });
    expect(language.findings[0]?.explanation).toContain(
      'does not establish the proficiency requested',
    );

    const cloud = engine.evaluate(
      { content: 'Extensive expertise in GCP is required.' },
      [
        {
          ...supported('cloud_platform', 'GCP'),
          scope: 'Foundation / lab exposure',
        },
      ],
    );
    expect(cloud.findings[0]?.state).toBe('PARTIAL');
  });

  it('allows limited scope to satisfy a requirement that asks only for familiarity', () => {
    const result = engine.evaluate(
      { content: 'Familiarity with GCP is preferred.' },
      [
        {
          ...supported('cloud_platform', 'GCP'),
          scope: 'Foundation / lab exposure',
        },
      ],
    );
    expect(result.findings[0]?.state).toBe('STRONG_MATCH');
  });

  it('treats beginner evidence as partial when experience is requested', () => {
    const result = engine.evaluate(
      { content: 'Experience with Ruby is required.' },
      [
        {
          ...supported('programming_language', 'Ruby'),
          scope: 'Introductory',
        },
      ],
    );
    expect(result.findings[0]?.state).toBe('PARTIAL');
  });

  it('does not treat one matched conjunct as satisfying a compound requirement', () => {
    const result = engine.evaluate(
      {
        content:
          'Hands-on experience with a major cloud provider (AWS, Azure, or GCP), Linux, and containers is required.',
      },
      [
        {
          ...supported('cloud_platform', 'GCP'),
          scope: 'Foundation / lab exposure',
        },
        supported('containerization', 'Docker'),
      ],
    );
    expect(result.findings).toHaveLength(3);
    expect(
      result.findings.find((finding) => finding.label === 'linux'),
    ).toMatchObject({ state: 'NO_EVIDENCE' });
    expect(result.overallLevel).toBe('moderate');
  });

  it('uses NO_EVIDENCE, not a fabricated negative, when Kubernetes evidence is absent', () => {
    const result = engine.evaluate(
      { content: 'Kubernetes experience required.' },
      [],
    );
    expect(result.findings[0]?.state).toBe('NO_EVIDENCE');
    expect(result.findings[0]?.explanation).toContain('not evidence');
  });

  it('does not allow an unrelated supported skill to satisfy a requirement', () => {
    const result = engine.evaluate(
      { content: 'Kubernetes experience required.' },
      [supported('skill', 'React')],
    );
    expect(result.findings[0]?.state).toBe('NO_EVIDENCE');
  });

  it('recognizes only explicit transfer mappings', () => {
    const transferable = engine.evaluate(
      { content: 'Kubernetes experience required.' },
      [supported('skill', 'Docker')],
    );
    expect(transferable.findings[0]?.state).toBe('TRANSFERABLE');

    const unmapped = engine.evaluate(
      { content: 'Kubernetes experience required.' },
      [supported('skill', 'Terraform')],
    );
    expect(unmapped.findings[0]?.state).toBe('NO_EVIDENCE');
  });

  it('keeps cloud-provider transfer broad and non-equivalent', () => {
    const result = engine.evaluate(
      { content: 'Azure services experience required.' },
      [supported('cloud', 'AWS')],
    );
    expect(result.findings[0]).toMatchObject({ state: 'TRANSFERABLE' });
    expect(result.findings[0]?.explanation).toContain(
      'broad cloud-provider familiarity',
    );
    expect(result.findings[0]?.explanation).toContain(
      'does not establish azure or provider-specific service expertise',
    );
  });

  it('lets one direct option satisfy a required group without penalties for the others', () => {
    const result = engine.evaluate(
      { content: 'Experience with AWS, Azure, or GCP required.' },
      [supported('cloud', 'AWS')],
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.state).toBe('STRONG_MATCH');
    expect(result.overallLevel).toBe('strong');
    expect(
      result.findings.filter(
        (item) => item.state === 'GAP' || item.state === 'NO_EVIDENCE',
      ),
    ).toHaveLength(0);
  });

  it('allows explicit transferable evidence to partially satisfy an alternative group', () => {
    const result = engine.evaluate(
      { content: 'Kubernetes or AWS or Terraform experience required.' },
      [supported('cloud', 'Docker')],
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      state: 'TRANSFERABLE',
      confidence: 'medium',
    });
    expect(result.findings[0]?.explanation).toContain('not an exact match');
    expect(result.overallLevel).toBe('moderate');
  });

  it('creates one penalizing group finding when no alternative matches', () => {
    const result = engine.evaluate(
      { content: 'React or Vue experience required.' },
      [supported('skill', 'Angular')],
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.state).toBe('NO_EVIDENCE');
    expect(result.overallLevel).toBe('weak');
  });

  it('keeps an unsatisfied preferred alternative group lower impact', () => {
    const result = engine.evaluate(
      {
        content:
          'Node.js experience required. React or Vue experience preferred.',
      },
      [supported('skill', 'Node.js')],
    );
    expect(result.findings).toHaveLength(2);
    expect(
      result.findings.find((item) => item.modality === 'preferred'),
    ).toMatchObject({ state: 'NO_EVIDENCE' });
    expect(result.overallLevel).toBe('strong');
  });

  it('uses inferred claims cautiously and conflicting claims as uncertain', () => {
    expect(
      engine.evaluate({ content: 'React experience required.' }, [
        { kind: 'skill', value: 'React', state: 'INFERRED' },
      ]).findings[0]?.state,
    ).toBe('PARTIAL');
    expect(
      engine.evaluate({ content: 'React experience required.' }, [
        { kind: 'skill', value: 'React', state: 'CONFLICTING' },
      ]).findings[0]?.state,
    ).toBe('UNKNOWN');
    expect(
      engine.evaluate({ content: 'React experience required.' }, [
        { kind: 'skill', value: 'React', state: 'UNSUPPORTED' },
      ]).findings[0]?.state,
    ).toBe('NO_EVIDENCE');
  });

  it('accepts direct project proof without turning it into professional tenure', () => {
    const skill = engine.evaluate(
      { content: 'Kubernetes experience required.' },
      [supported('project_skill', 'Kubernetes')],
    );
    expect(skill.findings[0]).toMatchObject({ state: 'MATCH' });
    expect(skill.findings[0]?.explanation).toContain(
      'does not establish professional tenure',
    );

    const tenure = engine.evaluate(
      { content: '5+ years of Kubernetes experience required.' },
      [supported('project_experience_years', 'kubernetes:5')],
    );
    expect(
      tenure.findings.find((item) => item.dimension === 'experience_depth')
        ?.state,
    ).toBe('NO_EVIDENCE');
  });
});

describe('FitEngine experience, seniority, domain, and boundaries', () => {
  it.each([
    ['backend:5 years', 'STRONG_MATCH'],
    ['backend:3 years', 'PARTIAL'],
  ])('evaluates documented duration %s as %s', (value, state) => {
    const result = engine.evaluate(
      { content: '5+ years of backend experience required.' },
      [supported('experience_years', value)],
    );
    expect(
      result.findings.find((item) => item.dimension === 'experience_depth')
        ?.state,
    ).toBe(state);
  });

  it('keeps unknown duration unknown', () => {
    const result = engine.evaluate(
      { content: '5+ years of backend experience required.' },
      [{ kind: 'experience_years', value: 'backend', state: 'UNKNOWN' }],
    );
    expect(
      result.findings.find((item) => item.dimension === 'experience_depth')
        ?.state,
    ).toBe('UNKNOWN');
  });

  it('matches supported seniority and identifies a material level gap', () => {
    expect(
      engine.evaluate({ title: 'Senior Backend Engineer' }, [
        supported('seniority', 'Senior'),
      ]).findings[0]?.state,
    ).toBe('MATCH');
    expect(
      engine.evaluate({ title: 'Staff Backend Engineer' }, [
        supported('seniority', 'Junior'),
      ]).findings[0]?.state,
    ).toBe('GAP');
  });

  it('does not infer seniority from an ambiguous title', () => {
    const result = engine.evaluate({ title: 'Software Engineer' }, []);
    expect(result.requirements).toHaveLength(0);
  });

  it('matches domain evidence and treats absent domain evidence as unknown, not incompetence', () => {
    expect(
      engine.evaluate({ content: 'Healthcare experience required.' }, [
        supported('domain', 'Healthcare'),
      ]).findings[0]?.state,
    ).toBe('STRONG_MATCH');
    expect(
      engine.evaluate({ content: 'Healthcare experience required.' }, [])
        .findings[0]?.state,
    ).toBe('NO_EVIDENCE');
  });

  it.each([
    'Must be authorized to work in the US. Node.js experience required.',
    'Visa sponsorship is required. React experience required.',
    'Currently enrolled students only. Python experience required.',
  ])(
    'never emits Fit findings for eligibility-only requirements',
    (content) => {
      const result = engine.evaluate({ content }, []);
      expect(
        result.findings.some((item) =>
          /visa|authori|enrolled/i.test(item.requirement),
        ),
      ).toBe(false);
    },
  );
});

describe('Fit aggregation invariants', () => {
  const base = (
    state: FitFinding['state'],
    modality: FitFinding['modality'],
  ): FitFinding => ({
    requirementId: `${state}-${modality}`,
    dimension: 'technical_skill',
    label: 'test',
    state,
    modality,
    requirement: 'test',
    explanation: 'test',
    confidence: 'high',
    opportunityEvidenceReference: 'snapshot:test',
    candidateEvidenceReferences: [],
  });

  it('keeps all required direct matches strong despite preferred gaps', () => {
    expect(
      aggregateFit([
        base('STRONG_MATCH', 'required'),
        base('MATCH', 'required'),
        base('NO_EVIDENCE', 'preferred'),
        base('GAP', 'preferred'),
      ]),
    ).toBe('strong');
  });

  it('classifies mixed required findings moderate and several required gaps weak', () => {
    expect(
      aggregateFit([
        base('STRONG_MATCH', 'required'),
        base('NO_EVIDENCE', 'required'),
      ]),
    ).toBe('moderate');
    expect(
      aggregateFit([
        base('MATCH', 'required'),
        base('GAP', 'required'),
        base('NO_EVIDENCE', 'required'),
      ]),
    ).toBe('weak');
  });

  it('is reproducible from identical findings and never emits eligibility state', () => {
    const findings = [base('STRONG_MATCH', 'required')];
    expect(aggregateFit(findings)).toBe(aggregateFit(findings));
    expect(
      Object.keys(engine.evaluate({ content: 'Node.js required.' }, [])),
    ).not.toContain('eligibilityState');
  });
});
