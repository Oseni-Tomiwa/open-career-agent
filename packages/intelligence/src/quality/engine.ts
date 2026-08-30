export const QUALITY_ENGINE_VERSION = 'quality-v1';

export type QualityLevel = 'strong' | 'moderate' | 'weak' | 'risk';
export type QualityFindingState =
  'STRONG' | 'ADEQUATE' | 'WEAK' | 'RISK' | 'UNKNOWN';
export type QualityImportance = 'critical' | 'important' | 'transparency';

export interface QualitySnapshotInput {
  readonly id?: string;
  readonly fingerprint: string;
  readonly supportsSnapshot?: boolean;
  readonly observedAt: Date;
  readonly title: string;
  readonly organization: string;
  readonly content: string;
  readonly location?: string | null;
  readonly workModel?: string | null;
  readonly employmentType?: string | null;
  readonly compensation?: string | null;
}

export interface QualitySourceObservationInput {
  readonly id?: string;
  readonly sourceSystem: string;
  readonly sourceExternalId: string;
  readonly sourceUrl?: string | null;
  readonly listingLastSeenAt?: Date | null;
  readonly observedAt: Date;
  readonly sourceUpdatedAt?: Date | null;
  readonly fingerprint: string;
  readonly title?: string | null;
  readonly organization?: string | null;
  readonly location?: string | null;
  readonly workModel?: string | null;
  readonly employmentType?: string | null;
  readonly compensation?: string | null;
  readonly explicitStatus?: 'active' | 'closed' | 'removed' | 'unknown';
  readonly supportsSnapshot?: boolean;
}

export interface QualityEvidenceReference {
  readonly sourceReference: string;
  readonly excerpt: string;
}

export interface QualityFinding {
  readonly dimension: string;
  readonly label: string;
  readonly state: QualityFindingState;
  readonly importance: QualityImportance;
  readonly explanation: string;
  readonly evidenceReferences: readonly QualityEvidenceReference[];
  readonly relevantAt?: string;
}

export interface QualityEvaluationInput {
  readonly snapshot: QualitySnapshotInput;
  readonly sourceObservations: readonly QualitySourceObservationInput[];
  readonly evaluatedAt: Date;
}

export interface QualityEvaluationResult {
  readonly version: typeof QUALITY_ENGINE_VERSION;
  readonly evaluatedAt: string;
  readonly freshnessBucket: FreshnessBucket;
  readonly overallLevel: QualityLevel;
  readonly summary: string;
  readonly findings: readonly QualityFinding[];
}

export type FreshnessBucket = 'recent' | 'aging' | 'stale' | 'very_stale';

const DAY_MS = 86_400_000;
const PLACEHOLDER =
  /^(unknown|untitled|n\/a|na|tbd|test|placeholder)(\s+(title|organization|role))?$/i;

function daysOld(value: Date, evaluatedAt: Date): number {
  return Math.max(
    0,
    Math.floor((evaluatedAt.getTime() - value.getTime()) / DAY_MS),
  );
}

export function freshnessBucket(ageDays: number): FreshnessBucket {
  if (ageDays <= 14) return 'recent';
  if (ageDays <= 30) return 'aging';
  if (ageDays <= 60) return 'stale';
  return 'very_stale';
}

export function nextFreshnessBoundary(
  anchor: Date,
  evaluatedAt: Date,
): Date | null {
  const age = daysOld(anchor, evaluatedAt);
  const nextAge = age <= 14 ? 15 : age <= 30 ? 31 : age <= 60 ? 61 : null;
  return nextAge === null
    ? null
    : new Date(anchor.getTime() + nextAge * DAY_MS);
}

function reference(
  input: QualityEvaluationInput,
  excerpt: string,
): QualityEvidenceReference {
  return {
    sourceReference: input.snapshot.id
      ? `snapshot:${input.snapshot.id}`
      : 'snapshot',
    excerpt,
  };
}

function latestObservation(
  observations: readonly QualitySourceObservationInput[],
): QualitySourceObservationInput | undefined {
  return [...observations].sort(
    (left, right) => right.observedAt.getTime() - left.observedAt.getTime(),
  )[0];
}

export function qualityFreshnessAnchor(input: QualityEvaluationInput): Date {
  const sourceDates = input.sourceObservations
    .map((item) => item.sourceUpdatedAt)
    .filter(
      (item): item is Date =>
        item instanceof Date && !Number.isNaN(item.getTime()),
    );
  return (
    sourceDates.sort((left, right) => right.getTime() - left.getTime())[0] ??
    input.snapshot.observedAt
  );
}

function freshnessFinding(input: QualityEvaluationInput): QualityFinding {
  const anchor = qualityFreshnessAnchor(input);
  const age = daysOld(anchor, input.evaluatedAt);
  const bucket = freshnessBucket(age);
  const state: QualityFindingState =
    bucket === 'recent'
      ? 'STRONG'
      : bucket === 'aging'
        ? 'ADEQUATE'
        : bucket === 'stale'
          ? 'WEAK'
          : 'RISK';
  return {
    dimension: 'freshness',
    label: 'Listing freshness',
    state,
    importance: 'important',
    explanation: `${age} days old at evaluation time; quality-v1 thresholds classify this as ${bucket}. Age does not establish that a listing is closed.`,
    evidenceReferences: [
      reference(input, `Freshness anchor: ${anchor.toISOString()}`),
    ],
    relevantAt: input.evaluatedAt.toISOString(),
  };
}

function sourceConfidenceFinding(
  input: QualityEvaluationInput,
): QualityFinding {
  const observation = latestObservation(input.sourceObservations);
  if (!observation) {
    return {
      dimension: 'source_confidence',
      label: 'Source confidence',
      state: 'RISK',
      importance: 'critical',
      explanation:
        'The snapshot has no retained source observation provenance.',
      evidenceReferences: [reference(input, 'No source observation linked')],
    };
  }
  const official = observation.sourceSystem.toLowerCase() === 'greenhouse';
  return {
    dimension: 'source_confidence',
    label: 'Source confidence',
    state: official ? 'STRONG' : 'UNKNOWN',
    importance: 'critical',
    explanation: official
      ? 'The listing was observed through the structured Greenhouse ATS adapter with retained source identity.'
      : `Source ${observation.sourceSystem} has no Quality V1 trust classification.`,
    evidenceReferences: [
      {
        sourceReference: `source:${observation.sourceSystem}:${observation.sourceExternalId}`,
        excerpt: observation.sourceUrl ?? 'No source URL retained',
      },
    ],
  };
}

function completenessFinding(input: QualityEvaluationInput): QualityFinding {
  const { title, organization, content, location } = input.snapshot;
  const invalidIdentity =
    title.trim().length === 0 ||
    organization.trim().length === 0 ||
    PLACEHOLDER.test(title.trim()) ||
    PLACEHOLDER.test(organization.trim());
  const contentLength = content.replace(/<[^>]+>/g, ' ').trim().length;
  const state: QualityFindingState = invalidIdentity
    ? 'RISK'
    : contentLength < 20
      ? 'RISK'
      : contentLength < 80
        ? 'WEAK'
        : location
          ? 'STRONG'
          : 'ADEQUATE';
  return {
    dimension: 'content_completeness',
    label: 'Content completeness',
    state,
    importance:
      invalidIdentity || contentLength < 20 ? 'critical' : 'important',
    explanation: invalidIdentity
      ? 'Title or organization is missing or an explicit placeholder.'
      : `The retained description contains ${contentLength} non-markup characters${location ? ' and a location field' : '; location is handled separately'}.`,
    evidenceReferences: [
      reference(
        input,
        `Title: ${title}; organization: ${organization}; content length: ${contentLength}`,
      ),
    ],
  };
}

function compensationFinding(input: QualityEvaluationInput): QualityFinding {
  const value = input.snapshot.compensation?.trim();
  const explicit =
    value &&
    /(?:[$£€]\s*\d|\d[\d,.]*\s*(?:usd|eur|gbp|per\s+(?:year|hour)))/i.test(
      value,
    );
  const range = explicit && /(?:-|–|—|\bto\b)/i.test(value);
  return {
    dimension: 'compensation_transparency',
    label: 'Compensation transparency',
    state: explicit ? 'STRONG' : value ? 'WEAK' : 'WEAK',
    importance: 'transparency',
    explanation: explicit
      ? `Explicit ${range ? 'range' : 'fixed compensation'} is present.`
      : value
        ? 'Compensation wording is present but does not provide a deterministic amount.'
        : 'No compensation information is present; this is a transparency weakness, not evidence of employer risk.',
    evidenceReferences: [reference(input, value ?? 'No compensation field')],
  };
}

function locationFinding(input: QualityEvaluationInput): QualityFinding {
  const value = input.snapshot.location?.trim();
  const vague =
    value && /^(remote|multiple locations|various|global)$/i.test(value);
  return {
    dimension: 'location_clarity',
    label: 'Location clarity',
    state: !value ? 'UNKNOWN' : vague ? 'WEAK' : 'STRONG',
    importance: 'important',
    explanation: !value
      ? 'No normalized location is available.'
      : vague
        ? `“${value}” states a broad location but not a geographic scope.`
        : `The listing states “${value}”.`,
    evidenceReferences: [reference(input, value ?? 'No location field')],
  };
}

function explicitWorkModel(input: QualityEvaluationInput): string | undefined {
  const field = input.snapshot.workModel?.trim().toLowerCase();
  if (field && /^(remote|hybrid|on[- ]?site)$/.test(field)) return field;
  return input.snapshot.content
    .match(/\b(remote|hybrid|on[- ]?site)\b/i)?.[1]
    ?.toLowerCase();
}

function workModelFinding(input: QualityEvaluationInput): QualityFinding {
  const value = explicitWorkModel(input);
  return {
    dimension: 'work_model_clarity',
    label: 'Work-model clarity',
    state: value ? 'STRONG' : 'UNKNOWN',
    importance: 'important',
    explanation: value
      ? `The listing explicitly identifies the work model as ${value}.`
      : 'Remote, hybrid, or on-site expectations are not explicit.',
    evidenceReferences: [reference(input, value ?? 'No explicit work model')],
  };
}

function explicitEmploymentType(
  input: QualityEvaluationInput,
): string | undefined {
  const field = input.snapshot.employmentType?.trim();
  if (field) return field;
  return input.snapshot.content.match(
    /\b(full[- ]time|part[- ]time|contract|internship|temporary|apprenticeship)\b/i,
  )?.[1];
}

function employmentTypeFinding(input: QualityEvaluationInput): QualityFinding {
  const value = explicitEmploymentType(input);
  return {
    dimension: 'employment_type_clarity',
    label: 'Employment-type clarity',
    state: value ? 'STRONG' : 'UNKNOWN',
    importance: 'transparency',
    explanation: value
      ? `The listing explicitly states ${value}.`
      : 'Employment type is not explicit.',
    evidenceReferences: [reference(input, value ?? 'No employment type')],
  };
}

function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function applicationLinkFinding(input: QualityEvaluationInput): QualityFinding {
  const observation = latestObservation(input.sourceObservations);
  const url = observation?.sourceUrl?.trim();
  return {
    dimension: 'application_link',
    label: 'Application link',
    state: !url ? 'WEAK' : validUrl(url) ? 'STRONG' : 'RISK',
    importance: !url ? 'important' : validUrl(url) ? 'important' : 'critical',
    explanation: !url
      ? 'No application/source URL is retained.'
      : validUrl(url)
        ? 'A syntactically valid HTTP(S) application/source URL is retained; live reachability was not tested.'
        : 'The retained application/source URL is malformed.',
    evidenceReferences: [
      {
        sourceReference: observation
          ? `source:${observation.sourceSystem}:${observation.sourceExternalId}`
          : 'source',
        excerpt: url ?? 'No URL retained',
      },
    ],
  };
}

function statusFinding(input: QualityEvaluationInput): QualityFinding {
  const latest = latestObservation(input.sourceObservations);
  const explicit = input.sourceObservations.find(
    (item) =>
      item.explicitStatus === 'closed' || item.explicitStatus === 'removed',
  );
  if (explicit) {
    return {
      dimension: 'listing_status',
      label: 'Listing status',
      state: 'RISK',
      importance: 'critical',
      explanation: `The source explicitly reports the listing as ${explicit.explicitStatus}.`,
      evidenceReferences: [
        {
          sourceReference: `source:${explicit.sourceSystem}:${explicit.sourceExternalId}`,
          excerpt: explicit.explicitStatus ?? '',
        },
      ],
    };
  }
  const recentlySeen =
    latest && daysOld(latest.observedAt, input.evaluatedAt) <= 14;
  return {
    dimension: 'listing_status',
    label: 'Listing status',
    state: recentlySeen ? 'ADEQUATE' : 'UNKNOWN',
    importance: 'critical',
    explanation: recentlySeen
      ? 'The listing was returned by source discovery recently; no explicit closed state is retained.'
      : 'No explicit closed/removed state is retained. Age alone is not treated as closure.',
    evidenceReferences: [
      reference(
        input,
        latest
          ? `Last observed: ${latest.observedAt.toISOString()}`
          : 'No observation',
      ),
    ],
  };
}

function contradictionFinding(input: QualityEvaluationInput): QualityFinding {
  const comparable = input.sourceObservations.filter(
    (item) => item.supportsSnapshot,
  );
  const conflicts: string[] = [];
  for (const item of comparable) {
    if (item.title && item.title.trim() !== input.snapshot.title.trim())
      conflicts.push('title');
    if (
      item.organization &&
      item.organization.trim() !== input.snapshot.organization.trim()
    )
      conflicts.push('organization');
    if (
      item.location &&
      input.snapshot.location &&
      item.location.trim() !== input.snapshot.location.trim()
    )
      conflicts.push('location');
    if (
      item.workModel &&
      input.snapshot.workModel &&
      item.workModel.toLowerCase() !== input.snapshot.workModel.toLowerCase()
    )
      conflicts.push('work model');
    if (
      item.compensation &&
      input.snapshot.compensation &&
      item.compensation.trim() !== input.snapshot.compensation.trim()
    )
      conflicts.push('compensation');
  }
  const unique = [...new Set(conflicts)];
  return {
    dimension: 'contradictions',
    label: 'Source consistency',
    state: unique.length > 0 ? 'RISK' : 'STRONG',
    importance: unique.length > 0 ? 'critical' : 'important',
    explanation:
      unique.length > 0
        ? `The same source state conflicts with the snapshot for: ${unique.join(', ')}.`
        : 'No contradiction is observable between the snapshot and its same-state structured source evidence.',
    evidenceReferences: [
      reference(
        input,
        unique.length > 0
          ? `Conflicting fields: ${unique.join(', ')}`
          : 'No same-state contradiction',
      ),
    ],
  };
}

function integrityFinding(input: QualityEvaluationInput): QualityFinding {
  const text = `${input.snapshot.title} ${input.snapshot.organization} ${input.snapshot.content}`;
  const placeholder =
    /\b(lorem ipsum|coming soon|insert (?:text|description)|placeholder text)\b/i.test(
      text,
    );
  const missingExternalId = input.sourceObservations.some(
    (item) => item.sourceExternalId.trim().length === 0,
  );
  const risk = placeholder || missingExternalId;
  return {
    dimension: 'content_integrity',
    label: 'Malformed-content signals',
    state: risk ? 'RISK' : 'STRONG',
    importance: risk ? 'critical' : 'important',
    explanation: risk
      ? 'An explicit placeholder or missing source identifier is present.'
      : 'No bounded Quality V1 placeholder or malformed-identity signal was detected.',
    evidenceReferences: [
      reference(
        input,
        risk
          ? 'Malformed/placeholder signal detected'
          : 'No bounded malformed signal',
      ),
    ],
  };
}

function observationHistoryFinding(
  input: QualityEvaluationInput,
): QualityFinding {
  const count = input.sourceObservations.length;
  return {
    dimension: 'observation_history',
    label: 'Observation history',
    state: 'UNKNOWN',
    importance: 'transparency',
    explanation:
      count > 1
        ? `${count} immutable changed observations are retained. Updates are not treated as suspicious by themselves.`
        : 'Current persistence deduplicates unchanged observations, so repost/unchanged-scan frequency cannot be established.',
    evidenceReferences: [
      reference(input, `${count} retained source observation(s)`),
    ],
  };
}

const CREDIT: Readonly<Record<QualityFindingState, number>> = {
  STRONG: 1,
  ADEQUATE: 0.75,
  UNKNOWN: 0.5,
  WEAK: 0.35,
  RISK: 0,
};
const IMPORTANCE_WEIGHT: Readonly<Record<QualityImportance, number>> = {
  critical: 3,
  important: 2,
  transparency: 1,
};

export function aggregateQuality(
  findings: readonly QualityFinding[],
): QualityLevel {
  if (
    findings.some(
      (item) => item.importance === 'critical' && item.state === 'RISK',
    )
  )
    return 'risk';
  const totalWeight = findings.reduce(
    (sum, item) => sum + IMPORTANCE_WEIGHT[item.importance],
    0,
  );
  const score =
    findings.reduce(
      (sum, item) =>
        sum + CREDIT[item.state] * IMPORTANCE_WEIGHT[item.importance],
      0,
    ) / totalWeight;
  if (score >= 0.8) return 'strong';
  if (score >= 0.55) return 'moderate';
  return 'weak';
}

export class QualityEngine {
  public readonly version = QUALITY_ENGINE_VERSION;

  public evaluate(input: QualityEvaluationInput): QualityEvaluationResult {
    const anchor = qualityFreshnessAnchor(input);
    const findings = [
      freshnessFinding(input),
      sourceConfidenceFinding(input),
      completenessFinding(input),
      compensationFinding(input),
      locationFinding(input),
      workModelFinding(input),
      employmentTypeFinding(input),
      applicationLinkFinding(input),
      statusFinding(input),
      contradictionFinding(input),
      integrityFinding(input),
      observationHistoryFinding(input),
    ];
    const overallLevel = aggregateQuality(findings);
    const risks = findings.filter((item) => item.state === 'RISK').length;
    const weaknesses = findings.filter(
      (item) => item.state === 'WEAK' || item.state === 'UNKNOWN',
    ).length;
    return {
      version: this.version,
      evaluatedAt: input.evaluatedAt.toISOString(),
      freshnessBucket: freshnessBucket(daysOld(anchor, input.evaluatedAt)),
      overallLevel,
      summary: `${findings.length} Quality dimensions evaluated: ${risks} risk signals and ${weaknesses} weak or unknown signals.`,
      findings,
    };
  }
}
