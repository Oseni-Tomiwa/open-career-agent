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
  | 'ineligible';

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
  readonly workModel: 'Remote' | 'Hybrid' | 'On-site';
  readonly remotePolicy: string;
  readonly compensation: string | null;
  readonly employmentType: 'Full-time' | 'Internship' | 'Contract';
  readonly seniority: 'Early career' | 'Mid-level' | 'Senior' | 'Lead';
  readonly technologies: readonly string[];
  readonly source: 'Greenhouse' | 'Ashby' | 'Lever';
  readonly sourceReference: string;
  readonly freshness: string;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly sponsorship: 'Available' | 'Unavailable' | 'Unknown' | 'Conflicting';
  readonly relocation: 'Supported' | 'Not offered' | 'Unknown';
  readonly eligibility: EligibilityState;
  readonly eligibilityLabel: string;
  readonly fit: FitLevel;
  readonly fitScore: number;
  readonly quality: QualityLevel;
  readonly qualityScore: number;
  readonly decision: Decision;
  readonly decisionLabel: string;
  readonly explanation: string;
  readonly nextAction: string;
  readonly completeness: number;
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
  getSnapshot(): Promise<ProductSnapshot>;
  setOpportunityDecision(
    opportunityId: string,
    decision: Decision,
  ): Promise<ProductSnapshot>;
  saveSearchPreferences(
    preferences: SearchPreferences,
  ): Promise<ProductSnapshot>;
}
