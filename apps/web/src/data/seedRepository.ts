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
