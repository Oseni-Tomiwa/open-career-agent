import { createHash } from 'node:crypto';

import type {
  CanonicalRequirement,
  CompleteRequirementSet,
  RequirementActionability,
  RequirementCategory,
  RequirementEvaluationUse,
  RequirementPolarity,
  RequirementProvenance,
  RequirementStrength,
  RequirementValue,
  SnapshotId,
  SourceObservationId,
} from '@oca/domain';
import {
  requirementId,
  requirementProvenanceId,
  requirementSetId,
} from '@oca/domain';
import type {
  NormalizedListingDocument,
  NormalizedListingFragment,
} from '@oca/sources';
import { NORMALIZED_LISTING_DOCUMENT_VERSION } from '@oca/sources';

export const V2_2_PIPELINE_VERSION = 'requirements-v2.2-rich-document';
export const V2_2_DETERMINISTIC_EXTRACTOR_VERSION =
  'requirements-deterministic-v2.2';
export const V2_3_1_DETERMINISTIC_EXTRACTOR_VERSION =
  'requirements-deterministic-v2.3.1';
export const V2_2_LOCATOR_VERSION = 'listing-fragment-v2.2';
export const MAX_REQUIREMENT_OBSERVATIONS = 16;
export const MAX_EXTRACTION_FRAGMENTS = 512;
export const MAX_CANONICAL_REQUIREMENTS = 128;
export const MAX_PROVENANCE_PER_REQUIREMENT = 8;

export interface V2RequirementSnapshot {
  readonly id: string;
  readonly fingerprint: string;
}

export interface V2RequirementObservation {
  readonly id: string;
  readonly fingerprint: string;
  readonly document: NormalizedListingDocument;
}

interface RequirementDraft {
  readonly category: RequirementCategory;
  readonly normalizedKey: string;
  readonly value: RequirementValue;
  readonly statement: string;
  readonly strength: RequirementStrength;
  readonly polarity: RequirementPolarity;
  readonly evaluationUse: RequirementEvaluationUse;
  readonly actionability: RequirementActionability;
  readonly fragment: NormalizedListingFragment;
  readonly observationId: string;
}

interface RequirementContradictionSignal {
  readonly category: RequirementCategory;
  readonly normalizedKey?: string;
  readonly fragment: NormalizedListingFragment;
  readonly observationId: string;
}

const TECHNICAL_TERMS = [
  ['typescript', 'typescript'],
  ['javascript', 'javascript'],
  ['python', 'python'],
  ['golang', 'go'],
  ['go', 'go'],
  ['java', 'java'],
  ['c#', 'c-sharp'],
  ['c++', 'c-plus-plus'],
  ['ruby', 'ruby'],
  ['rust', 'rust'],
  ['php', 'php'],
  ['kotlin', 'kotlin'],
  ['swift', 'swift'],
  ['react', 'react'],
  ['next.js', 'next.js'],
  ['node.js', 'node.js'],
  ['nodejs', 'node.js'],
  ['vue', 'vue'],
  ['angular', 'angular'],
  ['svelte', 'svelte'],
  ['django', 'django'],
  ['rails', 'rails'],
  ['spring', 'spring'],
  ['.net', '.net'],
  ['postgresql', 'postgresql'],
  ['postgres', 'postgresql'],
  ['mysql', 'mysql'],
  ['mongodb', 'mongodb'],
  ['redis', 'redis'],
  ['snowflake', 'snowflake'],
  ['bigquery', 'bigquery'],
  ['aws', 'aws'],
  ['amazon web services', 'aws'],
  ['gcp', 'gcp'],
  ['google cloud', 'gcp'],
  ['azure', 'azure'],
  ['kubernetes', 'kubernetes'],
  ['docker', 'docker'],
  ['terraform', 'terraform'],
  ['graphql', 'graphql'],
  ['microservices', 'microservices'],
  ['distributed systems', 'distributed-systems'],
  ['event-driven', 'event-driven-architecture'],
  ['backend', 'backend'],
  ['back-end', 'backend'],
  ['frontend', 'frontend'],
  ['front-end', 'frontend'],
  ['full-stack', 'full-stack'],
  ['full stack', 'full-stack'],
  ['data engineering', 'data-engineering'],
  ['machine learning', 'machine-learning'],
  ['devops', 'devops'],
  ['infrastructure', 'infrastructure'],
  ['platform engineering', 'platform-engineering'],
] as const;

const SPOKEN_LANGUAGES = [
  'english',
  'german',
  'french',
  'spanish',
  'dutch',
  'portuguese',
  'japanese',
  'mandarin',
] as const;

const DOMAIN_TERMS = [
  'fintech',
  'healthcare',
  'payments',
  'e-commerce',
  'cybersecurity',
  'developer tools',
] as const;

const REQUIRED_CUE =
  /\b(must|required|minimum|at least|you (?:have|bring|are)|we (?:require|need)|looking for|experience (?:with|in)|proficien(?:t|cy)|strong (?:knowledge|understanding)|ability to|hands-on)\b/i;
const PREFERRED_CUE =
  /\b(preferred|nice to have|bonus|a plus|plus if|ideally|desirable)\b/i;
const NEGATED_REQUIREMENT =
  /\b(no .{0,40} required|not required|do not require|don't require|does not require|doesn't require|do not need|don't need|without requiring)\b/i;

const EXTRACTION_PRIORITY: Record<NormalizedListingFragment['kind'], number> = {
  REQUIREMENTS: 0,
  PREFERRED_QUALIFICATIONS: 0,
  SKILLS: 1,
  LOCATION: 1,
  EMPLOYMENT: 1,
  COMPENSATION: 1,
  RESPONSIBILITIES: 2,
  SUMMARY: 3,
  OTHER: 4,
  BENEFITS: 5,
};

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function shortId(prefix: string, value: unknown): string {
  return `${prefix}_${hash(value).slice(0, 32)}`;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, '-')
    .replace(/^-|-$/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(text: string, term: string): boolean {
  const boundary = /^[a-z0-9]/i.test(term) && /[a-z0-9]$/i.test(term);
  const pattern = boundary ? `\\b${escapeRegExp(term)}\\b` : escapeRegExp(term);
  return new RegExp(pattern, 'i').test(text);
}

function sentenceSegments(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|[\n\r]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function surfacesForTechnicalTerm(term: string): readonly string[] {
  return TECHNICAL_TERMS.filter(([, canonical]) => canonical === term).map(
    ([surface]) => surface,
  );
}

function technicalTermSegments(text: string, term: string): string[] {
  const surfaces = surfacesForTechnicalTerm(term);
  return sentenceSegments(text).filter((segment) =>
    surfaces.some((surface) => containsTerm(segment, surface)),
  );
}

function technicalTermHasPositiveAssertion(
  text: string,
  term: string,
): boolean {
  return technicalTermSegments(text, term).some(
    (segment) => !NEGATED_REQUIREMENT.test(segment),
  );
}

function technicalTermHasNegatedAssertion(text: string, term: string): boolean {
  return technicalTermSegments(text, term).some((segment) =>
    NEGATED_REQUIREMENT.test(segment),
  );
}

function strengthFor(
  fragment: NormalizedListingFragment,
): RequirementStrength | null {
  if (PREFERRED_CUE.test(fragment.text)) return 'PREFERRED';
  if (fragment.kind === 'PREFERRED_QUALIFICATIONS') return 'PREFERRED';
  if (REQUIRED_CUE.test(fragment.text)) return 'REQUIRED';
  if (fragment.kind === 'REQUIREMENTS') return 'REQUIRED';
  if (fragment.kind === 'SKILLS') return 'CONTEXTUAL';
  return null;
}

function fitUse(strength: RequirementStrength): {
  evaluationUse: RequirementEvaluationUse;
  actionability: RequirementActionability;
} {
  return strength === 'CONTEXTUAL'
    ? { evaluationUse: 'CONTEXT_ONLY', actionability: 'REVIEW_ONLY' }
    : { evaluationUse: 'FIT', actionability: 'FIT_SIGNAL_SAFE' };
}

function consequentialUse(input: {
  readonly strength: RequirementStrength;
  readonly explicit: boolean;
  readonly contradictory?: boolean;
}): {
  evaluationUse: RequirementEvaluationUse;
  actionability: RequirementActionability;
} {
  if (input.strength === 'REQUIRED' && input.explicit && !input.contradictory) {
    return {
      evaluationUse: 'ELIGIBILITY',
      actionability: 'HARD_CONSTRAINT_SAFE',
    };
  }
  return { evaluationUse: 'CONTEXT_ONLY', actionability: 'REVIEW_ONLY' };
}

function technicalTerms(text: string): string[] {
  return [
    ...new Set(
      TECHNICAL_TERMS.filter(([surface]) => containsTerm(text, surface)).map(
        ([, canonical]) => canonical,
      ),
    ),
  ];
}

function alternativeGroups(text: string, terms: readonly string[]): string[][] {
  if (terms.length < 2) return [];
  const positioned = terms
    .map((term) => ({ term, index: text.toLowerCase().indexOf(term) }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index);
  if (positioned.length < 2) return [];
  const last = positioned[positioned.length - 1]!;
  const span = text.slice(positioned[0]!.index, last.index + last.term.length);
  if (span.length > 100 || !/\bor\b/i.test(span)) return [];
  return [positioned.map((item) => item.term).sort()];
}

function hasMixedAndOrExpression(
  text: string,
  terms: readonly string[],
): boolean {
  if (terms.length < 3) return false;
  const positions = terms
    .map((term) => text.toLowerCase().indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right);
  if (positions.length < 3) return false;
  const span = text.slice(positions[0], positions[positions.length - 1]! + 32);
  return /\band\b/i.test(span) && /\bor\b/i.test(span);
}

function extractTechnical(
  fragment: NormalizedListingFragment,
  observationId: string,
): RequirementDraft[] {
  const strength = strengthFor(fragment);
  if (!strength) return [];
  const terms = technicalTerms(fragment.text).filter((term) =>
    technicalTermHasPositiveAssertion(fragment.text, term),
  );
  if (terms.length === 0) return [];
  const use = fitUse(strength);
  const groups = alternativeGroups(fragment.text, terms);
  if (groups.length > 0) {
    const unresolvedBoolean = hasMixedAndOrExpression(fragment.text, terms);
    return groups.map((alternatives) => ({
      category: 'TECHNICAL_SKILL',
      normalizedKey: `technical:${alternatives.join('|')}`,
      value: {
        type: 'TERM',
        value: alternatives[0]!,
        alternatives,
      },
      statement: fragment.text,
      strength: unresolvedBoolean ? 'CONTEXTUAL' : strength,
      polarity: 'REQUIRES',
      ...(unresolvedBoolean
        ? {
            evaluationUse: 'CONTEXT_ONLY' as const,
            actionability: 'REVIEW_ONLY' as const,
          }
        : use),
      fragment,
      observationId,
    }));
  }
  return terms.map((term) => ({
    category: 'TECHNICAL_SKILL',
    normalizedKey: `technical:${term}`,
    value: { type: 'TERM', value: term },
    statement: fragment.text,
    strength,
    polarity: 'REQUIRES',
    ...use,
    fragment,
    observationId,
  }));
}

function extractExperience(
  fragment: NormalizedListingFragment,
  observationId: string,
): RequirementDraft[] {
  const strength = strengthFor(fragment);
  if (!strength || NEGATED_REQUIREMENT.test(fragment.text)) return [];
  const match =
    /\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\+?\s+years?\b/i.exec(fragment.text) ??
    /\b(?:at least\s+)?(\d{1,2})\+?\s+years?\b/i.exec(fragment.text);
  if (!match || !/\bexperience\b/i.test(fragment.text)) return [];
  const minimumYears = Number.parseInt(match[1]!, 10);
  const focus = technicalTerms(fragment.text)[0];
  const hasEquivalent = /\bor equivalent (?:practical )?experience\b/i.test(
    fragment.text,
  );
  return [
    {
      category: 'EXPERIENCE',
      normalizedKey: `experience:${minimumYears}:${focus ?? 'relevant'}`,
      value: {
        type: 'DURATION',
        minimumYears,
        ...(focus ? { focus } : {}),
      },
      statement: fragment.text,
      strength: hasEquivalent ? 'CONTEXTUAL' : strength,
      polarity: 'REQUIRES',
      ...(hasEquivalent
        ? {
            evaluationUse: 'CONTEXT_ONLY' as const,
            actionability: 'REVIEW_ONLY' as const,
          }
        : fitUse(strength)),
      fragment,
      observationId,
    },
  ];
}

function extractLocation(
  fragment: NormalizedListingFragment,
  observationId: string,
): RequirementDraft[] {
  const text = fragment.text.trim();
  const lower = text.toLowerCase();
  const drafts: RequirementDraft[] = [];
  if (
    fragment.structure === 'STRUCTURED_VALUE' &&
    /remote|hybrid|on.?site/.test(lower)
  ) {
    const model = lower.includes('hybrid')
      ? 'hybrid'
      : lower.includes('remote')
        ? 'remote'
        : 'onsite';
    drafts.push({
      category: 'WORK_MODEL',
      normalizedKey: `work-model:${model}`,
      value: { type: 'SCOPE', value: model },
      statement: text,
      strength: 'CONTEXTUAL',
      polarity: 'REQUIRES',
      evaluationUse: 'CONTEXT_ONLY',
      actionability: 'REVIEW_ONLY',
      fragment,
      observationId,
    });
  }
  if (
    /global remote|remote worldwide|remote anywhere(?!\s+except)/i.test(text)
  ) {
    drafts.push({
      category: 'LOCATION',
      normalizedKey: 'location:global',
      value: { type: 'SCOPE', value: 'global' },
      statement: text,
      strength: 'CONTEXTUAL',
      polarity: 'PERMITS',
      evaluationUse: 'CONTEXT_ONLY',
      actionability: 'REVIEW_ONLY',
      fragment,
      observationId,
    });
    return drafts;
  }
  const except = /remote anywhere except\s+([^.;]+)/i.exec(text);
  if (except) {
    drafts.push({
      category: 'LOCATION',
      normalizedKey: `location:excludes:${normalizeKey(except[1]!)}`,
      value: { type: 'SCOPE', value: except[1]!.trim() },
      statement: text,
      strength: 'REQUIRED',
      polarity: 'EXCLUDES',
      ...consequentialUse({ strength: 'REQUIRED', explicit: true }),
      fragment,
      observationId,
    });
  }
  const residence = /\bmust (?:be )?(?:live|reside) in\s+([^.;]+)/i.exec(text);
  if (residence) {
    const scope = residence[1]!.trim();
    drafts.push({
      category: 'RESIDENCY',
      normalizedKey: `residency:${normalizeKey(scope)}`,
      value: { type: 'SCOPE', value: scope },
      statement: text,
      strength: 'REQUIRED',
      polarity: 'REQUIRES',
      ...consequentialUse({ strength: 'REQUIRED', explicit: true }),
      fragment,
      observationId,
    });
  }
  const based = /\bmust (?:be )?(?:based|located) in\s+([^.;]+)/i.exec(text);
  if (based) {
    const scope = based[1]!.trim();
    drafts.push({
      category: 'LOCATION',
      normalizedKey: `location:${normalizeKey(scope)}`,
      value: /\bor\b/i.test(scope)
        ? {
            type: 'TERM',
            value: scope.split(/\bor\b/i)[0]!.trim(),
            alternatives: scope.split(/\bor\b/i).map((item) => item.trim()),
          }
        : { type: 'SCOPE', value: scope },
      statement: text,
      strength: 'REQUIRED',
      polarity: 'REQUIRES',
      ...consequentialUse({ strength: 'REQUIRED', explicit: true }),
      fragment,
      observationId,
    });
  }
  const timezone =
    /\b(?:UTC|GMT)[+-]\d{1,2}(?:\s*(?:-|–|to)\s*(?:UTC|GMT)[+-]\d{1,2})?\b/i.exec(
      text,
    );
  if (timezone && REQUIRED_CUE.test(text)) {
    drafts.push({
      category: 'TIMEZONE',
      normalizedKey: `timezone:${normalizeKey(timezone[0])}`,
      value: { type: 'SCOPE', value: timezone[0] },
      statement: text,
      strength: 'REQUIRED',
      polarity: 'REQUIRES',
      ...consequentialUse({ strength: 'REQUIRED', explicit: true }),
      fragment,
      observationId,
    });
  }
  return drafts;
}

function extractSponsorshipAndAuthorization(
  fragment: NormalizedListingFragment,
  observationId: string,
): RequirementDraft[] {
  const text = fragment.text;
  const drafts: RequirementDraft[] = [];
  if (
    /\b(?:cannot|can't|unable to|do not|don't) sponsor\b|\bno sponsorship\b|sponsorship (?:is )?not available/i.test(
      text,
    )
  ) {
    drafts.push({
      category: 'SPONSORSHIP',
      normalizedKey: 'sponsorship:unavailable',
      value: { type: 'SCOPE', value: 'unavailable' },
      statement: text,
      strength: 'REQUIRED',
      polarity: 'UNAVAILABLE',
      ...consequentialUse({ strength: 'REQUIRED', explicit: true }),
      fragment,
      observationId,
    });
  } else if (
    /\b(?:visa )?sponsorship (?:is )?(?:available|provided)|\bwe (?:can|will) sponsor\b/i.test(
      text,
    )
  ) {
    drafts.push({
      category: 'SPONSORSHIP',
      normalizedKey: 'sponsorship:available',
      value: { type: 'SCOPE', value: 'available' },
      statement: text,
      strength: 'CONTEXTUAL',
      polarity: 'PERMITS',
      evaluationUse: 'CONTEXT_ONLY',
      actionability: 'REVIEW_ONLY',
      fragment,
      observationId,
    });
  }
  if (
    /\b(?:must (?:be )?|required to be )(?:legally )?(?:authorized|eligible) to work\b|\bwork authorization (?:is )?required\b/i.test(
      text,
    )
  ) {
    const jurisdiction = /\b(?:work|employment) in\s+([^.;]+)/i.exec(text)?.[1];
    drafts.push({
      category: 'WORK_AUTHORIZATION',
      normalizedKey: `work-authorization:${jurisdiction ? normalizeKey(jurisdiction) : 'explicit'}`,
      value: jurisdiction
        ? { type: 'SCOPE', value: jurisdiction.trim() }
        : { type: 'TEXT', value: text },
      statement: text,
      strength: 'REQUIRED',
      polarity: 'REQUIRES',
      ...consequentialUse({ strength: 'REQUIRED', explicit: true }),
      fragment,
      observationId,
    });
  }
  return drafts;
}

function extractEducationLanguageCertification(
  fragment: NormalizedListingFragment,
  observationId: string,
): RequirementDraft[] {
  const text = fragment.text;
  const strength = strengthFor(fragment);
  const drafts: RequirementDraft[] = [];
  const noDegree =
    /\b(?:no degree required|degree (?:is )?not required)\b/i.exec(text);
  const degree =
    noDegree ??
    /\b(bachelor(?:'s)?|master(?:'s)?|ph\.?d\.?|(?:college|university) degree)\b/i.exec(
      text,
    ) ??
    /\b(degree in [a-z][a-z &-]{1,50}?)(?=\s+or equivalent|[.,;]|$)/i.exec(
      text,
    );
  if (degree) {
    if (/\bno degree required\b|\bdegree (?:is )?not required\b/i.test(text)) {
      drafts.push({
        category: 'EDUCATION',
        normalizedKey: 'education:degree:not-required',
        value: { type: 'TEXT', value: 'degree not required' },
        statement: text,
        strength: 'CONTEXTUAL',
        polarity: 'PERMITS',
        evaluationUse: 'CONTEXT_ONLY',
        actionability: 'REVIEW_ONLY',
        fragment,
        observationId,
      });
    } else if (strength) {
      const hasEquivalent = /\bor equivalent (?:practical )?experience\b/i.test(
        text,
      );
      drafts.push({
        category: 'EDUCATION',
        normalizedKey: `education:${normalizeKey(degree[0])}`,
        value: { type: 'TERM', value: degree[0].toLowerCase() },
        statement: text,
        strength: hasEquivalent ? 'CONTEXTUAL' : strength,
        polarity: 'REQUIRES',
        ...(hasEquivalent
          ? {
              evaluationUse: 'CONTEXT_ONLY' as const,
              actionability: 'REVIEW_ONLY' as const,
            }
          : consequentialUse({ strength, explicit: true })),
        fragment,
        observationId,
      });
    }
  }
  for (const language of SPOKEN_LANGUAGES) {
    const languagePattern = new RegExp(
      `(?:fluent|proficient|professional|business[- ]level|native).{0,20}\\b${language}\\b|\\b${language}\\b.{0,20}(?:required|fluency|proficiency)`,
      'i',
    );
    if (!languagePattern.test(text)) continue;
    const languageStrength = PREFERRED_CUE.test(text)
      ? 'PREFERRED'
      : 'REQUIRED';
    drafts.push({
      category: 'LANGUAGE',
      normalizedKey: `language:${language}`,
      value: { type: 'TERM', value: language },
      statement: text,
      strength: languageStrength,
      polarity: 'REQUIRES',
      ...consequentialUse({ strength: languageStrength, explicit: true }),
      fragment,
      observationId,
    });
  }
  const certificationTerms = [
    ...new Set(
      [...text.matchAll(/\b(AWS Certified[^,.;]*|PMP|CISSP|CPA)\b/gi)].map(
        (match) => match[1]!.trim(),
      ),
    ),
  ];
  const certificationAlternative =
    certificationTerms.length > 1 && /\bor\b/i.test(text);
  const certification =
    certificationTerms[0] ??
    /\b([A-Z][A-Za-z0-9+.-]*(?: [A-Z][A-Za-z0-9+.-]*){0,3} certification)\b/.exec(
      text,
    )?.[1];
  if (certification && strength && !NEGATED_REQUIREMENT.test(text)) {
    const alternatives = certificationTerms
      .map((item) => item.toLowerCase())
      .sort();
    const value = certificationAlternative
      ? alternatives[0]!
      : certification.trim();
    drafts.push({
      category: 'CERTIFICATION',
      normalizedKey: `certification:${certificationAlternative ? alternatives.map(normalizeKey).join('|') : normalizeKey(value)}`,
      value: certificationAlternative
        ? { type: 'TERM', value, alternatives }
        : { type: 'TERM', value },
      statement: text,
      strength: certificationAlternative ? 'CONTEXTUAL' : strength,
      polarity: 'REQUIRES',
      ...(certificationAlternative
        ? {
            evaluationUse: 'CONTEXT_ONLY' as const,
            actionability: 'REVIEW_ONLY' as const,
          }
        : consequentialUse({ strength, explicit: true })),
      fragment,
      observationId,
    });
  }
  return drafts;
}

function extractDomain(
  fragment: NormalizedListingFragment,
  observationId: string,
): RequirementDraft[] {
  const strength = strengthFor(fragment);
  if (!strength || NEGATED_REQUIREMENT.test(fragment.text)) return [];
  return DOMAIN_TERMS.filter((term) => containsTerm(fragment.text, term)).map(
    (term) => ({
      category: 'DOMAIN_EXPERIENCE',
      normalizedKey: `domain:${normalizeKey(term)}`,
      value: { type: 'TERM', value: term },
      statement: fragment.text,
      strength,
      polarity: 'REQUIRES',
      ...fitUse(strength),
      fragment,
      observationId,
    }),
  );
}

function extractStructuredContext(
  fragment: NormalizedListingFragment,
  observationId: string,
): RequirementDraft[] {
  if (fragment.structure !== 'STRUCTURED_VALUE') return [];
  if (fragment.heading === 'Job title') {
    const seniority = /\b(intern|junior|senior|staff|principal|lead)\b/i.exec(
      fragment.text,
    );
    if (seniority) {
      const value = seniority[1]!.toLowerCase();
      return [
        {
          category: 'SENIORITY',
          normalizedKey: `seniority:${value}`,
          value: { type: 'TERM', value },
          statement: fragment.text,
          strength: 'REQUIRED',
          polarity: 'REQUIRES',
          evaluationUse: 'FIT',
          actionability: 'FIT_SIGNAL_SAFE',
          fragment,
          observationId,
        },
      ];
    }
  }
  if (fragment.kind === 'EMPLOYMENT') {
    const value = /part/i.test(fragment.text)
      ? 'part-time'
      : /contract/i.test(fragment.text)
        ? 'contract'
        : /intern/i.test(fragment.text)
          ? 'internship'
          : /temporary/i.test(fragment.text)
            ? 'temporary'
            : /full/i.test(fragment.text)
              ? 'full-time'
              : fragment.text.toLowerCase();
    return [
      {
        category: 'EMPLOYMENT_TYPE',
        normalizedKey: `employment:${normalizeKey(value)}`,
        value: { type: 'TERM', value },
        statement: fragment.text,
        strength: 'CONTEXTUAL',
        polarity: 'REQUIRES',
        evaluationUse: 'CONTEXT_ONLY',
        actionability: 'REVIEW_ONLY',
        fragment,
        observationId,
      },
    ];
  }
  if (fragment.kind === 'COMPENSATION') {
    return [
      {
        category: 'COMPENSATION',
        normalizedKey: `compensation:${hash(fragment.text).slice(0, 16)}`,
        value: { type: 'TEXT', value: fragment.text },
        statement: fragment.text,
        strength: 'CONTEXTUAL',
        polarity: 'PERMITS',
        evaluationUse: 'CONTEXT_ONLY',
        actionability: 'REVIEW_ONLY',
        fragment,
        observationId,
      },
    ];
  }
  return [];
}

function extractTextContext(
  fragment: NormalizedListingFragment,
  observationId: string,
): RequirementDraft[] {
  if (
    fragment.structure !== 'STRUCTURED_VALUE' &&
    /\b(?:salary|compensation|pay range|base pay)\b/i.test(fragment.text) &&
    /(?:[$€£]\s?\d|\b(?:USD|EUR|GBP)\b)/i.test(fragment.text)
  ) {
    return [
      {
        category: 'COMPENSATION',
        normalizedKey: `compensation:${hash(fragment.text).slice(0, 16)}`,
        value: { type: 'TEXT', value: fragment.text },
        statement: fragment.text,
        strength: 'CONTEXTUAL',
        polarity: 'PERMITS',
        evaluationUse: 'CONTEXT_ONLY',
        actionability: 'REVIEW_ONLY',
        fragment,
        observationId,
      },
    ];
  }
  return [];
}

function draftsFor(
  fragment: NormalizedListingFragment,
  observationId: string,
): RequirementDraft[] {
  return [
    ...extractTechnical(fragment, observationId),
    ...extractExperience(fragment, observationId),
    ...extractLocation(fragment, observationId),
    ...extractSponsorshipAndAuthorization(fragment, observationId),
    ...extractEducationLanguageCertification(fragment, observationId),
    ...extractDomain(fragment, observationId),
    ...extractStructuredContext(fragment, observationId),
    ...extractTextContext(fragment, observationId),
  ];
}

function contradictionSignalsFor(
  fragment: NormalizedListingFragment,
  observationId: string,
): RequirementContradictionSignal[] {
  const signals: RequirementContradictionSignal[] = technicalTerms(
    fragment.text,
  )
    .filter((term) => technicalTermHasNegatedAssertion(fragment.text, term))
    .map((term) => ({
      category: 'TECHNICAL_SKILL' as const,
      normalizedKey: `technical:${term}`,
      fragment,
      observationId,
    }));
  if (
    /\b(?:may|might|could) sponsor\b|sponsorship may be available/i.test(
      fragment.text,
    )
  ) {
    signals.push({
      category: 'SPONSORSHIP',
      fragment,
      observationId,
    });
  }
  return signals;
}

function neutralizeContradictions(
  drafts: readonly RequirementDraft[],
  signals: readonly RequirementContradictionSignal[],
): RequirementDraft[] {
  const contradictoryCategories = new Set<RequirementCategory>();
  for (const category of ['SPONSORSHIP', 'EDUCATION'] as const) {
    const polarities = new Set(
      drafts
        .filter((draft) => draft.category === category)
        .map((draft) => draft.polarity),
    );
    if (polarities.size > 1) contradictoryCategories.add(category);
  }
  const isContradictory = (draft: RequirementDraft) =>
    (contradictoryCategories.has(draft.category) &&
      draft.strength === 'REQUIRED') ||
    signals.some(
      (signal) =>
        signal.category === draft.category &&
        (!signal.normalizedKey || signal.normalizedKey === draft.normalizedKey),
    );
  const neutralized: RequirementDraft[] = drafts.map((draft) =>
    isContradictory(draft)
      ? {
          ...draft,
          strength: 'CONTEXTUAL',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY' as const,
        }
      : draft,
  );
  const contradictionProvenance = signals.flatMap((signal) => {
    const matching = neutralized.find(
      (draft) =>
        draft.category === signal.category &&
        (!signal.normalizedKey || draft.normalizedKey === signal.normalizedKey),
    );
    return matching
      ? [
          {
            ...matching,
            fragment: signal.fragment,
            observationId: signal.observationId,
          },
        ]
      : [];
  });
  return [...neutralized, ...contradictionProvenance];
}

const HARD_CONSTRAINT_CATEGORIES = new Set<RequirementCategory>([
  'EDUCATION',
  'LOCATION',
  'RESIDENCY',
  'TIMEZONE',
  'WORK_AUTHORIZATION',
  'SPONSORSHIP',
  'LANGUAGE',
  'CERTIFICATION',
]);

function hasUnresolvedHardConstraintExpression(
  draft: RequirementDraft,
): boolean {
  if (/\bor equivalent (?:practical )?experience\b/i.test(draft.statement)) {
    return true;
  }
  if (/\bor\b/i.test(draft.statement)) {
    const representedLocationAlternative =
      draft.category === 'LOCATION' &&
      draft.value.type === 'TERM' &&
      draft.value.alternatives &&
      draft.value.alternatives.length > 1 &&
      !/\band\b/i.test(draft.statement);
    return !representedLocationAlternative;
  }
  return false;
}

function categoryAllowsHardConstraint(draft: RequirementDraft): boolean {
  switch (draft.category) {
    case 'LOCATION':
      return (
        /^location:/.test(draft.normalizedKey) &&
        ['REQUIRES', 'EXCLUDES'].includes(draft.polarity)
      );
    case 'RESIDENCY':
      return (
        /^residency:/.test(draft.normalizedKey) &&
        /\bmust (?:be )?(?:live|reside) in\b/i.test(draft.statement)
      );
    case 'TIMEZONE':
      return /\b(?:UTC|GMT)[+-]\d{1,2}/i.test(draft.statement);
    case 'WORK_AUTHORIZATION':
      return /authorized|eligible|work authorization/i.test(draft.statement);
    case 'SPONSORSHIP':
      return (
        draft.polarity === 'UNAVAILABLE' &&
        /cannot|can't|unable to|no sponsorship|not available/i.test(
          draft.statement,
        )
      );
    case 'LANGUAGE':
      return /^language:/.test(draft.normalizedKey);
    case 'EDUCATION':
      return (
        /^education:/.test(draft.normalizedKey) &&
        !NEGATED_REQUIREMENT.test(draft.statement)
      );
    case 'CERTIFICATION':
      return (
        /^certification:/.test(draft.normalizedKey) &&
        !NEGATED_REQUIREMENT.test(draft.statement)
      );
    default:
      return false;
  }
}

function enforceHardConstraintSafety(
  drafts: readonly RequirementDraft[],
): RequirementDraft[] {
  return drafts.map((draft) => {
    if (draft.actionability !== 'HARD_CONSTRAINT_SAFE') return draft;
    const assertionBasisIsExplicit = [
      'STRUCTURED_VALUE',
      'LIST_ITEM',
      'PROSE',
    ].includes(draft.fragment.structure);
    const confidence = draft.strength === 'CONTEXTUAL' ? 'MODERATE' : 'HIGH';
    const safe =
      HARD_CONSTRAINT_CATEGORIES.has(draft.category) &&
      draft.strength === 'REQUIRED' &&
      draft.evaluationUse === 'ELIGIBILITY' &&
      assertionBasisIsExplicit &&
      confidence === 'HIGH' &&
      Boolean(draft.observationId && draft.fragment.id) &&
      !NEGATED_REQUIREMENT.test(draft.statement) &&
      !hasUnresolvedHardConstraintExpression(draft) &&
      categoryAllowsHardConstraint(draft);
    return safe
      ? draft
      : {
          ...draft,
          strength: 'CONTEXTUAL',
          evaluationUse: 'CONTEXT_ONLY',
          actionability: 'REVIEW_ONLY',
        };
  });
}

function deduplicateDrafts(
  drafts: readonly RequirementDraft[],
): RequirementDraft[][] {
  const groups = new Map<string, RequirementDraft[]>();
  for (const draft of drafts) {
    const key = JSON.stringify([
      draft.category,
      draft.normalizedKey,
      draft.value,
      draft.strength,
      draft.polarity,
      draft.evaluationUse,
      draft.actionability,
    ]);
    const group = groups.get(key) ?? [];
    group.push(draft);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function strongest(drafts: readonly RequirementDraft[]): RequirementDraft {
  const order: Record<RequirementStrength, number> = {
    REQUIRED: 0,
    PREFERRED: 1,
    CONTEXTUAL: 2,
  };
  return [...drafts].sort(
    (left, right) => order[left.strength] - order[right.strength],
  )[0]!;
}

function canonicalRequirement(input: {
  readonly setId: string;
  readonly snapshotId: SnapshotId;
  readonly drafts: readonly RequirementDraft[];
  readonly createdAt: Date;
  readonly extractorVersion: string;
}): { requirement: CanonicalRequirement; provenance: RequirementProvenance[] } {
  const selected = strongest(input.drafts);
  const semantic = {
    category: selected.category,
    normalizedKey: selected.normalizedKey,
    value: selected.value,
    strength: selected.strength,
    polarity: selected.polarity,
    evaluationUse: selected.evaluationUse,
    actionability: selected.actionability,
  };
  const canonicalHash = hash(semantic);
  const id = requirementId(shortId('req', [input.setId, canonicalHash]));
  const requirement: CanonicalRequirement = {
    id,
    requirementSetId: requirementSetId(input.setId),
    category: selected.category,
    normalizedKey: selected.normalizedKey,
    value: selected.value,
    statement: selected.statement,
    strength: selected.strength,
    polarity: selected.polarity,
    assertionBasis:
      selected.fragment.structure === 'STRUCTURED_VALUE'
        ? 'EXPLICIT_STRUCTURED'
        : 'EXPLICIT_TEXT',
    evaluationUse: selected.evaluationUse,
    actionability: selected.actionability,
    extractionConfidence:
      selected.strength === 'CONTEXTUAL' ? 'MODERATE' : 'HIGH',
    extractorId: 'deterministic-requirement-extractor',
    extractorVersion: input.extractorVersion,
    canonicalHash,
    createdAt: input.createdAt,
  };
  const seen = new Set<string>();
  const provenance = input.drafts
    .filter((draft) => {
      const key = `${draft.observationId}:${draft.fragment.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_PROVENANCE_PER_REQUIREMENT)
    .map((draft) => {
      const excerptHash = hash(draft.fragment.text);
      return {
        id: requirementProvenanceId(
          shortId('rqp', [
            id,
            draft.observationId,
            draft.fragment.id,
            excerptHash,
            V2_2_LOCATOR_VERSION,
          ]),
        ),
        requirementId: id,
        sourceObservationId: draft.observationId as SourceObservationId,
        snapshotId: input.snapshotId,
        sourceFieldPath: draft.fragment.sourceFieldPath,
        normalizedSection: draft.fragment.kind.toLowerCase(),
        normalizedFragmentId: draft.fragment.id,
        excerpt: draft.fragment.text,
        excerptHash,
        locatorVersion: V2_2_LOCATOR_VERSION,
        extractorId: requirement.extractorId,
        extractorVersion: requirement.extractorVersion,
      } satisfies RequirementProvenance;
    });
  return { requirement, provenance };
}

export function fingerprintV2RequirementInput(input: {
  readonly snapshotFingerprint: string;
  readonly observations: readonly V2RequirementObservation[];
  readonly pipelineVersion?: string;
  readonly deterministicExtractorVersion?: string;
  readonly identityContext?: unknown;
}): string {
  return hash({
    snapshotFingerprint: input.snapshotFingerprint,
    documentVersion: NORMALIZED_LISTING_DOCUMENT_VERSION,
    pipelineVersion: input.pipelineVersion ?? V2_2_PIPELINE_VERSION,
    deterministicExtractorVersion:
      input.deterministicExtractorVersion ??
      V2_3_1_DETERMINISTIC_EXTRACTOR_VERSION,
    locatorVersion: V2_2_LOCATOR_VERSION,
    ...(input.identityContext === undefined
      ? {}
      : { identityContext: input.identityContext }),
    observations: input.observations
      .map((observation) => ({
        fingerprint: observation.fingerprint,
        document: observation.document,
      }))
      .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint)),
  });
}

export function buildV2RequirementSet(
  snapshot: V2RequirementSnapshot,
  observations: readonly V2RequirementObservation[],
  options: {
    readonly pipelineVersion?: string;
    readonly deterministicExtractorVersion?: string;
    readonly createdAt?: Date;
    readonly identityContext?: unknown;
  } = {},
): CompleteRequirementSet {
  if (observations.length === 0) {
    throw new TypeError(
      'Deterministic requirement extraction requires a normalized observation',
    );
  }
  const pipelineVersion = options.pipelineVersion ?? V2_2_PIPELINE_VERSION;
  const deterministicExtractorVersion =
    options.deterministicExtractorVersion ??
    V2_3_1_DETERMINISTIC_EXTRACTOR_VERSION;
  const createdAt = options.createdAt ?? new Date();
  const inputFingerprint = fingerprintV2RequirementInput({
    snapshotFingerprint: snapshot.fingerprint,
    observations,
    pipelineVersion,
    deterministicExtractorVersion,
    identityContext: options.identityContext,
  });
  const setId = requirementSetId(
    shortId('rqs', [snapshot.id, pipelineVersion, inputFingerprint]),
  );
  const retainedObservations = [...observations]
    .sort(
      (left, right) =>
        left.fingerprint.localeCompare(right.fingerprint) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, MAX_REQUIREMENT_OBSERVATIONS);
  const candidateFragments = retainedObservations.flatMap((observation) =>
    observation.document.fragments.map((fragment) => ({
      fragment,
      observationId: observation.id,
      observationFingerprint: observation.fingerprint,
    })),
  );
  const retainedFragments = candidateFragments
    .sort(
      (left, right) =>
        EXTRACTION_PRIORITY[left.fragment.kind] -
          EXTRACTION_PRIORITY[right.fragment.kind] ||
        left.observationFingerprint.localeCompare(
          right.observationFingerprint,
        ) ||
        left.fragment.order - right.fragment.order ||
        left.fragment.id.localeCompare(right.fragment.id),
    )
    .slice(0, MAX_EXTRACTION_FRAGMENTS);
  const extractedDrafts = retainedFragments.flatMap(
    ({ fragment, observationId }) => draftsFor(fragment, observationId),
  );
  const contradictionSignals = retainedFragments.flatMap(
    ({ fragment, observationId }) =>
      contradictionSignalsFor(fragment, observationId),
  );
  const allDrafts = enforceHardConstraintSafety(
    neutralizeContradictions(extractedDrafts, contradictionSignals),
  );
  const draftGroups = deduplicateDrafts(allDrafts);
  const truncated =
    observations.length > retainedObservations.length ||
    candidateFragments.length > retainedFragments.length ||
    observations.some((observation) => observation.document.truncated) ||
    draftGroups.length > MAX_CANONICAL_REQUIREMENTS ||
    draftGroups.some(
      (drafts) =>
        new Set(
          drafts.map((draft) => `${draft.observationId}:${draft.fragment.id}`),
        ).size > MAX_PROVENANCE_PER_REQUIREMENT,
    );
  const requirements = draftGroups
    .slice(0, MAX_CANONICAL_REQUIREMENTS)
    .map((drafts) => {
      return canonicalRequirement({
        setId,
        snapshotId: snapshot.id as SnapshotId,
        drafts,
        createdAt,
        extractorVersion: deterministicExtractorVersion,
      });
    });
  return {
    set: {
      id: setId,
      snapshotId: snapshot.id as SnapshotId,
      modelVersion: 'requirement-set-v1',
      inputFingerprint,
      extractorPipelineVersion: pipelineVersion,
      deterministicExtractorVersion,
      status: truncated ? 'PARTIAL' : 'COMPLETE',
      deterministicStatus: 'SUCCEEDED',
      assistedStatus: 'NOT_REQUESTED',
      createdAt,
    },
    requirements,
  };
}
