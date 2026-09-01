import {
  FitRequirementExtractor,
  normalizeFitValue,
  type FitDimension,
  type FitModality,
  type FitRequirement,
} from './extractor.js';

export const FIT_ENGINE_VERSION = 'fit-v1.3';

export type FitFindingState =
  | 'STRONG_MATCH'
  | 'MATCH'
  | 'PARTIAL'
  | 'TRANSFERABLE'
  | 'GAP'
  | 'NO_EVIDENCE'
  | 'UNKNOWN';

export type FitLevel = 'strong' | 'moderate' | 'weak';

export interface FitCandidateClaim {
  readonly id?: string;
  readonly kind: string;
  readonly value: string;
  readonly scope?: string | null;
  readonly state:
    'SUPPORTED' | 'INFERRED' | 'UNKNOWN' | 'CONFLICTING' | 'UNSUPPORTED';
  readonly confidence?: string | null;
}

export interface FitFinding {
  readonly requirementId: string;
  readonly dimension: FitDimension;
  readonly label: string;
  readonly state: FitFindingState;
  readonly modality: FitModality;
  readonly requirement: string;
  readonly explanation: string;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly opportunityEvidenceReference: string;
  readonly candidateEvidenceReferences: readonly string[];
}

export interface FitEvaluationResult {
  readonly version: typeof FIT_ENGINE_VERSION;
  readonly overallLevel: FitLevel;
  readonly summary: string;
  readonly requirements: readonly FitRequirement[];
  readonly findings: readonly FitFinding[];
}

// Directional, explicit, and intentionally small. A mapping never becomes an exact match.
const TRANSFERABILITY: Readonly<Record<string, readonly string[]>> = {
  kubernetes: ['docker'],
  express: ['fastify'],
  fastify: ['express'],
  aws: ['azure', 'gcp'],
  azure: ['aws', 'gcp'],
  gcp: ['aws', 'azure'],
};

const SENIORITY_RANK: Readonly<Record<string, number>> = {
  junior: 0,
  'mid-level': 1,
  mid: 1,
  senior: 2,
  staff: 3,
  principal: 4,
};

function claimReference(claim: FitCandidateClaim): string {
  return claim.id ? `claim:${claim.id}` : `claim:${claim.kind}:${claim.value}`;
}

function claimCanSupport(claim: FitCandidateClaim): boolean {
  return claim.state === 'SUPPORTED' || claim.state === 'INFERRED';
}

function isProjectClaim(claim: FitCandidateClaim): boolean {
  return /project/i.test(claim.kind) || /project/i.test(claim.scope ?? '');
}

function hasLimitedProficiencyScope(claim: FitCandidateClaim): boolean {
  return /\b(beginner|basic|novice|introductory|foundation(?:al)?|active learning|learning)\b/i.test(
    claim.scope ?? '',
  );
}

function hasEarlyLearningScope(claim: FitCandidateClaim): boolean {
  return /\b(beginner|novice|introductory|active learning|learning)\b/i.test(
    claim.scope ?? '',
  );
}

function requiresEstablishedProficiency(requirement: FitRequirement): boolean {
  return /\b(strong|proficien(?:t|cy)|expert(?:ise)?|extensive|advanced|deep|substantial|significant|\d+\+?\s*years?)\b/i.test(
    requirement.sourceText,
  );
}

function explicitlyAllowsEarlyLearning(requirement: FitRequirement): boolean {
  return /\b(familiarity|basic|beginner|entry[- ]level|exposure)\b/i.test(
    requirement.sourceText,
  );
}

function matchesRequirement(
  claim: FitCandidateClaim,
  requirement: FitRequirement,
): boolean {
  const value = normalizeFitValue(claim.value);
  if (requirement.normalizedValue.split('|').includes(value)) return true;
  if (requirement.dimension === 'seniority') {
    return normalizeFitValue(claim.value) === requirement.normalizedValue;
  }
  return false;
}

function parseDuration(
  claim: FitCandidateClaim,
  requiredFocus: string,
): number | undefined {
  if (isProjectClaim(claim) || !/experience|tenure|years/i.test(claim.kind)) {
    return undefined;
  }
  const match = claim.value
    .toLowerCase()
    .match(/(?:(.+?)\s*[:=]\s*)?(\d+(?:\.\d+)?)\s*(?:years?|yrs?)?/);
  if (!match?.[2]) return undefined;
  const focus = match[1] ? normalizeFitValue(match[1]) : 'relevant';
  if (requiredFocus !== 'relevant' && focus !== requiredFocus) return undefined;
  return Number.parseFloat(match[2]);
}

function finding(
  requirement: FitRequirement,
  state: FitFindingState,
  explanation: string,
  claims: readonly FitCandidateClaim[] = [],
  confidence: FitFinding['confidence'] = 'high',
): FitFinding {
  return {
    requirementId: requirement.id,
    dimension: requirement.dimension,
    label: requirement.label,
    state,
    modality: requirement.modality,
    requirement: requirement.sourceText,
    explanation,
    confidence,
    opportunityEvidenceReference: requirement.sourceReference,
    candidateEvidenceReferences: claims.map(claimReference),
  };
}

function evaluateExperience(
  requirement: FitRequirement,
  claims: readonly FitCandidateClaim[],
): FitFinding {
  const relevant = claims.filter(claimCanSupport);
  const durations = relevant
    .map((claim) => ({
      claim,
      years: parseDuration(claim, requirement.normalizedValue),
    }))
    .filter(
      (entry): entry is { claim: FitCandidateClaim; years: number } =>
        entry.years !== undefined,
    );

  if (durations.length === 0) {
    const uncertain = claims.filter(
      (claim) => claim.state === 'CONFLICTING' || claim.state === 'UNKNOWN',
    );
    return finding(
      requirement,
      uncertain.length > 0 ? 'UNKNOWN' : 'NO_EVIDENCE',
      'No supported, non-project duration evidence establishes relevant tenure.',
      uncertain,
      uncertain.length > 0 ? 'low' : 'medium',
    );
  }

  const strongest = durations.reduce((best, current) =>
    current.years > best.years ? current : best,
  );
  if (
    strongest.years >= (requirement.minimumYears ?? Number.POSITIVE_INFINITY)
  ) {
    return finding(
      requirement,
      strongest.claim.state === 'SUPPORTED' ? 'STRONG_MATCH' : 'PARTIAL',
      `${strongest.years} supported years meet the ${requirement.minimumYears}-year requirement.`,
      [strongest.claim],
      strongest.claim.state === 'SUPPORTED' ? 'high' : 'medium',
    );
  }
  return finding(
    requirement,
    'PARTIAL',
    `${strongest.years} supported years are below the ${requirement.minimumYears}-year requirement.`,
    [strongest.claim],
    'high',
  );
}

function evaluateSeniority(
  requirement: FitRequirement,
  claims: readonly FitCandidateClaim[],
): FitFinding {
  const seniorityClaims = claims.filter(
    (claim) =>
      /seniority|level|role_title/i.test(claim.kind) && claimCanSupport(claim),
  );
  if (seniorityClaims.length === 0) {
    const conflicting = claims.filter(
      (claim) =>
        /seniority|level|role_title/i.test(claim.kind) &&
        claim.state === 'CONFLICTING',
    );
    return finding(
      requirement,
      conflicting.length > 0 ? 'UNKNOWN' : 'NO_EVIDENCE',
      'No supported candidate claim establishes a comparable seniority level.',
      conflicting,
      'low',
    );
  }

  const supported =
    seniorityClaims.find((claim) => claim.state === 'SUPPORTED') ??
    seniorityClaims[0]!;
  const candidateValue = normalizeFitValue(supported.value);
  const candidateRank = SENIORITY_RANK[candidateValue];
  const requiredRank = SENIORITY_RANK[requirement.normalizedValue];
  if (candidateRank === undefined || requiredRank === undefined) {
    return finding(
      requirement,
      'UNKNOWN',
      'The available title or level is too ambiguous for deterministic seniority comparison.',
      [supported],
      'low',
    );
  }
  if (candidateRank >= requiredRank) {
    return finding(
      requirement,
      supported.state === 'SUPPORTED' ? 'MATCH' : 'PARTIAL',
      `Supported ${candidateValue} evidence aligns with the ${requirement.normalizedValue} role level.`,
      [supported],
      supported.state === 'SUPPORTED' ? 'high' : 'medium',
    );
  }
  return finding(
    requirement,
    requiredRank - candidateRank >= 2 ? 'GAP' : 'PARTIAL',
    `Supported ${candidateValue} evidence is below the ${requirement.normalizedValue} role level.`,
    [supported],
    'high',
  );
}

function evaluateRequirement(
  requirement: FitRequirement,
  claims: readonly FitCandidateClaim[],
): FitFinding {
  if (requirement.dimension === 'experience_depth') {
    return evaluateExperience(requirement, claims);
  }
  if (requirement.dimension === 'seniority') {
    return evaluateSeniority(requirement, claims);
  }

  const direct = claims.filter((claim) =>
    matchesRequirement(claim, requirement),
  );
  const contradictory = direct.filter((claim) => claim.state === 'CONFLICTING');
  const supported = direct.filter(claimCanSupport);
  if (contradictory.length > 0) {
    return finding(
      requirement,
      'UNKNOWN',
      'Candidate evidence for this requirement is conflicting.',
      [...supported, ...contradictory],
      'low',
    );
  }
  const directSupported = supported.find(
    (claim) => claim.state === 'SUPPORTED',
  );
  if (directSupported) {
    const project = isProjectClaim(directSupported);
    if (
      !project &&
      hasLimitedProficiencyScope(directSupported) &&
      (requiresEstablishedProficiency(requirement) ||
        (hasEarlyLearningScope(directSupported) &&
          !explicitlyAllowsEarlyLearning(requirement)))
    ) {
      return finding(
        requirement,
        'PARTIAL',
        `The candidate has supported ${directSupported.value} evidence, but its recorded scope (${directSupported.scope}) does not establish the proficiency requested by this requirement.`,
        [directSupported],
        'high',
      );
    }
    return finding(
      requirement,
      project ? 'MATCH' : 'STRONG_MATCH',
      project
        ? 'A supported project claim directly demonstrates the requested capability; it does not establish professional tenure.'
        : 'Supported candidate evidence directly matches the requested capability.',
      [directSupported],
      'high',
    );
  }
  const inferred = supported.find((claim) => claim.state === 'INFERRED');
  if (inferred) {
    return finding(
      requirement,
      'PARTIAL',
      'An inferred candidate claim aligns, but is not treated as established fact.',
      [inferred],
      'low',
    );
  }

  const transferableMatch = requirement.normalizedValue
    .split('|')
    .flatMap((target) =>
      claims
        .filter(
          (claim) =>
            claimCanSupport(claim) &&
            (TRANSFERABILITY[target] ?? []).includes(
              normalizeFitValue(claim.value),
            ),
        )
        .map((claim) => ({ claim, target })),
    )[0];
  const transferable = transferableMatch?.claim;
  if (transferable) {
    const source = normalizeFitValue(transferable.value);
    const cloudProviders = ['aws', 'azure', 'gcp'];
    const explanation =
      cloudProviders.includes(source) &&
      cloudProviders.includes(transferableMatch.target)
        ? `${source} supports only broad cloud-provider familiarity relevant to ${transferableMatch.target}; it does not establish ${transferableMatch.target} or provider-specific service expertise.`
        : `${source} is an explicit ${FIT_ENGINE_VERSION} transfer relationship to ${transferableMatch.target}; it is not an exact match.`;
    return finding(
      requirement,
      'TRANSFERABLE',
      explanation,
      [transferable],
      transferable.state === 'SUPPORTED' ? 'medium' : 'low',
    );
  }

  const unknown = direct.filter((claim) => claim.state === 'UNKNOWN');
  return finding(
    requirement,
    unknown.length > 0 ? 'UNKNOWN' : 'NO_EVIDENCE',
    'No usable candidate evidence was found. This is not evidence that the candidate lacks the capability.',
    unknown,
    'medium',
  );
}

const STATE_CREDIT: Readonly<Record<FitFindingState, number>> = {
  STRONG_MATCH: 1,
  MATCH: 0.9,
  TRANSFERABLE: 0.6,
  PARTIAL: 0.5,
  GAP: 0,
  NO_EVIDENCE: 0,
  UNKNOWN: 0,
};

export function aggregateFit(findings: readonly FitFinding[]): FitLevel {
  const required = findings.filter((item) => item.modality === 'required');
  const considered =
    required.length > 0
      ? required
      : findings.filter((item) => item.modality === 'preferred');
  if (considered.length === 0) return 'weak';
  const ratio =
    considered.reduce((sum, item) => sum + STATE_CREDIT[item.state], 0) /
    considered.length;

  if (required.length > 0 && ratio >= 0.8) return 'strong';
  if (required.length === 0 && ratio >= 0.8) return 'moderate';
  if (ratio < 0.35) return 'weak';
  return 'moderate';
}

export class FitEngine {
  public readonly version = FIT_ENGINE_VERSION;
  private readonly extractor = new FitRequirementExtractor();

  public evaluate(
    snapshot: { id?: string; title?: string | null; content?: string | null },
    candidateClaims: readonly FitCandidateClaim[],
  ): FitEvaluationResult {
    const requirements = this.extractor.extract(snapshot);
    const findings = requirements.map((requirement) =>
      evaluateRequirement(requirement, candidateClaims),
    );
    const overallLevel = aggregateFit(findings);
    const matched = findings.filter(
      (item) => item.state === 'STRONG_MATCH' || item.state === 'MATCH',
    ).length;
    const transferable = findings.filter(
      (item) => item.state === 'TRANSFERABLE',
    ).length;
    const partial = findings.filter((item) => item.state === 'PARTIAL').length;
    const gaps = findings.filter((item) => item.state === 'GAP').length;
    const uncertain = findings.filter(
      (item) => item.state === 'NO_EVIDENCE' || item.state === 'UNKNOWN',
    ).length;

    return {
      version: this.version,
      overallLevel,
      summary:
        findings.length === 0
          ? 'No deterministic Fit requirements were extracted; Fit remains weak because evidence is insufficient.'
          : `${matched} of ${findings.length} extracted requirements directly match; ${transferable} are transferable, ${partial} partial, ${gaps} evidenced gaps, and ${uncertain} lack usable evidence or remain uncertain.`,
      requirements,
      findings,
    };
  }
}
