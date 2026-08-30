import {
  AttachClaimEvidenceInputSchema,
  CandidateProfileResponseSchema,
  CareerMemoryMutationResponseSchema,
  CreateCandidateClaimInputSchema,
  OpportunityDetailResponseSchema,
  OpportunityListResponseSchema,
  UpdateCandidateClaimInputSchema,
} from '@oca/schemas';
import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import { browserConfig } from '../config.js';
import { initialSeedSnapshot } from './seed.js';
import type {
  Decision,
  CandidateClaimState,
  CareerMemoryProfile,
  CreateCandidateClaimInput,
  EligibilityState,
  EvidenceReference,
  EvidenceState,
  FitSignal,
  Opportunity,
  ProductRepository,
  ProductSnapshot,
  QualitySignal,
  SearchPreferences,
  ManualEvidenceInput,
  UpdateCandidateClaimInput,
} from './types.js';

type ListResponse = Static<typeof OpportunityListResponseSchema>;
type DetailResponse = Static<typeof OpportunityDetailResponseSchema>;
type Summary = ListResponse['data'][number];
type Snapshot = DetailResponse['snapshots'][number];
type DecisionAction = NonNullable<Snapshot['decision']>['action'];
type ApiFitState = NonNullable<Snapshot['fit']>['findings'][number]['state'];

export class ApiProductRepositoryError extends Error {
  public constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiProductRepositoryError';
  }
}

export class ApiProductRepository implements ProductRepository {
  public readonly dataSource = 'api' as const;
  private snapshot: ProductSnapshot = {
    ...initialSeedSnapshot,
    opportunities: [],
  };
  private readonly summaries = new Map<string, Summary>();

  public constructor(
    private readonly baseUrl = browserConfig.apiBaseUrl,
    private readonly candidateId = browserConfig.developmentCandidateId,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {
    if (!candidateId) {
      throw new ApiProductRepositoryError(
        'A development candidate ID is required in API mode.',
      );
    }
  }

  public async getSnapshot(): Promise<ProductSnapshot> {
    const response = await this.getValidated(
      `/opportunities?candidateId=${encodeURIComponent(this.candidateId!)}`,
      OpportunityListResponseSchema,
    );
    const opportunities = response.data.map((item) => {
      this.summaries.set(item.id, item);
      return mapSummary(item);
    });
    this.snapshot = { ...this.snapshot, opportunities };
    return this.snapshot;
  }

  public async getOpportunity(
    opportunityId: string,
    signal?: AbortSignal,
  ): Promise<Opportunity | null> {
    try {
      const response = await this.getValidated(
        `/opportunities/${encodeURIComponent(opportunityId)}?candidateId=${encodeURIComponent(this.candidateId!)}`,
        OpportunityDetailResponseSchema,
        signal,
      );
      const opportunity = mapDetail(
        response,
        this.summaries.get(opportunityId),
      );
      this.snapshot = {
        ...this.snapshot,
        opportunities: this.snapshot.opportunities.map((item) =>
          item.id === opportunityId ? opportunity : item,
        ),
      };
      return opportunity;
    } catch (error) {
      if (error instanceof ApiProductRepositoryError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  public async setOpportunityDecision(
    _opportunityId: string,
    _decision: Decision,
  ): Promise<ProductSnapshot> {
    return Promise.resolve(this.snapshot);
  }

  public async saveSearchPreferences(
    preferences: SearchPreferences,
  ): Promise<ProductSnapshot> {
    this.snapshot = { ...this.snapshot, searchPreferences: preferences };
    return Promise.resolve(this.snapshot);
  }

  public async getCareerMemory(): Promise<CareerMemoryProfile> {
    return this.getValidated(
      `/candidates/${encodeURIComponent(this.candidateId!)}/profile`,
      CandidateProfileResponseSchema,
    );
  }

  public async createCandidateClaim(
    input: CreateCandidateClaimInput,
  ): Promise<CareerMemoryProfile> {
    if (!Value.Check(CreateCandidateClaimInputSchema, input)) {
      throw new ApiProductRepositoryError('The claim input is invalid.');
    }
    return this.mutateCareerMemory(
      `/candidates/${encodeURIComponent(this.candidateId!)}/claims`,
      'POST',
      input,
    );
  }

  public async updateCandidateClaim(
    claimId: string,
    input: UpdateCandidateClaimInput,
  ): Promise<CareerMemoryProfile> {
    if (!Value.Check(UpdateCandidateClaimInputSchema, input)) {
      throw new ApiProductRepositoryError('The claim update is invalid.');
    }
    return this.mutateCareerMemory(
      `/candidates/${encodeURIComponent(this.candidateId!)}/claims/${encodeURIComponent(claimId)}`,
      'PATCH',
      input,
    );
  }

  public async attachClaimEvidence(
    claimId: string,
    evidence: ManualEvidenceInput,
    transitionTo?: CandidateClaimState,
  ): Promise<CareerMemoryProfile> {
    const input = { evidence, ...(transitionTo ? { transitionTo } : {}) };
    if (!Value.Check(AttachClaimEvidenceInputSchema, input)) {
      throw new ApiProductRepositoryError('The Evidence input is invalid.');
    }
    return this.mutateCareerMemory(
      `/candidates/${encodeURIComponent(this.candidateId!)}/claims/${encodeURIComponent(claimId)}/evidence`,
      'POST',
      input,
    );
  }

  private async mutateCareerMemory(
    path: string,
    method: 'POST' | 'PATCH',
    body: unknown,
  ): Promise<CareerMemoryProfile> {
    const response = await this.getValidated(
      path,
      CareerMemoryMutationResponseSchema,
      undefined,
      {
        method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    return { candidate: response.candidate, claims: response.claims };
  }

  private async getValidated<TSchemaType extends TSchema>(
    path: string,
    schema: TSchemaType,
    signal?: AbortSignal,
    init?: RequestInit,
  ): Promise<Static<TSchemaType>> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: { accept: 'application/json' },
        ...(init?.headers ? { headers: init.headers } : {}),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ApiProductRepositoryError('The opportunity API is unavailable.');
    }
    if (!response.ok) {
      throw new ApiProductRepositoryError(
        `The opportunity API returned status ${response.status}.`,
        response.status,
      );
    }
    const body: unknown = await response.json();
    if (!Value.Check(schema, body)) {
      throw new ApiProductRepositoryError(
        'The opportunity API response did not match its contract.',
      );
    }
    return body;
  }
}

function mapSummary(summary: Summary): Opportunity {
  const observedAt = summary.latestObservedAt ?? '';
  return {
    id: summary.id,
    company: company(summary.latestOrganization ?? 'Organization not stated'),
    role: summary.latestTitle ?? 'Untitled opportunity',
    summary: 'Open this opportunity to load its latest evaluation and evidence.',
    description: [],
    location: nonEmpty(summary.latestLocation) ?? 'Location not stated',
    country: 'Not stated',
    workModel: nonEmpty(summary.latestWorkModel) ?? 'Work model not stated',
    remotePolicy: nonEmpty(summary.latestWorkModel) ?? 'Not stated',
    compensation: nonEmpty(summary.latestCompensation),
    employmentType: 'Not stated',
    seniority: 'Not stated',
    technologies: [],
    source: summary.sourceSystems.join(', ') || 'API source',
    sourceReference: summary.latestSnapshotId ?? summary.id,
    freshness: freshness(observedAt),
    publishedAt: observedAt,
    updatedAt: observedAt,
    sponsorship: 'Unknown',
    relocation: 'Unknown',
    eligibility: summary.eligibilityState ?? null,
    eligibilityLabel: summary.eligibilityState ?? 'Not evaluated',
    fit: summary.fitLevel ?? null,
    fitScore: null,
    quality: summary.qualityLevel ?? null,
    qualityScore: null,
    decision: summary.decisionState ?? null,
    decisionLabel: decisionLabel(summary.decisionState),
    decisiveFindingIds: [],
    explanation: summary.decisionState
      ? 'Open the opportunity to view the canonical Decision explanation.'
      : 'No Decision evaluation is available.',
    nextAction: 'Open the opportunity to review the latest snapshot.',
    completeness: null,
    requirements: [],
    eligibilitySignals: [],
    fitSignals: [],
    qualitySignals: [],
    evidence: [],
    history: [],
    tags: [],
  };
}

function mapDetail(response: DetailResponse, summary?: Summary): Opportunity {
  const snapshots = [...response.snapshots].sort((a, b) =>
    a.observedAt.localeCompare(b.observedAt),
  );
  const latest = snapshots.at(-1);
  if (!latest) {
    return mapSummary(summary ?? { id: response.opportunity.id, sourceSystems: [] });
  }
  const evidence = collectEvidence(latest);
  const paragraphs = latest.content
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const base = mapSummary(
    summary ?? {
      id: response.opportunity.id,
      latestTitle: latest.title,
      latestOrganization: latest.organization,
      ...(latest.location ? { latestLocation: latest.location } : {}),
      ...(latest.workModel ? { latestWorkModel: latest.workModel } : {}),
      ...(latest.compensation
        ? { latestCompensation: latest.compensation }
        : {}),
      latestObservedAt: latest.observedAt,
      latestSnapshotId: latest.id,
      sourceSystems: [],
    },
  );
  return {
    ...base,
    role: latest.title,
    company: company(latest.organization),
    summary: paragraphs[0] ?? 'No description was supplied.',
    description: paragraphs,
    location: nonEmpty(latest.location) ?? 'Location not stated',
    workModel: nonEmpty(latest.workModel) ?? 'Work model not stated',
    remotePolicy: nonEmpty(latest.workModel) ?? 'Not stated',
    compensation: nonEmpty(latest.compensation),
    employmentType: nonEmpty(latest.employmentType) ?? 'Not stated',
    publishedAt: snapshots[0]?.observedAt ?? latest.observedAt,
    updatedAt: latest.observedAt,
    freshness: freshness(latest.observedAt),
    eligibility: latest.eligibility?.state ?? null,
    eligibilityLabel: latest.eligibility
      ? eligibilityLabel(latest.eligibility.state)
      : 'Not evaluated',
    fit: latest.fit?.level ?? null,
    fitScore: null,
    quality: latest.quality?.level ?? null,
    qualityScore: null,
    decision: latest.decision?.state ?? null,
    decisionLabel: decisionLabel(latest.decision?.state),
    decisiveFindingIds:
      latest.decision?.reasons.flatMap((reason) => reason.findingIds) ?? [],
    explanation:
      latest.decision?.explanation ?? 'No Decision evaluation is available.',
    nextAction: latest.decision
      ? actionLabel(latest.decision.action)
      : 'Evaluate this snapshot before acting.',
    requirements: unique(
      latest.fit?.findings.map((finding) => finding.requirement) ?? [],
    ),
    eligibilitySignals:
      latest.eligibility?.findings.map((finding) => ({
        id: finding.id,
        label: finding.dimension,
        state: eligibilitySignalState(finding.state),
        summary: finding.summary,
        evidenceIds: finding.evidence.map((item) => item.id),
        confidence: confidence(finding.confidence),
        ...(finding.state === 'investigate' || finding.state === 'unknown'
          ? { investigate: 'Verify details against the cited evidence.' }
          : {}),
      })) ?? [],
    fitSignals:
      latest.fit?.findings.map((finding): FitSignal => ({
        id: finding.id,
        label: finding.label,
        state: fitState(finding.state),
        summary: finding.explanation,
        evidenceIds: finding.evidence.map((item) => item.id),
        impact: finding.modality,
      })) ?? [],
    qualitySignals:
      latest.quality?.findings.map((finding): QualitySignal => ({
        id: finding.id,
        label: finding.label,
        state: qualityState(finding.state),
        summary: finding.explanation,
        evidenceIds: finding.evidence.map((item) => item.id),
      })) ?? [],
    evidence,
    history: snapshots.map((snapshot) => ({
      id: snapshot.id,
      date: snapshot.observedAt,
      title: `Snapshot: ${snapshot.title}`,
      detail: snapshot.decision
        ? `Decision ${snapshot.decision.state} · ${snapshot.decision.explanation}`
        : 'Snapshot retained; Decision not evaluated.',
      kind: snapshot.decision ? 'decision' : 'snapshot',
    })),
    technologies: unique(
      latest.fit?.findings.map((finding) => finding.label) ?? [],
    ),
    tags: unique([
      ...(latest.fit ? [`Fit: ${latest.fit.level}`] : []),
      ...(latest.quality ? [`Quality: ${latest.quality.level}`] : []),
    ]),
  };
}

function collectEvidence(snapshot: Snapshot): EvidenceReference[] {
  const found = new Map<string, EvidenceReference>();
  const groups = [
    snapshot.eligibility?.findings,
    snapshot.fit?.findings,
    snapshot.quality?.findings,
  ];
  for (const findings of groups) {
    for (const finding of findings ?? []) {
      for (const evidence of finding.evidence) {
        if (!found.has(evidence.id)) {
          found.set(evidence.id, {
            id: evidence.id,
            label: evidence.evidenceType,
            source: evidence.sourceReference,
            excerpt: evidence.excerpt,
            state: evidenceState(evidence.state),
            observedAt: snapshot.observedAt,
          });
        }
      }
    }
  }
  return [...found.values()];
}

function company(name: string): Opportunity['company'] {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, initials, mark: 'none', color: '#475569' };
}

function freshness(value: string): string {
  if (!value) return 'Observation time not stated';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  if (days === 0) return 'Observed today';
  return `Observed ${days} day${days === 1 ? '' : 's'} ago`;
}

function eligibilityLabel(state: EligibilityState): string {
  return ({ eligible: 'Eligible', ineligible: 'Ineligible', investigate: 'Investigate', unknown: 'Unknown' })[state];
}

function decisionLabel(state?: Decision): string {
  if (!state) return 'Not evaluated';
  return ({ 'high-priority': 'High priority', consider: 'Consider', investigate: 'Investigate', 'low-priority': 'Low priority', blocked: 'Blocked' })[state];
}

function actionLabel(action: DecisionAction): string {
  return ({ apply: 'Apply', review: 'Review evidence', investigate: 'Verify details', do_not_apply: 'Do not apply' })[action];
}

function eligibilitySignalState(state: string): 'pass' | 'blocker' | 'unknown' | 'inferred' {
  if (state === 'eligible') return 'pass';
  if (state === 'ineligible') return 'blocker';
  if (state === 'investigate') return 'inferred';
  return 'unknown';
}

function confidence(value?: string): 'high' | 'moderate' | 'low' {
  if (value === 'high') return 'high';
  if (value === 'medium' || value === 'moderate') return 'moderate';
  return 'low';
}

function fitState(state: ApiFitState): FitSignal['state'] {
  if (state === 'STRONG_MATCH' || state === 'MATCH') return 'matched';
  if (state === 'TRANSFERABLE') return 'transferable';
  if (state === 'PARTIAL') return 'partial';
  return 'missing';
}

function qualityState(state: 'STRONG' | 'ADEQUATE' | 'WEAK' | 'RISK' | 'UNKNOWN'): QualitySignal['state'] {
  if (state === 'STRONG') return 'positive';
  if (state === 'ADEQUATE') return 'neutral';
  if (state === 'RISK') return 'risk';
  return 'warning';
}

function evidenceState(state: string): EvidenceState {
  if (state === 'source-verified' || state === 'candidate-confirmed' || state === 'unreviewed' || state === 'disputed') return state;
  return 'unreviewed';
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function nonEmpty(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
