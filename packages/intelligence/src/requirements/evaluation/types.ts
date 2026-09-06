import type {
  RequirementActionability,
  RequirementCategory,
  RequirementEvaluationUse,
  RequirementPolarity,
  RequirementStrength,
  RequirementValue,
} from '@oca/domain';
import type { ListingFragmentInput } from '@oca/sources';

export const REQUIREMENT_EVALUATION_CORPUS_VERSION = 'requirements-corpus-v0.1';

export type CorpusProvider = 'ashby' | 'lever' | 'greenhouse';
export type GroundTruthDisposition =
  'MUST_EXTRACT' | 'MUST_NOT_EXTRACT' | 'MAY_REMAIN_UNRESOLVED';

export interface ExpectedRequirementSelector {
  readonly category: RequirementCategory;
  readonly normalizedKey?: string;
}

export interface ExpectedRequirementSemantic extends ExpectedRequirementSelector {
  readonly normalizedKey: string;
  readonly value: RequirementValue;
  readonly strength: RequirementStrength;
  readonly polarity: RequirementPolarity;
  readonly evaluationUse: RequirementEvaluationUse;
  readonly actionability: RequirementActionability;
}

export interface ExpectedProvenance {
  readonly sourceFieldPath?: string;
  readonly supportText?: string;
  readonly minimumLinks?: number;
  readonly exactLinks?: number;
}

export type CorpusExpectation =
  | {
      readonly disposition: 'MUST_EXTRACT';
      readonly semantic: ExpectedRequirementSemantic;
      readonly provenance?: ExpectedProvenance;
    }
  | {
      readonly disposition: 'MUST_NOT_EXTRACT';
      readonly match: ExpectedRequirementSelector;
      readonly unknownPreservation?: boolean;
    }
  | {
      readonly disposition: 'MAY_REMAIN_UNRESOLVED';
      readonly match: ExpectedRequirementSelector;
      readonly rationale: string;
    };

export type CorpusInput =
  | {
      readonly kind: 'PROVIDER_PAYLOAD';
      readonly provider: CorpusProvider;
      readonly payload: Readonly<Record<string, unknown>>;
    }
  | {
      readonly kind: 'NORMALIZED_DOCUMENT';
      readonly sourceSystem: string;
      readonly fragments: readonly ListingFragmentInput[];
    };

export interface RequirementEvaluationCase {
  readonly id: string;
  readonly description: string;
  readonly input: CorpusInput;
  readonly expected: readonly CorpusExpectation[];
  readonly tags: readonly string[];
  readonly rationale: string;
  readonly consequential: boolean;
  readonly equivalenceGroup?: string;
  readonly expectedDocumentTruncated?: boolean;
  readonly expectedSetStatus?: 'COMPLETE' | 'PARTIAL';
}

export interface MetricCounts {
  readonly truePositive: number;
  readonly falsePositive: number;
  readonly falseNegative: number;
  readonly precision: number | null;
  readonly recall: number | null;
}

export type EvaluationIssueKind =
  | 'MISSING'
  | 'UNEXPECTED'
  | 'SEMANTIC_MISMATCH'
  | 'PROVENANCE_MISMATCH'
  | 'DUPLICATE_OUTPUT'
  | 'UNSAFE_HARD_CONSTRAINT'
  | 'FALSE_CONSEQUENTIAL_EXTRACTION'
  | 'EXPECTED_UNRESOLVED_VIOLATION'
  | 'UNKNOWN_PRESERVATION_FAILURE'
  | 'DOCUMENT_STATUS_MISMATCH'
  | 'ALTERNATIVE_HANDLING_FAILURE';

export interface EvaluationIssue {
  readonly caseId: string;
  readonly kind: EvaluationIssueKind;
  readonly category: RequirementCategory;
  readonly normalizedKey?: string;
  readonly detail: string;
}

export interface CaseDiagnostic {
  readonly caseId: string;
  readonly expected: readonly string[];
  readonly actual: readonly string[];
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];
  readonly semanticMismatch: readonly string[];
  readonly alternativeHandling: readonly string[];
  readonly provenanceMismatch: readonly string[];
  readonly safetyViolation: readonly string[];
}

export interface RequirementEvaluationReport {
  readonly reportVersion: 'requirement-evaluation-report-v1';
  readonly corpusVersion: string;
  readonly extractorVersion: string;
  readonly documentVersion: string;
  readonly totalCases: number;
  readonly categoryCounts: Readonly<
    Record<string, { readonly expected: number; readonly actual: number }>
  >;
  readonly categoryMetrics: Readonly<Record<string, MetricCounts>>;
  readonly mismatches: {
    readonly strength: number;
    readonly polarity: number;
    readonly evaluationUse: number;
    readonly actionability: number;
    readonly structuredValue: number;
  };
  readonly provenanceFailures: number;
  readonly duplicateOutputViolations: number;
  readonly alternativeHandlingFailures: number;
  readonly safety: {
    readonly unsafeHardConstraints: number;
    readonly falseConsequentialExtractions: number;
  };
  readonly unresolvedBehavior: {
    readonly expectedUnresolvedViolations: number;
    readonly unknownPreservationFailures: number;
  };
  readonly crossProviderEquivalenceFailures: number;
  readonly failingCaseIds: readonly string[];
  readonly caseDiagnostics: readonly CaseDiagnostic[];
  readonly issues: readonly EvaluationIssue[];
}
