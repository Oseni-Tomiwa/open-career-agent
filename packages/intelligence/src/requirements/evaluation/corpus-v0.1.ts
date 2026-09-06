import type {
  RequirementActionability,
  RequirementCategory,
  RequirementEvaluationUse,
  RequirementPolarity,
  RequirementStrength,
  RequirementValue,
} from '@oca/domain';
import type { ListingFragmentInput } from '@oca/sources';

import type {
  CorpusExpectation,
  CorpusProvider,
  ExpectedRequirementSemantic,
  RequirementEvaluationCase,
} from './types.js';

function semantic(input: {
  category: RequirementCategory;
  key: string;
  value: RequirementValue;
  strength?: RequirementStrength;
  polarity?: RequirementPolarity;
  evaluationUse?: RequirementEvaluationUse;
  actionability?: RequirementActionability;
}): ExpectedRequirementSemantic {
  return {
    category: input.category,
    normalizedKey: input.key,
    value: input.value,
    strength: input.strength ?? 'REQUIRED',
    polarity: input.polarity ?? 'REQUIRES',
    evaluationUse: input.evaluationUse ?? 'FIT',
    actionability: input.actionability ?? 'FIT_SIGNAL_SAFE',
  };
}

function compensationKey(text: string): string {
  return `compensation:${createHash('sha256')
    .update(JSON.stringify(text))
    .digest('hex')
    .slice(0, 16)}`;
}

function must(
  requirement: ExpectedRequirementSemantic,
  sourceFieldPath = '$.body',
  supportText?: string,
  exactLinks?: number,
): CorpusExpectation {
  return {
    disposition: 'MUST_EXTRACT',
    semantic: requirement,
    provenance: {
      sourceFieldPath,
      ...(supportText ? { supportText } : {}),
      ...(exactLinks === undefined ? {} : { exactLinks }),
    },
  };
}

function absent(
  category: RequirementCategory,
  normalizedKey?: string,
  unknownPreservation = false,
): CorpusExpectation {
  return {
    disposition: 'MUST_NOT_EXTRACT',
    match: { category, ...(normalizedKey ? { normalizedKey } : {}) },
    ...(unknownPreservation ? { unknownPreservation: true } : {}),
  };
}

function unresolved(
  category: RequirementCategory,
  normalizedKey: string | undefined,
  rationale: string,
): CorpusExpectation {
  return {
    disposition: 'MAY_REMAIN_UNRESOLVED',
    match: { category, ...(normalizedKey ? { normalizedKey } : {}) },
    rationale,
  };
}

function fragment(
  kind: NonNullable<ListingFragmentInput['kind']>,
  text: string,
  sourceFieldPath = '$.body',
  structure: ListingFragmentInput['structure'] = 'LIST_ITEM',
  heading?: string,
): ListingFragmentInput {
  return {
    kind,
    text,
    sourceFieldPath,
    structure,
    ...(heading ? { heading } : {}),
  };
}

function normalizedCase(input: {
  id: string;
  description: string;
  fragments: readonly ListingFragmentInput[];
  expected: readonly CorpusExpectation[];
  tags: readonly string[];
  rationale: string;
  consequential?: boolean;
  expectedDocumentTruncated?: boolean;
  expectedSetStatus?: 'COMPLETE' | 'PARTIAL';
}): RequirementEvaluationCase {
  return {
    id: input.id,
    description: input.description,
    input: {
      kind: 'NORMALIZED_DOCUMENT',
      sourceSystem: 'synthetic',
      fragments: input.fragments,
    },
    expected: input.expected,
    tags: input.tags,
    rationale: input.rationale,
    consequential: input.consequential ?? false,
    ...(input.expectedDocumentTruncated === undefined
      ? {}
      : { expectedDocumentTruncated: input.expectedDocumentTruncated }),
    ...(input.expectedSetStatus
      ? { expectedSetStatus: input.expectedSetStatus }
      : {}),
  };
}

const requiredTypeScript = semantic({
  category: 'TECHNICAL_SKILL',
  key: 'technical:typescript',
  value: { type: 'TERM', value: 'typescript' },
});
const experienceThreeTypeScript = semantic({
  category: 'EXPERIENCE',
  key: 'experience:3:typescript',
  value: { type: 'DURATION', minimumYears: 3, focus: 'typescript' },
});
const preferredAws = semantic({
  category: 'TECHNICAL_SKILL',
  key: 'technical:aws',
  value: { type: 'TERM', value: 'aws' },
  strength: 'PREFERRED',
});
const requiredGermany = semantic({
  category: 'LOCATION',
  key: 'location:germany',
  value: { type: 'SCOPE', value: 'Germany' },
  evaluationUse: 'ELIGIBILITY',
  actionability: 'HARD_CONSTRAINT_SAFE',
});
const sponsorshipUnavailable = semantic({
  category: 'SPONSORSHIP',
  key: 'sponsorship:unavailable',
  value: { type: 'SCOPE', value: 'unavailable' },
  polarity: 'UNAVAILABLE',
  evaluationUse: 'ELIGIBILITY',
  actionability: 'HARD_CONSTRAINT_SAFE',
});
const requiredGerman = semantic({
  category: 'LANGUAGE',
  key: 'language:german',
  value: { type: 'TERM', value: 'german' },
  evaluationUse: 'ELIGIBILITY',
  actionability: 'HARD_CONSTRAINT_SAFE',
});

const coreCases: RequirementEvaluationCase[] = [
  normalizedCase({
    id: 'tech-coverage',
    description:
      'Technical skills across required, preferred, contextual, responsibility, context, aliases, and unsupported terms.',
    fragments: [
      fragment(
        'REQUIREMENTS',
        'TypeScript, PostgreSQL, and NodeJS are required.',
        '$.requirements',
      ),
      fragment(
        'PREFERRED_QUALIFICATIONS',
        'React experience is a plus.',
        '$.preferred',
      ),
      fragment('SKILLS', 'Docker', '$.skills', 'LIST_ITEM', 'Technology'),
      fragment(
        'RESPONSIBILITIES',
        'Build Vue interfaces.',
        '$.responsibilities',
      ),
      fragment(
        'SUMMARY',
        'Our company platform runs Kubernetes.',
        '$.summary',
        'PROSE',
      ),
      fragment('REQUIREMENTS', 'Elixir experience required.', '$.requirements'),
    ],
    expected: [
      must(requiredTypeScript, '$.requirements'),
      must(
        semantic({
          category: 'TECHNICAL_SKILL',
          key: 'technical:postgresql',
          value: { type: 'TERM', value: 'postgresql' },
        }),
        '$.requirements',
      ),
      must(
        semantic({
          category: 'TECHNICAL_SKILL',
          key: 'technical:node.js',
          value: { type: 'TERM', value: 'node.js' },
        }),
        '$.requirements',
      ),
      must(
        semantic({
          category: 'TECHNICAL_SKILL',
          key: 'technical:react',
          value: { type: 'TERM', value: 'react' },
          strength: 'PREFERRED',
        }),
        '$.preferred',
      ),
      must(
        semantic({
          category: 'TECHNICAL_SKILL',
          key: 'technical:docker',
          value: { type: 'TERM', value: 'docker' },
          strength: 'CONTEXTUAL',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.skills',
      ),
      absent('TECHNICAL_SKILL', 'technical:vue'),
      absent('TECHNICAL_SKILL', 'technical:kubernetes'),
      absent('TECHNICAL_SKILL', 'technical:elixir'),
    ],
    tags: [
      'coverage:technical-required',
      'coverage:technical-preferred',
      'coverage:technical-contextual',
      'coverage:company-context',
      'coverage:responsibility-only',
      'coverage:multiple-skills',
      'coverage:technology-alias',
      'coverage:unsupported-technology',
    ],
    rationale:
      'Only candidate-facing deterministic statements should become requirements.',
  }),
  normalizedCase({
    id: 'technical-alternatives',
    description:
      'Technology alternatives remain disjunctive while mixed boolean language stays unresolved.',
    fragments: [
      fragment('REQUIREMENTS', 'JavaScript or TypeScript', '$.requirements'),
      fragment('REQUIREMENTS', 'AWS, GCP, or Azure', '$.requirements'),
      fragment('REQUIREMENTS', 'React and Vue or Angular', '$.requirements'),
    ],
    expected: [
      must(
        semantic({
          category: 'TECHNICAL_SKILL',
          key: 'technical:javascript|typescript',
          value: {
            type: 'TERM',
            value: 'javascript',
            alternatives: ['javascript', 'typescript'],
          },
        }),
        '$.requirements',
      ),
      must(
        semantic({
          category: 'TECHNICAL_SKILL',
          key: 'technical:aws|azure|gcp',
          value: {
            type: 'TERM',
            value: 'aws',
            alternatives: ['aws', 'azure', 'gcp'],
          },
        }),
        '$.requirements',
      ),
      unresolved(
        'TECHNICAL_SKILL',
        'technical:angular|react|vue',
        'Mixed AND/OR grouping is outside the deterministic grammar.',
      ),
    ],
    tags: [
      'coverage:technology-alternatives',
      'coverage:cloud-alternatives',
      'coverage:mixed-and-or',
    ],
    rationale:
      'Alternatives must not be flattened into conjunctive requirements.',
  }),
  normalizedCase({
    id: 'technical-duplicate-provenance',
    description: 'Two independent fragments support one canonical skill.',
    fragments: [
      fragment(
        'REQUIREMENTS',
        'TypeScript experience required.',
        '$.requirements[0]',
      ),
      fragment(
        'REQUIREMENTS',
        'TypeScript required for production services.',
        '$.requirements[1]',
      ),
    ],
    expected: [must(requiredTypeScript, '$.requirements[0]', 'TypeScript', 2)],
    tags: ['coverage:duplicate-skill', 'coverage:multiple-provenance'],
    rationale:
      'Independent support is provenance, not duplicate canonical output.',
  }),
  normalizedCase({
    id: 'experience-coverage',
    description:
      'Numeric experience forms, preferred duration, and general experience.',
    fragments: [
      fragment(
        'REQUIREMENTS',
        '3+ years of TypeScript experience.',
        '$.requirements[0]',
      ),
      fragment(
        'REQUIREMENTS',
        'You have at least 5 years of professional experience.',
        '$.requirements[1]',
      ),
      fragment(
        'REQUIREMENTS',
        '3-5 years of Python experience.',
        '$.requirements[2]',
      ),
      fragment(
        'PREFERRED_QUALIFICATIONS',
        '2 years of AWS experience preferred.',
        '$.preferred',
      ),
      fragment(
        'SUMMARY',
        'Significant experience is valued.',
        '$.summary',
        'PROSE',
      ),
    ],
    expected: [
      must(requiredTypeScript, '$.requirements[0]'),
      must(experienceThreeTypeScript, '$.requirements[0]'),
      must(
        semantic({
          category: 'EXPERIENCE',
          key: 'experience:5:relevant',
          value: { type: 'DURATION', minimumYears: 5 },
        }),
        '$.requirements[1]',
      ),
      must(
        semantic({
          category: 'TECHNICAL_SKILL',
          key: 'technical:python',
          value: { type: 'TERM', value: 'python' },
        }),
        '$.requirements[2]',
      ),
      must(
        semantic({
          category: 'EXPERIENCE',
          key: 'experience:3:python',
          value: { type: 'DURATION', minimumYears: 3, focus: 'python' },
        }),
        '$.requirements[2]',
      ),
      must(preferredAws, '$.preferred'),
      must(
        semantic({
          category: 'EXPERIENCE',
          key: 'experience:2:aws',
          value: { type: 'DURATION', minimumYears: 2, focus: 'aws' },
          strength: 'PREFERRED',
        }),
        '$.preferred',
      ),
      absent('EXPERIENCE', 'experience:significant'),
    ],
    tags: [
      'coverage:experience-3-plus',
      'coverage:experience-at-least-5',
      'coverage:experience-range',
      'coverage:experience-preferred',
      'coverage:experience-vague',
      'coverage:experience-technology',
      'coverage:experience-general',
    ],
    rationale: 'Only explicit numeric duration is canonical.',
  }),
  normalizedCase({
    id: 'experience-equivalent',
    description:
      'Years or equivalent experience must not become an unconditional actionable duration.',
    fragments: [
      fragment(
        'REQUIREMENTS',
        '3 years experience or equivalent practical experience.',
        '$.requirements',
      ),
    ],
    expected: [
      unresolved(
        'EXPERIENCE',
        'experience:3:relevant',
        'The alternative cannot be represented safely by the current duration value.',
      ),
    ],
    tags: ['coverage:experience-equivalent', 'coverage:unknown-preservation'],
    rationale:
      'Equivalent experience changes the meaning of the numeric threshold.',
  }),
  normalizedCase({
    id: 'seniority-junior',
    description: 'Junior seniority in the title.',
    fragments: [
      fragment(
        'OTHER',
        'Junior Software Engineer',
        '$.title',
        'STRUCTURED_VALUE',
        'Job title',
      ),
    ],
    expected: [
      must(
        semantic({
          category: 'SENIORITY',
          key: 'seniority:junior',
          value: { type: 'TERM', value: 'junior' },
        }),
        '$.title',
      ),
    ],
    tags: ['coverage:seniority-junior', 'coverage:seniority-title'],
    rationale: 'Explicit title seniority is deterministic Fit context.',
  }),
  normalizedCase({
    id: 'seniority-mid',
    description: 'Explicit mid-level seniority in the title.',
    fragments: [
      fragment(
        'OTHER',
        'Mid-level Software Engineer',
        '$.title',
        'STRUCTURED_VALUE',
        'Job title',
      ),
    ],
    expected: [
      must(
        semantic({
          category: 'SENIORITY',
          key: 'seniority:mid-level',
          value: { type: 'TERM', value: 'mid-level' },
        }),
        '$.title',
      ),
    ],
    tags: ['coverage:seniority-mid', 'coverage:seniority-title'],
    rationale:
      'The corpus records mid-level as explicit even if V2.2 misses it.',
  }),
  normalizedCase({
    id: 'seniority-senior-staff',
    description:
      'Senior and staff/principal title signals are measured independently.',
    fragments: [
      fragment(
        'OTHER',
        'Senior Engineer',
        '$.title',
        'STRUCTURED_VALUE',
        'Job title',
      ),
      fragment(
        'SUMMARY',
        'This team works with staff and principal partners.',
        '$.summary',
        'PROSE',
      ),
    ],
    expected: [
      must(
        semantic({
          category: 'SENIORITY',
          key: 'seniority:senior',
          value: { type: 'TERM', value: 'senior' },
        }),
        '$.title',
      ),
      absent('SENIORITY', 'seniority:staff'),
      absent('SENIORITY', 'seniority:principal'),
    ],
    tags: [
      'coverage:seniority-senior',
      'coverage:seniority-staff-principal',
      'coverage:seniority-ambiguous',
    ],
    rationale:
      'Company or collaborator seniority must not describe the candidate requirement.',
  }),
  normalizedCase({
    id: 'seniority-principal-title',
    description: 'Principal seniority in the title is explicit.',
    fragments: [
      fragment(
        'OTHER',
        'Principal Software Engineer',
        '$.title',
        'STRUCTURED_VALUE',
        'Job title',
      ),
    ],
    expected: [
      must(
        semantic({
          category: 'SENIORITY',
          key: 'seniority:principal',
          value: { type: 'TERM', value: 'principal' },
        }),
        '$.title',
      ),
    ],
    tags: ['coverage:seniority-staff-principal', 'coverage:seniority-title'],
    rationale: 'Explicit principal title wording is deterministic Fit context.',
  }),
  normalizedCase({
    id: 'location-work-model',
    description:
      'Structured onsite, hybrid, remote, and global remote values remain contextual.',
    fragments: [
      fragment('LOCATION', 'Onsite', '$.onsite', 'STRUCTURED_VALUE'),
      fragment('LOCATION', 'Hybrid', '$.hybrid', 'STRUCTURED_VALUE'),
      fragment('LOCATION', 'Remote', '$.remote', 'STRUCTURED_VALUE'),
      fragment('LOCATION', 'Global Remote', '$.global', 'STRUCTURED_VALUE'),
    ],
    expected: [
      must(
        semantic({
          category: 'WORK_MODEL',
          key: 'work-model:onsite',
          value: { type: 'SCOPE', value: 'onsite' },
          strength: 'CONTEXTUAL',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.onsite',
      ),
      must(
        semantic({
          category: 'WORK_MODEL',
          key: 'work-model:hybrid',
          value: { type: 'SCOPE', value: 'hybrid' },
          strength: 'CONTEXTUAL',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.hybrid',
      ),
      must(
        semantic({
          category: 'WORK_MODEL',
          key: 'work-model:remote',
          value: { type: 'SCOPE', value: 'remote' },
          strength: 'CONTEXTUAL',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.remote',
      ),
      must(
        semantic({
          category: 'LOCATION',
          key: 'location:global',
          value: { type: 'SCOPE', value: 'global' },
          strength: 'CONTEXTUAL',
          polarity: 'PERMITS',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.global',
      ),
    ],
    tags: [
      'coverage:onsite',
      'coverage:hybrid',
      'coverage:remote',
      'coverage:global-remote',
    ],
    rationale:
      'Broad provider work-model values do not establish residency gates.',
  }),
  normalizedCase({
    id: 'location-restrictions',
    description:
      'Explicit country alternatives and timezone overlap are consequential.',
    fragments: [
      fragment(
        'REQUIREMENTS',
        'Must be based in Germany or the Netherlands.',
        '$.requirements[0]',
      ),
      fragment(
        'REQUIREMENTS',
        'Must overlap UTC+1 to UTC+3.',
        '$.requirements[1]',
      ),
    ],
    expected: [
      must(
        semantic({
          category: 'LOCATION',
          key: 'location:germany-or-the-netherlands',
          value: {
            type: 'TERM',
            value: 'Germany',
            alternatives: ['Germany', 'the Netherlands'],
          },
          evaluationUse: 'ELIGIBILITY',
          actionability: 'HARD_CONSTRAINT_SAFE',
        }),
        '$.requirements[0]',
      ),
      must(
        semantic({
          category: 'TIMEZONE',
          key: 'timezone:utc+1-to-utc+3',
          value: { type: 'SCOPE', value: 'UTC+1 to UTC+3' },
          evaluationUse: 'ELIGIBILITY',
          actionability: 'HARD_CONSTRAINT_SAFE',
        }),
        '$.requirements[1]',
      ),
    ],
    tags: [
      'safety',
      'coverage:country-restricted-remote',
      'coverage:multi-country',
      'coverage:timezone',
      'coverage:location-timezone-overlap',
    ],
    rationale: 'Explicit scopes may be hard-safe only with exact provenance.',
    consequential: true,
  }),
  normalizedCase({
    id: 'explicit-onsite-hybrid-requirements',
    description: 'Explicit onsite and hybrid candidate-facing requirements.',
    fragments: [
      fragment('REQUIREMENTS', 'Must work onsite.', '$.requirements[0]'),
      fragment(
        'REQUIREMENTS',
        'Hybrid attendance is required.',
        '$.requirements[1]',
      ),
    ],
    expected: [
      must(
        semantic({
          category: 'WORK_MODEL',
          key: 'work-model:onsite',
          value: { type: 'SCOPE', value: 'onsite' },
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.requirements[0]',
      ),
      must(
        semantic({
          category: 'WORK_MODEL',
          key: 'work-model:hybrid',
          value: { type: 'SCOPE', value: 'hybrid' },
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.requirements[1]',
      ),
    ],
    tags: ['coverage:onsite', 'coverage:hybrid'],
    rationale:
      'Explicit work-model language should be represented without becoming an unsupported hard gate.',
  }),
  normalizedCase({
    id: 'residency-requirement',
    description:
      'Explicit residency should be distinguished from a generic location.',
    fragments: [
      fragment(
        'REQUIREMENTS',
        'Candidates must reside in Germany.',
        '$.requirements',
      ),
    ],
    expected: [
      must(
        semantic({
          category: 'RESIDENCY',
          key: 'residency:germany',
          value: { type: 'SCOPE', value: 'Germany' },
          evaluationUse: 'ELIGIBILITY',
          actionability: 'HARD_CONSTRAINT_SAFE',
        }),
        '$.requirements',
      ),
    ],
    tags: ['safety', 'coverage:residency'],
    rationale:
      'V2.3 measures the category boundary even if V2.2 cannot express it.',
    consequential: true,
  }),
  normalizedCase({
    id: 'location-company-context',
    description: 'A company office location is not a candidate restriction.',
    fragments: [
      fragment(
        'SUMMARY',
        'Our company was founded in Germany.',
        '$.summary',
        'PROSE',
      ),
    ],
    expected: [
      absent('LOCATION', undefined, true),
      absent('RESIDENCY', undefined, true),
    ],
    tags: [
      'safety',
      'coverage:location-company-context',
      'coverage:unknown-preservation',
    ],
    rationale: 'Context must preserve unknown candidate eligibility.',
    consequential: true,
  }),
  normalizedCase({
    id: 'authorization-sponsorship',
    description: 'Explicit authorization and sponsorship policy variants.',
    fragments: [
      fragment(
        'REQUIREMENTS',
        'Must be legally authorized to work in Germany.',
        '$.requirements[0]',
      ),
      fragment(
        'OTHER',
        'Visa sponsorship is available.',
        '$.policy[0]',
        'PROSE',
      ),
    ],
    expected: [
      must(
        semantic({
          category: 'WORK_AUTHORIZATION',
          key: 'work-authorization:germany',
          value: { type: 'SCOPE', value: 'Germany' },
          evaluationUse: 'ELIGIBILITY',
          actionability: 'HARD_CONSTRAINT_SAFE',
        }),
        '$.requirements[0]',
      ),
      must(
        semantic({
          category: 'SPONSORSHIP',
          key: 'sponsorship:available',
          value: { type: 'SCOPE', value: 'available' },
          strength: 'CONTEXTUAL',
          polarity: 'PERMITS',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.policy[0]',
      ),
    ],
    tags: [
      'safety',
      'coverage:authorization-required',
      'coverage:already-authorized',
      'coverage:sponsorship-available',
    ],
    rationale:
      'Permission cannot block; explicit authorization may be consequential.',
    consequential: true,
  }),
  normalizedCase({
    id: 'sponsorship-unknowns',
    description:
      'Silence, ambiguity, and may-sponsor language preserve unknown.',
    fragments: [
      fragment(
        'SUMMARY',
        'We support international teams.',
        '$.summary',
        'PROSE',
      ),
      fragment(
        'OTHER',
        'Sponsorship support can be discussed.',
        '$.policy[0]',
        'PROSE',
      ),
      fragment(
        'OTHER',
        'We may sponsor in exceptional cases.',
        '$.policy[1]',
        'PROSE',
      ),
    ],
    expected: [absent('SPONSORSHIP', undefined, true)],
    tags: [
      'safety',
      'coverage:sponsorship-unstated',
      'coverage:sponsorship-ambiguous',
      'coverage:sponsorship-may',
      'coverage:unknown-preservation',
    ],
    rationale:
      'Non-committal policy language is not a canonical policy requirement.',
    consequential: true,
  }),
  normalizedCase({
    id: 'sponsorship-contradiction',
    description: 'Contradictory sponsorship statements remain review-only.',
    fragments: [
      fragment('REQUIREMENTS', 'We cannot sponsor visas.', '$.policy[0]'),
      fragment(
        'OTHER',
        'Visa sponsorship is available.',
        '$.policy[1]',
        'PROSE',
      ),
    ],
    expected: [
      must(
        {
          ...sponsorshipUnavailable,
          strength: 'CONTEXTUAL',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        },
        '$.policy[0]',
      ),
      must(
        semantic({
          category: 'SPONSORSHIP',
          key: 'sponsorship:available',
          value: { type: 'SCOPE', value: 'available' },
          strength: 'CONTEXTUAL',
          polarity: 'PERMITS',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.policy[1]',
      ),
    ],
    tags: [
      'safety',
      'contradiction',
      'coverage:sponsorship-unavailable',
      'coverage:sponsorship-contradiction',
    ],
    rationale: 'Contradictory source text cannot create a hard constraint.',
    consequential: true,
  }),
  normalizedCase({
    id: 'education-coverage',
    description:
      'Required, preferred, equivalent, negated, and contextual degree statements.',
    fragments: [
      fragment('REQUIREMENTS', 'Bachelor degree required.', '$.requirements'),
      fragment(
        'PREFERRED_QUALIFICATIONS',
        'Master degree preferred.',
        '$.preferred',
      ),
      fragment('OTHER', 'No degree required.', '$.policy', 'PROSE'),
      fragment(
        'SUMMARY',
        'Our founders met at university.',
        '$.summary',
        'PROSE',
      ),
    ],
    expected: [
      unresolved(
        'EDUCATION',
        'education:bachelor',
        'Required and not-required statements conflict.',
      ),
      must(
        semantic({
          category: 'EDUCATION',
          key: 'education:master',
          value: { type: 'TERM', value: 'master' },
          strength: 'PREFERRED',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.preferred',
      ),
      must(
        semantic({
          category: 'EDUCATION',
          key: 'education:degree:not-required',
          value: { type: 'TEXT', value: 'degree not required' },
          strength: 'CONTEXTUAL',
          polarity: 'PERMITS',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.policy',
      ),
    ],
    tags: [
      'safety',
      'contradiction',
      'coverage:degree-required',
      'coverage:degree-preferred',
      'coverage:no-degree',
      'coverage:education-context',
    ],
    rationale: 'Contradictory education language is review-only.',
    consequential: true,
  }),
  normalizedCase({
    id: 'degree-equivalent-field',
    description:
      'Specific degree field with equivalent experience remains contextual.',
    fragments: [
      fragment(
        'REQUIREMENTS',
        'Degree in computer science or equivalent practical experience.',
        '$.requirements',
      ),
    ],
    expected: [
      must(
        semantic({
          category: 'EDUCATION',
          key: 'education:degree-in-computer-science',
          value: { type: 'TERM', value: 'degree in computer science' },
          strength: 'CONTEXTUAL',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.requirements',
      ),
    ],
    tags: ['safety', 'coverage:degree-field', 'coverage:degree-equivalent'],
    rationale: 'Equivalent experience prevents a hard education gate.',
    consequential: true,
  }),
  normalizedCase({
    id: 'language-certification',
    description:
      'Spoken language and certification modality without programming-language confusion.',
    fragments: [
      fragment(
        'REQUIREMENTS',
        'Professional German proficiency is required.',
        '$.requirements[0]',
      ),
      fragment(
        'PREFERRED_QUALIFICATIONS',
        'French proficiency preferred.',
        '$.preferred[0]',
      ),
      fragment(
        'REQUIREMENTS',
        'CISSP certification required.',
        '$.requirements[1]',
      ),
      fragment(
        'PREFERRED_QUALIFICATIONS',
        'PMP certification preferred.',
        '$.preferred[1]',
      ),
      fragment(
        'REQUIREMENTS',
        'Java experience required.',
        '$.requirements[2]',
      ),
      fragment(
        'SUMMARY',
        'Our product manages certification records.',
        '$.summary',
        'PROSE',
      ),
    ],
    expected: [
      must(requiredGerman, '$.requirements[0]'),
      must(
        semantic({
          category: 'LANGUAGE',
          key: 'language:french',
          value: { type: 'TERM', value: 'french' },
          strength: 'PREFERRED',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.preferred[0]',
      ),
      must(
        semantic({
          category: 'CERTIFICATION',
          key: 'certification:cissp',
          value: { type: 'TERM', value: 'CISSP' },
          evaluationUse: 'ELIGIBILITY',
          actionability: 'HARD_CONSTRAINT_SAFE',
        }),
        '$.requirements[1]',
      ),
      must(
        semantic({
          category: 'CERTIFICATION',
          key: 'certification:pmp',
          value: { type: 'TERM', value: 'PMP' },
          strength: 'PREFERRED',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.preferred[1]',
      ),
      must(
        semantic({
          category: 'TECHNICAL_SKILL',
          key: 'technical:java',
          value: { type: 'TERM', value: 'java' },
        }),
        '$.requirements[2]',
      ),
      absent('LANGUAGE', 'language:java'),
    ],
    tags: [
      'safety',
      'coverage:language-required',
      'coverage:language-preferred',
      'coverage:language-proficiency',
      'coverage:programming-not-spoken',
      'coverage:certification-required',
      'coverage:certification-preferred',
      'coverage:certification-context',
    ],
    rationale:
      'Language and certification categories require explicit candidate-facing wording.',
    consequential: true,
  }),
  normalizedCase({
    id: 'alternative-certification',
    description:
      'Alternative certifications remain unresolved without a safe OR model.',
    fragments: [
      fragment(
        'REQUIREMENTS',
        'PMP or CISSP certification required.',
        '$.requirements',
      ),
    ],
    expected: [
      unresolved(
        'CERTIFICATION',
        undefined,
        'The current certification value cannot preserve the disjunction safely.',
      ),
    ],
    tags: ['safety', 'coverage:alternative-certification'],
    rationale:
      'Either certification satisfies the source statement; neither is individually required.',
    consequential: true,
  }),
  normalizedCase({
    id: 'employment-compensation',
    description: 'Employment types and compensation stay contextual.',
    fragments: [
      fragment(
        'EMPLOYMENT',
        'Full-time',
        '$.employment[0]',
        'STRUCTURED_VALUE',
      ),
      fragment(
        'EMPLOYMENT',
        'Part-time',
        '$.employment[1]',
        'STRUCTURED_VALUE',
      ),
      fragment('EMPLOYMENT', 'Contract', '$.employment[2]', 'STRUCTURED_VALUE'),
      fragment(
        'EMPLOYMENT',
        'Internship',
        '$.employment[3]',
        'STRUCTURED_VALUE',
      ),
      fragment(
        'EMPLOYMENT',
        'Temporary',
        '$.employment[4]',
        'STRUCTURED_VALUE',
      ),
      fragment(
        'COMPENSATION',
        'USD 120000 – 150000 per year',
        '$.salary',
        'STRUCTURED_VALUE',
      ),
      fragment(
        'SUMMARY',
        'We signed a full-time office lease.',
        '$.summary',
        'PROSE',
      ),
    ],
    expected: [
      ...['full-time', 'part-time', 'contract', 'internship', 'temporary'].map(
        (value, index) =>
          must(
            semantic({
              category: 'EMPLOYMENT_TYPE',
              key: `employment:${value}`,
              value: { type: 'TERM', value },
              strength: 'CONTEXTUAL',
              evaluationUse: 'CONTEXT_ONLY',
              actionability: 'REVIEW_ONLY',
            }),
            `$.employment[${index}]`,
          ),
      ),
      must(
        semantic({
          category: 'COMPENSATION',
          key: compensationKey('USD 120000 – 150000 per year'),
          value: { type: 'TEXT', value: 'USD 120000 – 150000 per year' },
          strength: 'CONTEXTUAL',
          polarity: 'PERMITS',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.salary',
      ),
    ],
    tags: [
      'coverage:employment-full-time',
      'coverage:employment-part-time',
      'coverage:employment-contract',
      'coverage:employment-internship',
      'coverage:employment-temporary',
      'coverage:employment-irrelevant',
      'coverage:compensation-structured',
      'coverage:compensation-currency',
      'coverage:compensation-min-max',
    ],
    rationale:
      'Employment and compensation are listing context, never candidate eligibility in V2.2.',
  }),
  normalizedCase({
    id: 'compensation-prose-malformed-absent',
    description:
      'Valid prose compensation is contextual; absent and malformed values produce nothing.',
    fragments: [
      fragment(
        'OTHER',
        'The salary range is EUR 80000 to 100000 per year.',
        '$.body',
        'PROSE',
      ),
      fragment('SUMMARY', 'Compensation is competitive.', '$.summary', 'PROSE'),
    ],
    expected: [
      must(
        semantic({
          category: 'COMPENSATION',
          key: compensationKey(
            'The salary range is EUR 80000 to 100000 per year.',
          ),
          value: {
            type: 'TEXT',
            value: 'The salary range is EUR 80000 to 100000 per year.',
          },
          strength: 'CONTEXTUAL',
          polarity: 'PERMITS',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.body',
      ),
    ],
    tags: [
      'coverage:compensation-prose',
      'coverage:compensation-absent',
      'coverage:compensation-malformed',
    ],
    rationale: 'Compensation needs a cue and numeric currency evidence.',
  }),
  normalizedCase({
    id: 'domain-specialization',
    description:
      'Required and preferred domain/specialization separate from company context.',
    fragments: [
      fragment(
        'REQUIREMENTS',
        'Backend and platform engineering experience required.',
        '$.requirements',
      ),
      fragment(
        'REQUIREMENTS',
        'Data engineering experience required.',
        '$.requirementsData',
      ),
      fragment(
        'REQUIREMENTS',
        'Payments experience required.',
        '$.requirementsDomain',
      ),
      fragment(
        'PREFERRED_QUALIFICATIONS',
        'Fintech experience preferred.',
        '$.preferred',
      ),
      fragment(
        'SUMMARY',
        'Our company builds healthcare products with a frontend.',
        '$.summary',
        'PROSE',
      ),
    ],
    expected: [
      must(
        semantic({
          category: 'TECHNICAL_SKILL',
          key: 'technical:backend',
          value: { type: 'TERM', value: 'backend' },
        }),
        '$.requirements',
      ),
      must(
        semantic({
          category: 'TECHNICAL_SKILL',
          key: 'technical:platform-engineering',
          value: { type: 'TERM', value: 'platform-engineering' },
        }),
        '$.requirements',
      ),
      must(
        semantic({
          category: 'TECHNICAL_SKILL',
          key: 'technical:data-engineering',
          value: { type: 'TERM', value: 'data-engineering' },
        }),
        '$.requirementsData',
      ),
      must(
        semantic({
          category: 'DOMAIN_EXPERIENCE',
          key: 'domain:payments',
          value: { type: 'TERM', value: 'payments' },
        }),
        '$.requirementsDomain',
      ),
      must(
        semantic({
          category: 'DOMAIN_EXPERIENCE',
          key: 'domain:fintech',
          value: { type: 'TERM', value: 'fintech' },
          strength: 'PREFERRED',
        }),
        '$.preferred',
      ),
      absent('DOMAIN_EXPERIENCE', 'domain:healthcare'),
      absent('TECHNICAL_SKILL', 'technical:frontend'),
    ],
    tags: [
      'coverage:specialization-backend',
      'coverage:specialization-frontend',
      'coverage:specialization-platform',
      'coverage:specialization-data',
      'coverage:domain-required',
      'coverage:domain-preferred',
      'coverage:domain-context',
    ],
    rationale:
      'Company domain and architecture context are not candidate requirements.',
  }),
  normalizedCase({
    id: 'negation-coverage',
    description: 'Negated requirements remain absent even near positive text.',
    fragments: [
      fragment(
        'REQUIREMENTS',
        'You do not need React experience.',
        '$.requirements[0]',
      ),
      fragment(
        'REQUIREMENTS',
        'Prior fintech experience is not required.',
        '$.requirements[1]',
      ),
      fragment(
        'REQUIREMENTS',
        "We don't require CISSP certification.",
        '$.requirements[2]',
      ),
      fragment(
        'REQUIREMENTS',
        'React is not required. TypeScript is required.',
        '$.requirements[3]',
      ),
    ],
    expected: [
      absent('TECHNICAL_SKILL', 'technical:react', true),
      absent('DOMAIN_EXPERIENCE', 'domain:fintech', true),
      absent('CERTIFICATION', 'certification:cissp', true),
      must(requiredTypeScript, '$.requirements[3]'),
    ],
    tags: [
      'safety',
      'coverage:negated-skill',
      'coverage:negated-domain',
      'coverage:negated-certification',
      'coverage:negation-near-positive',
      'coverage:unknown-preservation',
    ],
    rationale:
      'Local negation must not suppress an unrelated positive requirement.',
    consequential: true,
  }),
  normalizedCase({
    id: 'technical-requirement-contradiction',
    description:
      'Required and not-required statements for the same skill stay unresolved.',
    fragments: [
      fragment('REQUIREMENTS', 'TypeScript is required.', '$.requirements[0]'),
      fragment(
        'OTHER',
        'TypeScript is not required.',
        '$.requirements[1]',
        'PROSE',
      ),
    ],
    expected: [
      unresolved(
        'TECHNICAL_SKILL',
        'technical:typescript',
        'Directly contradictory modality cannot support an actionable requirement.',
      ),
    ],
    tags: ['contradiction', 'coverage:required-not-required'],
    rationale:
      'Contradictory statements must not be resolved by source ordering.',
  }),
  normalizedCase({
    id: 'remote-onsite-contradiction',
    description: 'Conflicting structured work-model fields remain contextual.',
    fragments: [
      fragment('LOCATION', 'Remote', '$.workplaceType', 'STRUCTURED_VALUE'),
      fragment('LOCATION', 'Onsite only', '$.body', 'STRUCTURED_VALUE'),
    ],
    expected: [
      unresolved(
        'WORK_MODEL',
        'work-model:remote',
        'Provider fields conflict.',
      ),
      unresolved(
        'WORK_MODEL',
        'work-model:onsite',
        'Provider fields conflict.',
      ),
    ],
    tags: [
      'safety',
      'contradiction',
      'coverage:remote-onsite-contradiction',
      'coverage:structured-prose-conflict',
    ],
    rationale: 'Conflicting work models cannot become eligibility gates.',
    consequential: true,
  }),
  normalizedCase({
    id: 'sparse-and-empty',
    description:
      'Title-only and empty documents create no fabricated requirement.',
    fragments: [
      fragment(
        'OTHER',
        'Software Engineer',
        '$.title',
        'STRUCTURED_VALUE',
        'Job title',
      ),
    ],
    expected: [
      absent('TECHNICAL_SKILL'),
      absent('EXPERIENCE'),
      absent('LOCATION', undefined, true),
    ],
    tags: [
      'safety',
      'coverage:title-only',
      'coverage:empty-body',
      'coverage:sparse',
      'coverage:experience-none',
      'coverage:unknown-preservation',
    ],
    rationale: 'A sparse listing must remain sparse.',
    consequential: true,
  }),
  {
    id: 'malformed-lever-optionals',
    description:
      'Malformed optional Lever collections do not fabricate requirements.',
    input: {
      kind: 'PROVIDER_PAYLOAD',
      provider: 'lever',
      payload: {
        text: 'Sparse role',
        _siteId: 'synthetic',
        descriptionPlain: '',
        lists: { invalid: true },
        categories: { allLocations: { invalid: true } },
        salaryRange: {},
      },
    },
    expected: [
      absent('TECHNICAL_SKILL'),
      absent('LOCATION', undefined, true),
      absent('COMPENSATION'),
    ],
    tags: [
      'safety',
      'coverage:malformed-provider',
      'coverage:unsupported-metadata',
    ],
    rationale: 'Malformed optional collections are ignored safely.',
    consequential: true,
  },
  {
    id: 'greenhouse-metadata-field',
    description: 'Greenhouse metadata retains provider-field provenance.',
    input: {
      kind: 'PROVIDER_PAYLOAD',
      provider: 'greenhouse',
      payload: {
        title: 'Synthetic role',
        company_name: 'Synthetic',
        content: '',
        metadata: [{ name: 'Employment type', value: 'Full-time' }],
      },
    },
    expected: [
      must(
        semantic({
          category: 'EMPLOYMENT_TYPE',
          key: 'employment:full-time',
          value: { type: 'TERM', value: 'full-time' },
          strength: 'CONTEXTUAL',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        }),
        '$.metadata[0].value',
      ),
    ],
    tags: ['coverage:metadata-field', 'coverage:provider-greenhouse'],
    rationale:
      'Provider metadata should remain traceable when it carries canonical listing context.',
    consequential: false,
  },
  {
    id: 'lever-duplicate-source-representation',
    description:
      'Duplicate Lever source representations do not create fake support.',
    input: {
      kind: 'PROVIDER_PAYLOAD',
      provider: 'lever',
      payload: {
        text: 'Synthetic role',
        _siteId: 'synthetic',
        descriptionPlain: 'TypeScript experience required.',
        lists: [
          {
            text: 'Requirements',
            content: '<ul><li>TypeScript experience required.</li></ul>',
          },
        ],
      },
    },
    expected: [
      must(
        requiredTypeScript,
        '$.lists[0].content',
        'TypeScript experience required.',
        1,
      ),
    ],
    tags: ['coverage:duplicate-provider-representation'],
    rationale:
      'The same source text represented twice is not independent corroboration.',
    consequential: false,
  },
  normalizedCase({
    id: 'long-fragment-bounds',
    description:
      'Very long low-value content is deterministically truncated without fabricated extraction.',
    fragments: [
      fragment(
        'SUMMARY',
        `Company context ${'x'.repeat(9000)}`,
        '$.body',
        'PROSE',
      ),
    ],
    expected: [absent('TECHNICAL_SKILL')],
    tags: [
      'coverage:long-fragment',
      'coverage:fragment-truncation',
      'coverage:document-truncation',
    ],
    rationale: 'Bounds are observable on the document/set rather than hidden.',
    expectedDocumentTruncated: true,
    expectedSetStatus: 'PARTIAL',
  }),
];

function providerPayload(
  provider: CorpusProvider,
  heading: string,
  statement: string,
): Readonly<Record<string, unknown>> {
  if (provider === 'ashby') {
    return {
      title: 'Software Engineer',
      _boardId: 'synthetic',
      descriptionPlain: '',
      descriptionHtml: `<h3>${heading}</h3><ul><li>${statement}</li></ul>`,
    };
  }
  if (provider === 'lever') {
    return {
      text: 'Software Engineer',
      _siteId: 'synthetic',
      descriptionPlain: '',
      lists: [{ text: heading, content: `<ul><li>${statement}</li></ul>` }],
    };
  }
  return {
    title: 'Software Engineer',
    company_name: 'Synthetic',
    content: `<h3>${heading}</h3><ul><li>${statement}</li></ul>`,
  };
}

function providerPath(provider: CorpusProvider): string {
  return provider === 'ashby'
    ? '$.descriptionHtml'
    : provider === 'lever'
      ? '$.lists[0].content'
      : '$.content';
}

const equivalenceDefinitions: ReadonlyArray<{
  group: string;
  heading: string;
  statement: string;
  semantics: readonly ExpectedRequirementSemantic[];
  tags: readonly string[];
  consequential: boolean;
}> = [
  {
    group: 'required-typescript',
    heading: 'Requirements',
    statement: 'TypeScript experience required.',
    semantics: [requiredTypeScript],
    tags: ['coverage:equivalence-typescript'],
    consequential: false,
  },
  {
    group: 'three-years-typescript',
    heading: 'Requirements',
    statement: '3+ years of TypeScript experience.',
    semantics: [requiredTypeScript, experienceThreeTypeScript],
    tags: ['coverage:equivalence-experience'],
    consequential: false,
  },
  {
    group: 'preferred-aws',
    heading: 'Preferred qualifications',
    statement: 'AWS experience preferred.',
    semantics: [preferredAws],
    tags: ['coverage:equivalence-preferred'],
    consequential: false,
  },
  {
    group: 'country-restriction',
    heading: 'Requirements',
    statement: 'Must be based in Germany.',
    semantics: [requiredGermany],
    tags: ['safety', 'coverage:equivalence-location'],
    consequential: true,
  },
  {
    group: 'sponsorship-unavailable',
    heading: 'Requirements',
    statement: 'We cannot sponsor visas.',
    semantics: [sponsorshipUnavailable],
    tags: ['safety', 'coverage:equivalence-sponsorship'],
    consequential: true,
  },
  {
    group: 'required-german',
    heading: 'Requirements',
    statement: 'German proficiency is required.',
    semantics: [requiredGerman],
    tags: ['safety', 'coverage:equivalence-language'],
    consequential: true,
  },
];

const equivalenceCases = equivalenceDefinitions.flatMap((definition) =>
  (['ashby', 'lever', 'greenhouse'] as const).map((provider) => ({
    id: `equivalence-${definition.group}-${provider}`,
    description: `${definition.group} expressed through ${provider}.`,
    input: {
      kind: 'PROVIDER_PAYLOAD' as const,
      provider,
      payload: providerPayload(
        provider,
        definition.heading,
        definition.statement,
      ),
    },
    expected: definition.semantics.map((item) =>
      must(item, providerPath(provider), definition.statement),
    ),
    tags: ['cross-provider', ...definition.tags],
    rationale:
      'Equivalent provider structures should converge semantically while preserving provider paths.',
    consequential: definition.consequential,
    equivalenceGroup: definition.group,
  })),
);

export const REQUIREMENT_EVALUATION_CORPUS: readonly RequirementEvaluationCase[] =
  [...coreCases, ...equivalenceCases];
import { createHash } from 'node:crypto';
