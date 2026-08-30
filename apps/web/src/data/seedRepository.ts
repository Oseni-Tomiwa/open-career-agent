import { initialSeedSnapshot, seedProfile } from './seed.js';
import type {
  CandidateClaimState,
  CareerMemoryClaim,
  CareerMemoryProfile,
  CreateCandidateClaimInput,
  Decision,
  ManualEvidenceInput,
  Opportunity,
  ProductRepository,
  ProductSnapshot,
  SearchPreferences,
  UpdateCandidateClaimInput,
  SearchTarget,
  CreateSearchTargetInput,
  UpdateSearchTargetInput,
  DiscoveryRun,
} from './types.js';

export class SeedProductRepository implements ProductRepository {
  public readonly dataSource = 'seed' as const;
  private snapshot: ProductSnapshot = initialSeedSnapshot;
  private careerMemory = seedCareerMemory();
  private mutationSequence = 0;

  public async getSnapshot(): Promise<ProductSnapshot> {
    return Promise.resolve(this.snapshot);
  }

  public async getOpportunity(opportunityId: string): Promise<Opportunity | null> {
    return Promise.resolve(
      this.snapshot.opportunities.find((item) => item.id === opportunityId) ??
        null,
    );
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
    return Promise.resolve(this.careerMemory);
  }

  public async createCandidateClaim(
    input: CreateCandidateClaimInput,
  ): Promise<CareerMemoryProfile> {
    const now = new Date().toISOString();
    const id = `seed-claim-${++this.mutationSequence}`;
    const claim: CareerMemoryClaim = {
      id,
      kind: input.kind,
      value: input.value,
      scope: input.scope ?? null,
      state: input.state,
      confidence: input.confidence ?? null,
      createdAt: now,
      updatedAt: now,
      evidence: input.evidence
        ? [seedManualEvidence(id, input.evidence, now)]
        : [],
    };
    this.careerMemory = {
      ...this.careerMemory,
      candidate: { ...this.careerMemory.candidate, updatedAt: now },
      claims: [...this.careerMemory.claims, claim],
    };
    return Promise.resolve(this.careerMemory);
  }

  public async updateCandidateClaim(
    claimId: string,
    input: UpdateCandidateClaimInput,
  ): Promise<CareerMemoryProfile> {
    const now = new Date().toISOString();
    this.careerMemory = {
      ...this.careerMemory,
      candidate: { ...this.careerMemory.candidate, updatedAt: now },
      claims: this.careerMemory.claims.map((claim) =>
        claim.id === claimId
          ? { ...claim, ...input, updatedAt: now }
          : claim,
      ),
    };
    return Promise.resolve(this.careerMemory);
  }

  public async attachClaimEvidence(
    claimId: string,
    evidence: ManualEvidenceInput,
    transitionTo?: CandidateClaimState,
  ): Promise<CareerMemoryProfile> {
    const now = new Date().toISOString();
    this.careerMemory = {
      ...this.careerMemory,
      candidate: { ...this.careerMemory.candidate, updatedAt: now },
      claims: this.careerMemory.claims.map((claim) =>
        claim.id === claimId
          ? {
              ...claim,
              ...(transitionTo ? { state: transitionTo } : {}),
              updatedAt: now,
              evidence: [
                ...claim.evidence,
                seedManualEvidence(claimId, evidence, now),
              ],
            }
          : claim,
      ),
    };
    return Promise.resolve(this.careerMemory);
  }

  private searchTargets: SearchTarget[] = [
    {
      id: 'st-seed-1',
      candidateId: 'fictional-seed-candidate',
      name: 'Backend Engineer - Germany/Europe',
      enabled: true,
      targetRoles: ['Backend Engineer', 'Platform Engineer'],
      skills: ['TypeScript', 'Node.js'],
      locations: ['Germany', 'Remote Europe'],
      locationIsHardFilter: true,
      workModels: ['remote', 'hybrid'],
      workModelIsHardFilter: false,
      seniorityLevels: ['mid', 'senior'],
      seniorityIsHardFilter: false,
      employmentTypes: ['full-time'],
      employmentTypeIsHardFilter: false,
      requiresSponsorship: false,
      willingToRelocate: true,
      minSalary: 90000,
      currency: 'EUR',
      freshnessDays: 30,
      requiredTerms: ['TypeScript'],
      excludedTerms: ['Internship'],
      sources: [{ sourceSystem: 'greenhouse', boardId: 'figma' }],
      createdAt: '2026-08-28T09:00:00.000Z',
      updatedAt: '2026-08-28T09:00:00.000Z',
    },
  ];

  private discoveryRuns: DiscoveryRun[] = [];

  public getSearchTargets(): Promise<readonly SearchTarget[]> {
    return Promise.resolve(this.searchTargets);
  }

  public createSearchTarget(
    input: CreateSearchTargetInput,
  ): Promise<SearchTarget> {
    const now = new Date().toISOString();
    const created: SearchTarget = {
      id: `st-seed-${Date.now()}`,
      candidateId: 'fictional-seed-candidate',
      name: input.name,
      enabled: input.enabled ?? true,
      targetRoles: input.targetRoles ?? [],
      skills: input.skills ?? [],
      locations: input.locations ?? [],
      locationIsHardFilter: input.locationIsHardFilter ?? false,
      workModels: input.workModels ?? [],
      workModelIsHardFilter: input.workModelIsHardFilter ?? false,
      seniorityLevels: input.seniorityLevels ?? [],
      seniorityIsHardFilter: input.seniorityIsHardFilter ?? false,
      employmentTypes: input.employmentTypes ?? [],
      employmentTypeIsHardFilter: input.employmentTypeIsHardFilter ?? false,
      requiresSponsorship: input.requiresSponsorship ?? null,
      willingToRelocate: input.willingToRelocate ?? null,
      minSalary: input.minSalary ?? null,
      currency: input.currency ?? null,
      freshnessDays: input.freshnessDays ?? 30,
      requiredTerms: input.requiredTerms ?? [],
      excludedTerms: input.excludedTerms ?? [],
      sources: input.sources ?? [{ sourceSystem: 'greenhouse', boardId: 'figma' }],
      createdAt: now,
      updatedAt: now,
    };
    this.searchTargets.push(created);
    return Promise.resolve(created);
  }

  public updateSearchTarget(
    targetId: string,
    input: UpdateSearchTargetInput,
  ): Promise<SearchTarget> {
    const now = new Date().toISOString();
    const index = this.searchTargets.findIndex((t) => t.id === targetId);
    const existing = this.searchTargets[index];
    if (index === -1 || !existing) {
      return Promise.reject(new Error('Search target not found'));
    }
    const updated: SearchTarget = {
      ...existing,
      ...input,
      updatedAt: now,
    };
    this.searchTargets[index] = updated;
    return Promise.resolve(updated);
  }

  public deleteSearchTarget(targetId: string): Promise<boolean> {
    const initialLen = this.searchTargets.length;
    this.searchTargets = this.searchTargets.filter((t) => t.id !== targetId);
    return Promise.resolve(this.searchTargets.length < initialLen);
  }

  public runDiscovery(
    targetId: string,
  ): Promise<{ run: DiscoveryRun; taskEnqueued: boolean }> {
    const now = new Date().toISOString();
    const target = this.searchTargets.find((t) => t.id === targetId);
    const run: DiscoveryRun = {
      id: `dr-seed-${Date.now()}`,
      candidateId: 'fictional-seed-candidate',
      searchTargetId: targetId,
      sourceSystem: target?.sources[0]?.sourceSystem ?? 'greenhouse',
      startedAt: now,
      completedAt: now,
      status: 'COMPLETED',
      discoveredCount: 4,
      acceptedCount: 3,
      rejectedCount: 1,
      rejectedByReason: { 'EXCLUDED_TERM: Internship': 1 },
      errorSummary: null,
    };
    this.discoveryRuns.unshift(run);
    return Promise.resolve({ run, taskEnqueued: true });
  }

  public getDiscoveryRuns(): Promise<readonly DiscoveryRun[]> {
    return Promise.resolve(this.discoveryRuns);
  }
}

function seedCareerMemory(): CareerMemoryProfile {
  const now = '2026-08-28T09:00:00.000Z';
  const evidenceById = new Map(seedProfile.evidence.map((item) => [item.id, item]));
  const claims: CareerMemoryClaim[] = seedProfile.skills.map((skill, index) => ({
    id: `seed-skill-${index + 1}`,
    kind: 'skill',
    value: skill.name,
    scope: null,
    state:
      skill.level === 'Strong'
        ? 'SUPPORTED'
        : skill.level === 'Developing'
          ? 'INFERRED'
          : 'UNKNOWN',
    confidence:
      skill.level === 'Strong'
        ? 'HIGH'
        : skill.level === 'Developing'
          ? 'MODERATE'
          : null,
    createdAt: now,
    updatedAt: now,
    evidence: skill.evidenceIds.flatMap((id) => {
      const item = evidenceById.get(id);
      return item
        ? [
            {
              id: item.id,
              evidenceType: item.type,
              sourceReference: item.source,
              excerpt: item.detail,
              state: item.state,
              createdAt: now,
            },
          ]
        : [];
    }),
  }));
  return {
    candidate: { id: 'fictional-seed-candidate', createdAt: now, updatedAt: now },
    claims,
  };
}

function seedManualEvidence(
  claimId: string,
  input: ManualEvidenceInput,
  createdAt: string,
) {
  return {
    id: `${claimId}-evidence-${createdAt}`,
    evidenceType: input.evidenceType,
    sourceReference:
      input.state === 'candidate-confirmed'
        ? 'candidate-confirmed/manual'
        : (input.sourceReference ?? 'manual reference'),
    excerpt: input.excerpt,
    state: input.state,
    createdAt,
  };
}
