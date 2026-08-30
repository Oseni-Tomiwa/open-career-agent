export type EligibilityState =
  | 'eligible'
  | 'ineligible'
  | 'investigate'
  | 'unknown';

export type FitLevel = 'strong' | 'moderate' | 'weak';
export type QualityLevel = 'strong' | 'moderate' | 'weak' | 'risk';
export type Decision =
  | 'high-priority'
  | 'consider'
  | 'investigate'
  | 'low-priority'
  | 'blocked';

export type EvidenceState =
  | 'source-verified'
  | 'candidate-confirmed'
  | 'unreviewed'
  | 'disputed';

export interface Company {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly mark: 'orbit' | 'bridge' | 'spark' | 'grid' | 'wave' | 'none';
  readonly color: string;
}

export interface EvidenceReference {
  readonly id: string;
  readonly label: string;
  readonly source: string;
  readonly excerpt: string;
  readonly state: EvidenceState;
  readonly observedAt: string;
}

export interface EvaluationSignal {
  readonly id: string;
  readonly label: string;
  readonly state: 'pass' | 'blocker' | 'unknown' | 'inferred';
  readonly summary: string;
  readonly evidenceIds: readonly string[];
  readonly confidence: 'high' | 'moderate' | 'low';
  readonly investigate?: string;
}

export interface FitSignal {
  readonly id: string;
  readonly label: string;
  readonly state: 'matched' | 'partial' | 'missing' | 'transferable';
  readonly summary: string;
  readonly evidenceIds: readonly string[];
  readonly impact: string;
}

export interface QualitySignal {
  readonly id: string;
  readonly label: string;
  readonly state: 'positive' | 'neutral' | 'warning' | 'risk';
  readonly summary: string;
  readonly evidenceIds?: readonly string[];
}

export interface OpportunityHistoryEvent {
  readonly id: string;
  readonly date: string;
  readonly title: string;
  readonly detail: string;
  readonly kind: 'discovered' | 'snapshot' | 'evaluation' | 'decision';
}

export interface Opportunity {
  readonly id: string;
  readonly company: Company;
  readonly role: string;
  readonly summary: string;
  readonly description: readonly string[];
  readonly location: string;
  readonly country: string;
  readonly workModel: string;
  readonly remotePolicy: string;
  readonly compensation: string | null;
  readonly employmentType: string;
  readonly seniority: string;
  readonly technologies: readonly string[];
  readonly source: string;
  readonly sourceReference: string;
  readonly freshness: string;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly sponsorship: 'Available' | 'Unavailable' | 'Unknown' | 'Conflicting';
  readonly relocation: 'Supported' | 'Not offered' | 'Unknown';
  readonly eligibility: EligibilityState | null;
  readonly eligibilityLabel: string;
  readonly fit: FitLevel | null;
  readonly fitScore: number | null;
  readonly quality: QualityLevel | null;
  readonly qualityScore: number | null;
  readonly decision: Decision | null;
  readonly decisionLabel: string;
  readonly decisiveFindingIds: readonly string[];
  readonly explanation: string;
  readonly nextAction: string;
  readonly completeness: number | null;
  readonly requirements: readonly string[];
  readonly eligibilitySignals: readonly EvaluationSignal[];
  readonly fitSignals: readonly FitSignal[];
  readonly qualitySignals: readonly QualitySignal[];
  readonly evidence: readonly EvidenceReference[];
  readonly history: readonly OpportunityHistoryEvent[];
  readonly tags: readonly string[];
  readonly changed?: string;
  readonly isNew?: boolean;
}

export type ApplicationStatus =
  | 'Preparing'
  | 'Applied'
  | 'Assessment'
  | 'Interview'
  | 'Offer'
  | 'Rejected'
  | 'Withdrawn';

export interface ApplicationEvent {
  readonly id: string;
  readonly date: string;
  readonly title: string;
  readonly detail: string;
  readonly actor: 'Candidate' | 'Employer' | 'System';
}

export interface Application {
  readonly id: string;
  readonly opportunityId: string;
  readonly status: ApplicationStatus;
  readonly nextAction: string;
  readonly dueDate: string | null;
  readonly updatedAt: string;
  readonly events: readonly ApplicationEvent[];
}

export interface CareerEvidence {
  readonly id: string;
  readonly label: string;
  readonly type: 'Work' | 'Project' | 'Education' | 'Certification' | 'Candidate';
  readonly source: string;
  readonly state: EvidenceState;
  readonly detail: string;
}

export interface CandidateProfile {
  readonly name: string;
  readonly initials: string;
  readonly headline: string;
  readonly summary: string;
  readonly location: string;
  readonly targetRoles: readonly string[];
  readonly skills: readonly {
    readonly name: string;
    readonly level: 'Strong' | 'Developing' | 'Needs evidence';
    readonly evidenceIds: readonly string[];
  }[];
  readonly experience: readonly {
    readonly role: string;
    readonly organization: string;
    readonly period: string;
    readonly summary: string;
    readonly evidenceIds: readonly string[];
  }[];
  readonly projects: readonly {
    readonly name: string;
    readonly summary: string;
    readonly technologies: readonly string[];
    readonly evidenceIds: readonly string[];
  }[];
  readonly education: readonly string[];
  readonly certifications: readonly string[];
  readonly preferences: readonly string[];
  readonly evidence: readonly CareerEvidence[];
  readonly completeness: number;
}

export type CandidateClaimState =
  | 'SUPPORTED'
  | 'INFERRED'
  | 'UNKNOWN'
  | 'CONFLICTING'
  | 'UNSUPPORTED';

export type CandidateClaimConfidence = 'HIGH' | 'MODERATE' | 'LOW';

export interface CareerMemoryEvidence {
  readonly id: string;
  readonly evidenceType: string;
  readonly sourceReference: string;
  readonly excerpt: string;
  readonly state: EvidenceState;
  readonly createdAt: string;
}

export interface CareerMemoryClaim {
  readonly id: string;
  readonly kind: string;
  readonly value: string;
  readonly scope: string | null;
  readonly state: CandidateClaimState;
  readonly confidence: CandidateClaimConfidence | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly evidence: readonly CareerMemoryEvidence[];
}

export interface CareerMemoryProfile {
  readonly candidate: {
    readonly id: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly claims: readonly CareerMemoryClaim[];
}

export interface ManualEvidenceInput {
  readonly evidenceType: string;
  readonly sourceReference?: string;
  readonly excerpt: string;
  readonly state: 'candidate-confirmed' | 'unreviewed' | 'disputed';
}

export interface CreateCandidateClaimInput {
  readonly kind: string;
  readonly value: string;
  readonly scope?: string;
  readonly state: 'UNKNOWN' | 'SUPPORTED';
  readonly confidence?: CandidateClaimConfidence;
  readonly evidence?: ManualEvidenceInput;
}

export interface UpdateCandidateClaimInput {
  readonly value?: string;
  readonly scope?: string | null;
  readonly state?: CandidateClaimState;
  readonly confidence?: CandidateClaimConfidence | null;
}

export interface SearchTargetSource {
  readonly sourceSystem: string;
  readonly boardId: string;
}

export interface SearchTarget {
  readonly id: string;
  readonly candidateId: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly targetRoles: readonly string[];
  readonly skills: readonly string[];
  readonly locations: readonly string[];
  readonly locationIsHardFilter: boolean;
  readonly workModels: readonly ('remote' | 'hybrid' | 'onsite')[];
  readonly workModelIsHardFilter: boolean;
  readonly seniorityLevels: readonly ('internship' | 'entry' | 'junior' | 'mid' | 'senior')[];
  readonly seniorityIsHardFilter: boolean;
  readonly employmentTypes: readonly ('full-time' | 'contract' | 'internship')[];
  readonly employmentTypeIsHardFilter: boolean;
  readonly requiresSponsorship: boolean | null;
  readonly willingToRelocate: boolean | null;
  readonly minSalary: number | null;
  readonly currency: string | null;
  readonly freshnessDays: number | null;
  readonly requiredTerms: readonly string[];
  readonly excludedTerms: readonly string[];
  readonly sources: readonly SearchTargetSource[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateSearchTargetInput {
  readonly name: string;
  readonly enabled?: boolean;
  readonly targetRoles?: readonly string[];
  readonly skills?: readonly string[];
  readonly locations?: readonly string[];
  readonly locationIsHardFilter?: boolean;
  readonly workModels?: readonly ('remote' | 'hybrid' | 'onsite')[];
  readonly workModelIsHardFilter?: boolean;
  readonly seniorityLevels?: readonly ('internship' | 'entry' | 'junior' | 'mid' | 'senior')[];
  readonly seniorityIsHardFilter?: boolean;
  readonly employmentTypes?: readonly ('full-time' | 'contract' | 'internship')[];
  readonly employmentTypeIsHardFilter?: boolean;
  readonly requiresSponsorship?: boolean | null;
  readonly willingToRelocate?: boolean | null;
  readonly minSalary?: number | null;
  readonly currency?: string | null;
  readonly freshnessDays?: number | null;
  readonly requiredTerms?: readonly string[];
  readonly excludedTerms?: readonly string[];
  readonly sources?: readonly SearchTargetSource[];
}

export type UpdateSearchTargetInput = Partial<CreateSearchTargetInput>;

export interface DiscoveryRun {
  readonly id: string;
  readonly candidateId: string;
  readonly searchTargetId: string;
  readonly sourceSystem: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  readonly discoveredCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly rejectedByReason?: Record<string, number> | null;
  readonly errorSummary: string | null;
}

export interface SearchPreferences {
  readonly targetRoles: readonly string[];
  readonly locations: readonly string[];
  readonly remotePreferences: readonly string[];
  readonly salaryMinimum: number;
  readonly currency: string;
  readonly employmentTypes: readonly string[];
  readonly requiresSponsorship: boolean;
  readonly willingToRelocate: boolean;
  readonly sources: readonly string[];
  readonly freshnessDays: number;
}

export interface SourceStatus {
  readonly name: 'Greenhouse' | 'Ashby' | 'Lever';
  readonly state: 'Ready' | 'Needs attention' | 'Paused';
  readonly lastSeededScan: string;
  readonly detail: string;
}

export interface ProductSnapshot {
  readonly opportunities: readonly Opportunity[];
  readonly applications: readonly Application[];
  readonly profile: CandidateProfile;
  readonly searchPreferences: SearchPreferences;
  readonly sourceStatuses: readonly SourceStatus[];
}

export interface ProductRepository {
  readonly dataSource: 'seed' | 'api';
  getSnapshot(): Promise<ProductSnapshot>;
  getOpportunity(
    opportunityId: string,
    signal?: AbortSignal,
  ): Promise<Opportunity | null>;
  setOpportunityDecision(
    opportunityId: string,
    decision: Decision,
  ): Promise<ProductSnapshot>;
  saveSearchPreferences(
    preferences: SearchPreferences,
  ): Promise<ProductSnapshot>;
  getCareerMemory(): Promise<CareerMemoryProfile>;
  createCandidateClaim(
    input: CreateCandidateClaimInput,
  ): Promise<CareerMemoryProfile>;
  updateCandidateClaim(
    claimId: string,
    input: UpdateCandidateClaimInput,
  ): Promise<CareerMemoryProfile>;
  attachClaimEvidence(
    claimId: string,
    evidence: ManualEvidenceInput,
    transitionTo?: CandidateClaimState,
  ): Promise<CareerMemoryProfile>;
  getSearchTargets(): Promise<readonly SearchTarget[]>;
  createSearchTarget(input: CreateSearchTargetInput): Promise<SearchTarget>;
  updateSearchTarget(
    targetId: string,
    input: UpdateSearchTargetInput,
  ): Promise<SearchTarget>;
  deleteSearchTarget(targetId: string): Promise<boolean>;
  runDiscovery(
    targetId: string,
  ): Promise<{ run: DiscoveryRun; taskEnqueued: boolean }>;
  getDiscoveryRuns(): Promise<readonly DiscoveryRun[]>;
}
