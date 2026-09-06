import {
  REQUIREMENT_ACTIONABILITIES,
  REQUIREMENT_CATEGORIES,
  REQUIREMENT_EVALUATION_USES,
  REQUIREMENT_POLARITIES,
  REQUIREMENT_STRENGTHS,
} from '@oca/domain';

import { documentFor } from './harness.js';
import type {
  ExpectedRequirementSemantic,
  RequirementEvaluationCase,
} from './types.js';

const REQUIRED_COVERAGE_TAGS = [
  'coverage:technical-required',
  'coverage:technical-preferred',
  'coverage:technical-contextual',
  'coverage:technology-alternatives',
  'coverage:cloud-alternatives',
  'coverage:unsupported-technology',
  'coverage:experience-3-plus',
  'coverage:experience-at-least-5',
  'coverage:experience-range',
  'coverage:experience-equivalent',
  'coverage:experience-vague',
  'coverage:experience-none',
  'coverage:seniority-junior',
  'coverage:seniority-mid',
  'coverage:seniority-senior',
  'coverage:seniority-staff-principal',
  'coverage:onsite',
  'coverage:hybrid',
  'coverage:remote',
  'coverage:global-remote',
  'coverage:country-restricted-remote',
  'coverage:multi-country',
  'coverage:residency',
  'coverage:timezone',
  'coverage:authorization-required',
  'coverage:sponsorship-available',
  'coverage:sponsorship-unavailable',
  'coverage:sponsorship-unstated',
  'coverage:sponsorship-ambiguous',
  'coverage:sponsorship-contradiction',
  'coverage:degree-required',
  'coverage:degree-preferred',
  'coverage:degree-equivalent',
  'coverage:no-degree',
  'coverage:language-required',
  'coverage:language-preferred',
  'coverage:programming-not-spoken',
  'coverage:certification-required',
  'coverage:certification-preferred',
  'coverage:alternative-certification',
  'coverage:employment-full-time',
  'coverage:employment-part-time',
  'coverage:employment-contract',
  'coverage:employment-internship',
  'coverage:employment-temporary',
  'coverage:specialization-backend',
  'coverage:specialization-frontend',
  'coverage:specialization-platform',
  'coverage:specialization-data',
  'coverage:domain-required',
  'coverage:domain-preferred',
  'coverage:compensation-structured',
  'coverage:compensation-prose',
  'coverage:compensation-malformed',
  'coverage:negation-near-positive',
  'coverage:required-not-required',
  'coverage:mixed-and-or',
  'coverage:title-only',
  'coverage:empty-body',
  'coverage:malformed-provider',
  'coverage:duplicate-provider-representation',
  'coverage:fragment-truncation',
  'coverage:document-truncation',
  'coverage:unsupported-metadata',
  'coverage:metadata-field',
  'coverage:multiple-provenance',
] as const;

const PRIVATE_MARKERS = [
  /candidateId/i,
  /candidate_id/i,
  /candidateClaims/i,
  /candidateEvidence/i,
] as const;

function semanticValueIsValid(semantic: ExpectedRequirementSemantic): boolean {
  const value = semantic.value;
  if (value.type === 'DURATION') {
    return (
      Number.isFinite(value.minimumYears) &&
      value.minimumYears >= 0 &&
      (!value.focus || value.focus.trim().length > 0)
    );
  }
  if (value.value.trim().length === 0) return false;
  return (
    value.type !== 'TERM' ||
    value.alternatives === undefined ||
    (value.alternatives.length > 0 &&
      value.alternatives.every((item) => item.trim().length > 0))
  );
}

function semanticIsValid(semantic: ExpectedRequirementSemantic): boolean {
  const enumValid =
    REQUIREMENT_CATEGORIES.includes(semantic.category) &&
    REQUIREMENT_STRENGTHS.includes(semantic.strength) &&
    REQUIREMENT_POLARITIES.includes(semantic.polarity) &&
    REQUIREMENT_EVALUATION_USES.includes(semantic.evaluationUse) &&
    REQUIREMENT_ACTIONABILITIES.includes(semantic.actionability);
  const hardConstraintValid =
    semantic.actionability !== 'HARD_CONSTRAINT_SAFE' ||
    (semantic.strength === 'REQUIRED' &&
      semantic.evaluationUse === 'ELIGIBILITY');
  return (
    enumValid &&
    hardConstraintValid &&
    semantic.normalizedKey.trim().length > 0 &&
    semanticValueIsValid(semantic)
  );
}

export function validateRequirementCorpus(
  cases: readonly RequirementEvaluationCase[],
): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const coverage = new Set<string>();
  const equivalence = new Map<string, Set<string>>();

  for (const testCase of cases) {
    if (ids.has(testCase.id)) errors.push(`duplicate case id: ${testCase.id}`);
    ids.add(testCase.id);
    if (
      !testCase.id.trim() ||
      !testCase.description.trim() ||
      !testCase.rationale.trim()
    ) {
      errors.push(
        `${testCase.id}: id, description, and rationale must be non-empty`,
      );
    }
    if (testCase.tags.length === 0)
      errors.push(`${testCase.id}: tags are required`);
    for (const tag of testCase.tags) coverage.add(tag);
    if (testCase.consequential && !testCase.tags.includes('safety')) {
      errors.push(`${testCase.id}: consequential cases require the safety tag`);
    }

    try {
      const document = documentFor(testCase);
      if (document.sourceExternalId !== testCase.id) {
        errors.push(`${testCase.id}: normalized document identity is unstable`);
      }
    } catch (error) {
      errors.push(
        `${testCase.id}: provider fixture is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const semanticExpectations = new Set<string>();
    const dispositions = new Map<string, Set<string>>();
    for (const expectation of testCase.expected) {
      const selector =
        expectation.disposition === 'MUST_EXTRACT'
          ? expectation.semantic
          : expectation.match;
      const selectorKey = `${selector.category}:${selector.normalizedKey ?? '*'}`;
      const selectorDispositions = dispositions.get(selectorKey) ?? new Set();
      selectorDispositions.add(expectation.disposition);
      dispositions.set(selectorKey, selectorDispositions);
      if (expectation.disposition !== 'MUST_EXTRACT') continue;
      if (!semanticIsValid(expectation.semantic)) {
        errors.push(`${testCase.id}: invalid expected semantic ${selectorKey}`);
      }
      const semanticKey = JSON.stringify(expectation.semantic);
      if (semanticExpectations.has(semanticKey)) {
        errors.push(
          `${testCase.id}: duplicate semantic expectation ${selectorKey}`,
        );
      }
      semanticExpectations.add(semanticKey);
    }
    for (const [selector, values] of dispositions) {
      if (values.size > 1 && !testCase.tags.includes('contradiction')) {
        errors.push(
          `${testCase.id}: contradictory ground truth for ${selector} requires the contradiction tag`,
        );
      }
    }

    if (testCase.equivalenceGroup) {
      if (testCase.input.kind !== 'PROVIDER_PAYLOAD') {
        errors.push(
          `${testCase.id}: equivalence inputs must be provider payloads`,
        );
      } else {
        const providers =
          equivalence.get(testCase.equivalenceGroup) ?? new Set();
        providers.add(testCase.input.provider);
        equivalence.set(testCase.equivalenceGroup, providers);
      }
    }
  }

  for (const tag of REQUIRED_COVERAGE_TAGS) {
    if (!coverage.has(tag))
      errors.push(`missing required coverage tag: ${tag}`);
  }
  for (const [group, providers] of equivalence) {
    const expected = ['ashby', 'greenhouse', 'lever'];
    if (
      providers.size !== expected.length ||
      expected.some((provider) => !providers.has(provider))
    ) {
      errors.push(
        `${group}: equivalence group must contain Ashby, Lever, and Greenhouse`,
      );
    }
  }

  const serialized = JSON.stringify(cases);
  for (const marker of PRIVATE_MARKERS) {
    if (marker.test(serialized))
      errors.push(`private fixture marker matched ${marker}`);
  }
  return errors.sort();
}
