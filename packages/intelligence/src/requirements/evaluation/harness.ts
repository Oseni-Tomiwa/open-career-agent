import { createHash } from 'node:crypto';

import {
  REQUIREMENT_CATEGORIES,
  type CanonicalRequirement,
  type RequirementCategory,
  type RequirementWithProvenance,
} from '@oca/domain';
import {
  AshbyNormalizer,
  buildListingDocument,
  GreenhouseNormalizer,
  LeverNormalizer,
  NORMALIZED_LISTING_DOCUMENT_VERSION,
  type NormalizedListingDocument,
  type OpportunityNormalizer,
  type SourceOpportunity,
} from '@oca/sources';

import {
  buildV2RequirementSet,
  V2_2_DETERMINISTIC_EXTRACTOR_VERSION,
} from '../v2.js';
import type {
  CorpusExpectation,
  CaseDiagnostic,
  EvaluationIssue,
  ExpectedRequirementSelector,
  ExpectedRequirementSemantic,
  MetricCounts,
  RequirementEvaluationCase,
  RequirementEvaluationReport,
} from './types.js';
import { REQUIREMENT_EVALUATION_CORPUS_VERSION } from './types.js';

const NORMALIZERS: Readonly<Record<string, OpportunityNormalizer>> = {
  ashby: new AshbyNormalizer(),
  lever: new LeverNormalizer(),
  greenhouse: new GreenhouseNormalizer(),
};

const CONSEQUENTIAL_CATEGORIES = new Set<RequirementCategory>([
  'WORK_AUTHORIZATION',
  'SPONSORSHIP',
  'RESIDENCY',
  'LOCATION',
  'TIMEZONE',
  'EDUCATION',
  'CERTIFICATION',
  'LANGUAGE',
]);

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function documentFor(
  testCase: RequirementEvaluationCase,
): NormalizedListingDocument {
  if (testCase.input.kind === 'NORMALIZED_DOCUMENT') {
    return buildListingDocument({
      sourceSystem: testCase.input.sourceSystem,
      sourceExternalId: testCase.id,
      sourceUrl: `https://example.test/corpus/${testCase.id}`,
      fragments: testCase.input.fragments,
    });
  }
  const normalizer = NORMALIZERS[testCase.input.provider];
  if (!normalizer)
    throw new TypeError(
      `Unsupported corpus provider: ${testCase.input.provider}`,
    );
  const record: SourceOpportunity = {
    sourceSystem: testCase.input.provider,
    sourceExternalId: testCase.id,
    sourceUrl: `https://example.test/corpus/${testCase.id}`,
    rawPayload: JSON.stringify(testCase.input.payload),
    observedAt: new Date('2026-09-06T00:00:00.000Z'),
  };
  return normalizer.normalize(record).document;
}

function semantic(
  requirement: CanonicalRequirement,
): ExpectedRequirementSemantic {
  return {
    category: requirement.category,
    normalizedKey: requirement.normalizedKey,
    value: requirement.value,
    strength: requirement.strength,
    polarity: requirement.polarity,
    evaluationUse: requirement.evaluationUse,
    actionability: requirement.actionability,
  };
}

function semanticSignature(requirement: CanonicalRequirement): string {
  return JSON.stringify(semantic(requirement));
}

function selectorSignature(selector: ExpectedRequirementSelector): string {
  return `${selector.category}:${selector.normalizedKey ?? '*'}`;
}

function matchesSelector(
  requirement: CanonicalRequirement,
  selector: ExpectedRequirementSelector,
): boolean {
  return (
    requirement.category === selector.category &&
    (!selector.normalizedKey ||
      requirement.normalizedKey === selector.normalizedKey)
  );
}

function metric(
  counts: Omit<MetricCounts, 'precision' | 'recall'>,
): MetricCounts {
  const precisionDenominator = counts.truePositive + counts.falsePositive;
  const recallDenominator = counts.truePositive + counts.falseNegative;
  return {
    ...counts,
    precision:
      precisionDenominator === 0
        ? null
        : counts.truePositive / precisionDenominator,
    recall:
      recallDenominator === 0 ? null : counts.truePositive / recallDenominator,
  };
}

function issue(
  testCase: RequirementEvaluationCase,
  kind: EvaluationIssue['kind'],
  selector: ExpectedRequirementSelector,
  detail: string,
): EvaluationIssue {
  return {
    caseId: testCase.id,
    kind,
    category: selector.category,
    ...(selector.normalizedKey
      ? { normalizedKey: selector.normalizedKey }
      : {}),
    detail,
  };
}

function provenanceIssues(input: {
  readonly testCase: RequirementEvaluationCase;
  readonly expectation: Extract<
    CorpusExpectation,
    { disposition: 'MUST_EXTRACT' }
  >;
  readonly actual: RequirementWithProvenance;
  readonly document: NormalizedListingDocument;
  readonly observationId: string;
}): EvaluationIssue[] {
  const { testCase, expectation, actual, document, observationId } = input;
  const failures: string[] = [];
  if (actual.provenance.length === 0) failures.push('no provenance links');
  if (
    expectation.provenance?.minimumLinks !== undefined &&
    actual.provenance.length < expectation.provenance.minimumLinks
  ) {
    failures.push(
      `expected at least ${expectation.provenance.minimumLinks} provenance links`,
    );
  }
  if (
    expectation.provenance?.exactLinks !== undefined &&
    actual.provenance.length !== expectation.provenance.exactLinks
  ) {
    failures.push(
      `expected exactly ${expectation.provenance.exactLinks} provenance links`,
    );
  }
  for (const provenance of actual.provenance) {
    const fragment = document.fragments.find(
      (item) => item.id === provenance.normalizedFragmentId,
    );
    if (provenance.sourceObservationId !== observationId)
      failures.push('observation lineage mismatch');
    if (!fragment) {
      failures.push('fragment identity does not resolve');
      continue;
    }
    if (provenance.sourceFieldPath !== fragment.sourceFieldPath)
      failures.push('fragment source path mismatch');
    if (provenance.excerpt !== fragment.text)
      failures.push('excerpt does not equal normalized fragment');
    if (provenance.excerptHash !== hash(provenance.excerpt))
      failures.push('excerpt hash mismatch');
  }
  const expected = expectation.provenance;
  if (
    expected?.sourceFieldPath &&
    !actual.provenance.some(
      (item) => item.sourceFieldPath === expected.sourceFieldPath,
    )
  ) {
    failures.push(`missing expected source path ${expected.sourceFieldPath}`);
  }
  if (
    expected?.supportText &&
    !actual.provenance.some((item) =>
      item.excerpt.includes(expected.supportText!),
    )
  ) {
    failures.push('no excerpt contains expected supporting text');
  }
  return [...new Set(failures)].map((detail) =>
    issue(testCase, 'PROVENANCE_MISMATCH', expectation.semantic, detail),
  );
}

function hardConstraintIsIntrinsicallySafe(
  testCase: RequirementEvaluationCase,
  actual: RequirementWithProvenance,
  matchedExpectation:
    Extract<CorpusExpectation, { disposition: 'MUST_EXTRACT' }> | undefined,
): boolean {
  const requirement = actual.requirement;
  return (
    CONSEQUENTIAL_CATEGORIES.has(requirement.category) &&
    requirement.strength === 'REQUIRED' &&
    requirement.evaluationUse === 'ELIGIBILITY' &&
    requirement.extractionConfidence === 'HIGH' &&
    requirement.assertionBasis !== 'INTERPRETED' &&
    actual.provenance.length > 0 &&
    matchedExpectation?.semantic.actionability === 'HARD_CONSTRAINT_SAFE' &&
    !testCase.tags.includes('contradiction')
  );
}

export function evaluateRequirementCorpus(
  cases: readonly RequirementEvaluationCase[],
): RequirementEvaluationReport {
  const mutableMetrics = new Map<
    RequirementCategory,
    { truePositive: number; falsePositive: number; falseNegative: number }
  >(
    REQUIREMENT_CATEGORIES.map((category) => [
      category,
      { truePositive: 0, falsePositive: 0, falseNegative: 0 },
    ]),
  );
  const mismatchCounts = {
    strength: 0,
    polarity: 0,
    evaluationUse: 0,
    actionability: 0,
    structuredValue: 0,
  };
  const issues: EvaluationIssue[] = [];
  const caseDiagnostics: CaseDiagnostic[] = [];
  const categoryCounts = new Map<
    RequirementCategory,
    { expected: number; actual: number }
  >(
    REQUIREMENT_CATEGORIES.map((category) => [
      category,
      { expected: 0, actual: 0 },
    ]),
  );
  const equivalence = new Map<
    string,
    Array<{ caseId: string; signatures: readonly string[] }>
  >();
  const caseSemantics = new Map<
    string,
    { expected: readonly string[]; actual: readonly string[] }
  >();

  for (const testCase of cases) {
    const issueStart = issues.length;
    const document = documentFor(testCase);
    const observationId = `observation-${testCase.id}`;
    const artifact = buildV2RequirementSet(
      {
        id: `snapshot-${testCase.id}`,
        fingerprint: `snapshot-fingerprint-${testCase.id}`,
      },
      [
        {
          id: observationId,
          fingerprint: `observation-fingerprint-${testCase.id}`,
          document,
        },
      ],
      { createdAt: new Date('2026-09-06T00:00:00.000Z') },
    );
    if (
      testCase.expectedDocumentTruncated !== undefined &&
      document.truncated !== testCase.expectedDocumentTruncated
    ) {
      issues.push(
        issue(
          testCase,
          'DOCUMENT_STATUS_MISMATCH',
          { category: 'OTHER' },
          `document truncated: expected ${testCase.expectedDocumentTruncated}, actual ${document.truncated}`,
        ),
      );
    }
    if (
      testCase.expectedSetStatus !== undefined &&
      artifact.set.status !== testCase.expectedSetStatus
    ) {
      issues.push(
        issue(
          testCase,
          'DOCUMENT_STATUS_MISMATCH',
          { category: 'OTHER' },
          `requirement set status: expected ${testCase.expectedSetStatus}, actual ${artifact.set.status}`,
        ),
      );
    }
    const consumed = new Set<number>();
    const allowedUnresolved = new Set<number>();
    const matchedByExpectation = new Map<
      CorpusExpectation,
      RequirementWithProvenance
    >();

    for (const expectation of testCase.expected) {
      if (expectation.disposition === 'MUST_EXTRACT') {
        categoryCounts.get(expectation.semantic.category)!.expected += 1;
      }
    }
    for (const actual of artifact.requirements) {
      categoryCounts.get(actual.requirement.category)!.actual += 1;
    }

    for (const expectation of testCase.expected) {
      if (expectation.disposition !== 'MUST_EXTRACT') continue;
      const index = artifact.requirements.findIndex(
        (actual, candidateIndex) =>
          !consumed.has(candidateIndex) &&
          matchesSelector(actual.requirement, expectation.semantic),
      );
      const counts = mutableMetrics.get(expectation.semantic.category)!;
      if (index < 0) {
        counts.falseNegative += 1;
        issues.push(
          issue(
            testCase,
            'MISSING',
            expectation.semantic,
            'expected canonical requirement was not extracted',
          ),
        );
        continue;
      }
      counts.truePositive += 1;
      consumed.add(index);
      const actual = artifact.requirements[index]!;
      matchedByExpectation.set(expectation, actual);
      const expectedSemantic = expectation.semantic;
      const actualSemantic = semantic(actual.requirement);
      for (const field of [
        'strength',
        'polarity',
        'evaluationUse',
        'actionability',
      ] as const) {
        if (actualSemantic[field] === expectedSemantic[field]) continue;
        mismatchCounts[field] += 1;
        issues.push(
          issue(
            testCase,
            'SEMANTIC_MISMATCH',
            expectedSemantic,
            `${field}: expected ${expectedSemantic[field]}, actual ${actualSemantic[field]}`,
          ),
        );
      }
      if (
        JSON.stringify(actualSemantic.value) !==
        JSON.stringify(expectedSemantic.value)
      ) {
        mismatchCounts.structuredValue += 1;
        issues.push(
          issue(
            testCase,
            'SEMANTIC_MISMATCH',
            expectedSemantic,
            'structured value differs from ground truth',
          ),
        );
      }
      issues.push(
        ...provenanceIssues({
          testCase,
          expectation,
          actual,
          document,
          observationId,
        }),
      );
    }

    for (const expectation of testCase.expected) {
      if (expectation.disposition === 'MUST_EXTRACT') continue;
      const matches = artifact.requirements
        .map((actual, index) => ({ actual, index }))
        .filter(({ actual }) =>
          matchesSelector(actual.requirement, expectation.match),
        );
      if (expectation.disposition === 'MAY_REMAIN_UNRESOLVED') {
        for (const { actual, index } of matches) {
          if (actual.requirement.actionability === 'REVIEW_ONLY') {
            allowedUnresolved.add(index);
          } else {
            issues.push(
              issue(
                testCase,
                'EXPECTED_UNRESOLVED_VIOLATION',
                expectation.match,
                'ambiguous or unsupported meaning became actionable',
              ),
            );
          }
        }
      } else if (matches.length > 0) {
        if (expectation.unknownPreservation) {
          issues.push(
            issue(
              testCase,
              'UNKNOWN_PRESERVATION_FAILURE',
              expectation.match,
              'silence or negative evidence became a positive requirement',
            ),
          );
        }
      }
    }

    const duplicateGroups = new Map<string, number>();
    for (const actual of artifact.requirements) {
      const signature = semanticSignature(actual.requirement);
      duplicateGroups.set(signature, (duplicateGroups.get(signature) ?? 0) + 1);
    }
    for (const actual of artifact.requirements) {
      const signature = semanticSignature(actual.requirement);
      if ((duplicateGroups.get(signature) ?? 0) > 1) {
        issues.push(
          issue(
            testCase,
            'DUPLICATE_OUTPUT',
            actual.requirement,
            'identical canonical semantics emitted more than once',
          ),
        );
        duplicateGroups.set(signature, 0);
      }
    }

    for (const [index, actual] of artifact.requirements.entries()) {
      const matchingMust = [...matchedByExpectation.entries()].find(
        ([, item]) => item === actual,
      )?.[0] as
        Extract<CorpusExpectation, { disposition: 'MUST_EXTRACT' }> | undefined;
      if (!consumed.has(index) && !allowedUnresolved.has(index)) {
        mutableMetrics.get(actual.requirement.category)!.falsePositive += 1;
        issues.push(
          issue(
            testCase,
            'UNEXPECTED',
            actual.requirement,
            'actual requirement has no matching MUST_EXTRACT ground truth',
          ),
        );
        if (CONSEQUENTIAL_CATEGORIES.has(actual.requirement.category)) {
          issues.push(
            issue(
              testCase,
              'FALSE_CONSEQUENTIAL_EXTRACTION',
              actual.requirement,
              'unexpected consequential-category extraction',
            ),
          );
        }
      }
      if (
        actual.requirement.actionability === 'HARD_CONSTRAINT_SAFE' &&
        !hardConstraintIsIntrinsicallySafe(testCase, actual, matchingMust)
      ) {
        issues.push(
          issue(
            testCase,
            'UNSAFE_HARD_CONSTRAINT',
            actual.requirement,
            'hard constraint does not satisfy corpus safety policy',
          ),
        );
      }
    }

    if (testCase.equivalenceGroup) {
      const signatures = testCase.expected
        .filter(
          (
            item,
          ): item is Extract<
            CorpusExpectation,
            { disposition: 'MUST_EXTRACT' }
          > => item.disposition === 'MUST_EXTRACT',
        )
        .map((item) => matchedByExpectation.get(item))
        .filter((item): item is RequirementWithProvenance => Boolean(item))
        .map((item) => semanticSignature(item.requirement))
        .sort();
      const group = equivalence.get(testCase.equivalenceGroup) ?? [];
      group.push({ caseId: testCase.id, signatures });
      equivalence.set(testCase.equivalenceGroup, group);
    }

    if (
      testCase.tags.some((tag) => /alternative|mixed-and-or/.test(tag)) &&
      issues
        .slice(issueStart)
        .some((item) =>
          [
            'MISSING',
            'UNEXPECTED',
            'SEMANTIC_MISMATCH',
            'EXPECTED_UNRESOLVED_VIOLATION',
          ].includes(item.kind),
        )
    ) {
      issues.push(
        issue(
          testCase,
          'ALTERNATIVE_HANDLING_FAILURE',
          { category: 'OTHER' },
          'alternative semantics diverged from labelled ground truth',
        ),
      );
    }

    caseSemantics.set(testCase.id, {
      expected: testCase.expected.map((expectation) => {
        const selector =
          expectation.disposition === 'MUST_EXTRACT'
            ? expectation.semantic
            : expectation.match;
        return `${expectation.disposition} ${selectorSignature(selector)}`;
      }),
      actual: artifact.requirements.map((item) =>
        semanticSignature(item.requirement),
      ),
    });
  }

  let crossProviderEquivalenceFailures = 0;
  for (const [groupName, entries] of equivalence) {
    const reference = JSON.stringify(entries[0]?.signatures ?? []);
    if (
      entries.length === 3 &&
      entries.every((entry) => JSON.stringify(entry.signatures) === reference)
    )
      continue;
    crossProviderEquivalenceFailures += 1;
    for (const entry of entries) {
      issues.push({
        caseId: entry.caseId,
        kind: 'SEMANTIC_MISMATCH',
        category: 'OTHER',
        detail: `cross-provider equivalence group ${groupName} diverged`,
      });
    }
  }

  for (const testCase of cases) {
    const caseIssues = issues.filter((item) => item.caseId === testCase.id);
    const detailsFor = (...kinds: readonly EvaluationIssue['kind'][]) =>
      caseIssues
        .filter((item) => kinds.includes(item.kind))
        .map((item) => `${selectorSignature(item)} — ${item.detail}`);
    const semantics = caseSemantics.get(testCase.id)!;
    caseDiagnostics.push({
      caseId: testCase.id,
      ...semantics,
      missing: detailsFor('MISSING'),
      unexpected: detailsFor('UNEXPECTED'),
      semanticMismatch: detailsFor('SEMANTIC_MISMATCH'),
      alternativeHandling: detailsFor('ALTERNATIVE_HANDLING_FAILURE'),
      provenanceMismatch: detailsFor('PROVENANCE_MISMATCH'),
      safetyViolation: detailsFor(
        'UNSAFE_HARD_CONSTRAINT',
        'FALSE_CONSEQUENTIAL_EXTRACTION',
        'UNKNOWN_PRESERVATION_FAILURE',
        'EXPECTED_UNRESOLVED_VIOLATION',
      ),
    });
  }

  const categoryMetrics = Object.fromEntries(
    [...mutableMetrics.entries()]
      .filter(
        ([, counts]) =>
          counts.truePositive + counts.falsePositive + counts.falseNegative > 0,
      )
      .map(([category, counts]) => [category, metric(counts)]),
  );
  const visibleCategoryCounts = Object.fromEntries(
    [...categoryCounts.entries()].filter(
      ([, counts]) => counts.expected > 0 || counts.actual > 0,
    ),
  );
  const countKind = (kind: EvaluationIssue['kind']) =>
    issues.filter((item) => item.kind === kind).length;
  const failingCaseIds = [...new Set(issues.map((item) => item.caseId))].sort();
  return {
    reportVersion: 'requirement-evaluation-report-v1',
    corpusVersion: REQUIREMENT_EVALUATION_CORPUS_VERSION,
    extractorVersion: V2_2_DETERMINISTIC_EXTRACTOR_VERSION,
    documentVersion: NORMALIZED_LISTING_DOCUMENT_VERSION,
    totalCases: cases.length,
    categoryCounts: visibleCategoryCounts,
    categoryMetrics,
    mismatches: mismatchCounts,
    provenanceFailures: countKind('PROVENANCE_MISMATCH'),
    duplicateOutputViolations: countKind('DUPLICATE_OUTPUT'),
    alternativeHandlingFailures: countKind('ALTERNATIVE_HANDLING_FAILURE'),
    safety: {
      unsafeHardConstraints: countKind('UNSAFE_HARD_CONSTRAINT'),
      falseConsequentialExtractions: countKind(
        'FALSE_CONSEQUENTIAL_EXTRACTION',
      ),
    },
    unresolvedBehavior: {
      expectedUnresolvedViolations: countKind('EXPECTED_UNRESOLVED_VIOLATION'),
      unknownPreservationFailures: countKind('UNKNOWN_PRESERVATION_FAILURE'),
    },
    crossProviderEquivalenceFailures,
    failingCaseIds,
    caseDiagnostics,
    issues,
  };
}

export function formatRequirementEvaluationReport(
  report: RequirementEvaluationReport,
): string {
  const lines = [
    'Requirement Extraction Evaluation',
    `Corpus: ${report.corpusVersion}`,
    `Extractor: ${report.extractorVersion}`,
    `Cases: ${report.totalCases}`,
    '',
  ];
  for (const [category, counts] of Object.entries(report.categoryMetrics)) {
    lines.push(
      `${category}: TP ${counts.truePositive} · FP ${counts.falsePositive} · FN ${counts.falseNegative}`,
    );
  }
  lines.push(
    '',
    'Semantic mismatches',
    `Strength ${report.mismatches.strength} · Polarity ${report.mismatches.polarity} · Use ${report.mismatches.evaluationUse} · Actionability ${report.mismatches.actionability} · Value ${report.mismatches.structuredValue}`,
    '',
    'Safety',
    `Unsafe hard constraints: ${report.safety.unsafeHardConstraints}`,
    `False consequential extractions: ${report.safety.falseConsequentialExtractions}`,
    `Unknown-preservation failures: ${report.unresolvedBehavior.unknownPreservationFailures}`,
    `Alternative-handling failures: ${report.alternativeHandlingFailures}`,
    `Provenance failures: ${report.provenanceFailures}`,
    `Cross-provider equivalence failures: ${report.crossProviderEquivalenceFailures}`,
    '',
    `Failing cases: ${report.failingCaseIds.length ? report.failingCaseIds.join(', ') : 'none'}`,
  );
  return lines.join('\n');
}

export function formatRequirementEvaluationDiagnostics(
  report: RequirementEvaluationReport,
): string {
  const failing = report.caseDiagnostics.filter((item) =>
    report.failingCaseIds.includes(item.caseId),
  );
  if (failing.length === 0) return 'Failures\nnone';
  const lines = ['Failures'];
  for (const diagnostic of failing) {
    lines.push('', `CASE ${diagnostic.caseId}`);
    for (const [label, values] of [
      ['EXPECTED', diagnostic.expected],
      ['ACTUAL', diagnostic.actual],
      ['MISSING', diagnostic.missing],
      ['UNEXPECTED', diagnostic.unexpected],
      ['SEMANTIC MISMATCH', diagnostic.semanticMismatch],
      ['ALTERNATIVE HANDLING', diagnostic.alternativeHandling],
      ['PROVENANCE MISMATCH', diagnostic.provenanceMismatch],
      ['SAFETY VIOLATION', diagnostic.safetyViolation],
    ] as const) {
      lines.push(`${label}: ${values.length ? values.join(' | ') : 'none'}`);
    }
  }
  return lines.join('\n');
}
