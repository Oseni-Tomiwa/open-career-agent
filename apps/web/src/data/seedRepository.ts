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
  TodayDashboardResponse,
  ApplicationItem,
  ApplicationDetailResponse,
  ApplicationStatus,
  CreateApplicationInput,
  UpdateApplicationInput,
  AddApplicationEventInput,
} from './types.js';

export class SeedProductRepository implements ProductRepository {
  public readonly dataSource = 'seed' as const;
  private snapshot: ProductSnapshot = initialSeedSnapshot;
  private careerMemory = seedCareerMemory();
  private mutationSequence = 0;
  private readonly applicationDetails = new Map<
    string,
    ApplicationDetailResponse
  >();

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

  public getTodayDashboard(): Promise<TodayDashboardResponse> {
    const priorities = this.snapshot.opportunities
      .filter((o) => o.decision === 'high-priority')
      .map((o) => ({
        opportunityId: o.id,
        title: o.role,
        organization: o.company.name,
        location: o.location,
        decisionState: 'high-priority',
        action: o.nextAction,
        explanation: o.explanation,
        observedAt: o.updatedAt,
        reasonCodes: [],
        freshnessBucket: 'recent',
        applicationStatus: 'not_started',
      }));

    const investigations = this.snapshot.opportunities
      .filter(
        (o) =>
          o.decision === 'investigate' || o.eligibility === 'unknown',
      )
      .map((o) => ({
        opportunityId: o.id,
        title: o.role,
        organization: o.company.name,
        category: 'investigate' as const,
        titleOrSummary: o.eligibilityLabel,
        explanation: o.eligibilityLabel,
        nextAction: o.nextAction,
        eligibilityState: o.eligibility,
        decisionState: o.decision,
        reasonCodes: [],
      }));

    const changed = this.snapshot.opportunities
      .filter((o) => o.changed || o.isNew)
      .map((o) => ({
        opportunityId: o.id,
        title: o.role,
        organization: o.company.name,
        changeType: 'newly_discovered' as const,
        headline: o.changed ?? 'New opportunity discovered',
        detail: o.summary,
        occurredAt: o.updatedAt,
      }));

    return Promise.resolve({
      generatedAt: new Date().toISOString(),
      greetingName: this.snapshot.profile.name.split(' ')[0] ?? 'there',
      summaryText: `${priorities.length} priority opportunities ready for action, while ${investigations.length} items need review.`,
      timeWindowDays: 7,
      priorityOpportunities: priorities,
      needsAttention: investigations,
      recentChanges: changed,
      discoveryActivity: [],
      applicationActivity: [],
      careerMemoryAttention: [],
    });
  }

  public getApplications(): Promise<readonly ApplicationItem[]> {
    const apps: ApplicationItem[] = this.snapshot.applications.map((a) => {
      const opp = this.snapshot.opportunities.find((o) => o.id === a.opportunityId);
      return {
        id: a.id,
        opportunityId: a.opportunityId,
        title: opp?.role ?? 'Opportunity',
        organization: opp?.company.name ?? 'Organization',
        location: opp?.location ?? null,
        status: a.status,
        nextAction: a.nextAction,
        dueDate: a.dueDate,
        currentDecision: opp?.decision ?? null,
        submittedAt: a.updatedAt,
        followUpDueAt: a.dueDate ?? null,
        lastEventAt: a.updatedAt,
        createdAt: a.updatedAt,
        updatedAt: a.updatedAt,
      };
    });
    return Promise.resolve(apps);
  }

  public getApplication(
    applicationId: string,
  ): Promise<ApplicationDetailResponse | null> {
    const cached = this.applicationDetails.get(applicationId);
    if (cached) return Promise.resolve(cached);
    const app = this.snapshot.applications.find(
      (a) => a.id === applicationId,
    );
    if (!app) return Promise.resolve(null);
    const opp = this.snapshot.opportunities.find((o) => o.id === app.opportunityId);

    const detail: ApplicationDetailResponse = {
      id: app.id,
      candidateId: 'fictional-seed-candidate',
      opportunityId: app.opportunityId,
      status: app.status,
      originatingDecisionId: null,
      originatingDecisionState: opp?.decision ?? null,
      originatingDecisionAction: 'apply',
      submittedAt: app.updatedAt,
      followUpDueAt: app.dueDate ?? null,
      followUpNote: app.nextAction ?? null,
      followUpCompletedAt: null,
      note: app.nextAction ?? null,
      createdAt: app.updatedAt,
      updatedAt: app.updatedAt,
      opportunity: opp
        ? {
            id: opp.id,
            title: opp.role,
            organization: opp.company.name,
            location: opp.location,
            sourceUrl: 'https://careers.example.com/jobs/' + opp.id,
          }
        : null,
      currentDecision: opp
        ? {
            state: opp.decision ?? 'high-priority',
            action: 'apply',
            explanation: opp.eligibilityLabel,
          }
        : null,
      events: app.events.map((ev) => ({
        id: ev.id,
        applicationId: app.id,
        eventType: 'status_changed',
        title: ev.title,
        detail: ev.detail,
        occurredAt: ev.date,
        actor: ev.actor,
      })),
    };
    this.applicationDetails.set(applicationId, detail);
    return Promise.resolve(detail);
  }

  public async createApplication(
    input: CreateApplicationInput,
  ): Promise<ApplicationDetailResponse> {
    const existingSeed = this.snapshot.applications.find(
      (application) => application.opportunityId === input.opportunityId,
    );
    if (existingSeed) {
      const existing = await this.getApplication(existingSeed.id);
      if (existing) return existing;
    }
    const opp = this.snapshot.opportunities.find(
      (o) => o.id === input.opportunityId,
    );
    const status: ApplicationStatus = input.status ?? 'Saved';
    const now = new Date().toISOString();
    const id = `app-seed-${input.opportunityId}`;
    this.snapshot = {
      ...this.snapshot,
      applications: [
        ...this.snapshot.applications,
        {
          id,
          opportunityId: input.opportunityId,
          status,
          nextAction:
            input.note ?? `Follow up on ${status.toLowerCase()} status`,
          dueDate: null,
          updatedAt: now,
          events: [
            {
              id: `ev-created-${++this.mutationSequence}`,
              date: now,
              title: 'Application created',
              detail: `Application created with status ${status}`,
              actor: 'Candidate',
            },
          ],
        },
      ],
    };
    const detail: ApplicationDetailResponse = {
      id,
      candidateId: 'fictional-seed-candidate',
      opportunityId: input.opportunityId,
      status,
      originatingDecisionId: input.originatingDecisionId ?? null,
      originatingDecisionState: opp?.decision ?? 'high-priority',
      originatingDecisionAction: 'apply',
      submittedAt: status === 'Applied' ? now : null,
      followUpDueAt: null,
      followUpNote: null,
      followUpCompletedAt: null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
      opportunity: opp
        ? {
            id: opp.id,
            title: opp.role,
            organization: opp.company.name,
            location: opp.location,
            sourceUrl: 'https://careers.example.com/jobs/' + opp.id,
          }
        : null,
      currentDecision: opp
        ? {
            state: opp.decision ?? 'high-priority',
            action: 'apply',
            explanation: opp.eligibilityLabel,
          }
        : null,
      events: [
        {
          id: `ev-created-${this.mutationSequence}`,
          applicationId: id,
          eventType: 'application_created',
          detail: `Application created with status ${status}`,
          occurredAt: now,
          actor: 'Candidate',
        },
      ],
    };
    this.applicationDetails.set(id, detail);
    return detail;
  }

  public updateApplication(
    applicationId: string,
    input: UpdateApplicationInput,
  ): Promise<ApplicationDetailResponse> {
    return this.getApplication(applicationId).then((app) => {
      if (!app) {
        throw new Error(`Application ${applicationId} not found`);
      }
      if (input.expectedUpdatedAt && input.expectedUpdatedAt !== app.updatedAt) {
        throw new Error(`Stale write conflict on application '${applicationId}'.`);
      }
      const now = new Date(
        Math.max(Date.now(), new Date(app.updatedAt).getTime() + 1),
      ).toISOString();
      const updatedStatus = input.status ?? app.status;
      const statusChanged = updatedStatus !== app.status;
      if (statusChanged) validateSeedTransition(app.status, updatedStatus);
      const noteChanged =
        input.note !== undefined && input.note !== app.note;
      const followUpDueChanged =
        input.followUpDueAt !== undefined &&
        input.followUpDueAt !== app.followUpDueAt;
      const followUpNoteChanged =
        input.followUpNote !== undefined &&
        input.followUpNote !== app.followUpNote;
      const repeatedCompletion = Boolean(
        app.followUpCompletedAt && input.followUpCompletedAt,
      );
      const followUpCompletionChanged =
        input.followUpCompletedAt !== undefined &&
        !repeatedCompletion &&
        input.followUpCompletedAt !== app.followUpCompletedAt;
      if (
        !statusChanged &&
        !noteChanged &&
        !followUpDueChanged &&
        !followUpNoteChanged &&
        !followUpCompletionChanged
      ) {
        return app;
      }
      const followUpCompletedAt =
        repeatedCompletion
          ? app.followUpCompletedAt
          : input.followUpCompletedAt !== undefined
            ? input.followUpCompletedAt
            : app.followUpCompletedAt;
      const events = [
        ...app.events,
        ...(statusChanged
          ? [
              {
                id: `ev-updated-${++this.mutationSequence}`,
                applicationId: app.id,
                eventType: 'status_changed',
                detail: `Status changed from ${app.status} to ${updatedStatus}`,
                occurredAt: now,
                actor: 'Candidate' as const,
              },
            ]
          : []),
        ...(noteChanged
          ? [
              {
                id: `ev-note-${++this.mutationSequence}`,
                applicationId: app.id,
                eventType: 'note_added',
                detail: input.note ? `Note updated: ${input.note}` : 'Note cleared',
                occurredAt: now,
                actor: 'Candidate' as const,
              },
            ]
          : []),
        ...(followUpDueChanged || followUpNoteChanged
          ? [
              {
                id: `ev-follow-up-${++this.mutationSequence}`,
                applicationId: app.id,
                eventType: 'follow_up_set',
                detail: input.followUpDueAt
                  ? `Follow-up scheduled for ${input.followUpDueAt}`
                  : 'Follow-up updated',
                occurredAt: now,
                actor: 'Candidate' as const,
              },
            ]
          : []),
        ...(input.followUpCompletedAt && !app.followUpCompletedAt
          ? [
              {
                id: `ev-follow-up-complete-${++this.mutationSequence}`,
                applicationId: app.id,
                eventType: 'follow_up_completed',
                detail: 'Follow-up marked completed',
                occurredAt: now,
                actor: 'Candidate' as const,
              },
            ]
          : []),
      ];
      const updated: ApplicationDetailResponse = {
        ...app,
        status: updatedStatus,
        note: input.note !== undefined ? input.note : app.note,
        followUpDueAt:
          input.followUpDueAt !== undefined
            ? input.followUpDueAt
            : app.followUpDueAt,
        followUpNote:
          input.followUpNote !== undefined
            ? input.followUpNote
            : app.followUpNote,
        followUpCompletedAt,
        updatedAt: now,
        events,
      };
      this.snapshot = {
        ...this.snapshot,
        applications: this.snapshot.applications.map((item) =>
          item.id === applicationId
            ? {
                ...item,
                status: updatedStatus,
                nextAction: updated.followUpNote ?? item.nextAction,
                dueDate:
                  updated.followUpDueAt && !updated.followUpCompletedAt
                    ? updated.followUpDueAt
                    : null,
                updatedAt: now,
                events: events.map((event) => ({
                  id: event.id,
                  date: event.occurredAt,
                  title: event.eventType.replace(/_/g, ' '),
                  detail: event.detail,
                  actor: event.actor,
                })),
              }
            : item,
        ),
      };
      this.applicationDetails.set(applicationId, updated);
      return updated;
    });
  }

  public addApplicationEvent(
    applicationId: string,
    input: AddApplicationEventInput,
  ): Promise<ApplicationDetailResponse> {
    return this.getApplication(applicationId).then((app) => {
      if (!app) throw new Error(`Application ${applicationId} not found`);
      const now = new Date().toISOString();
      const updated: ApplicationDetailResponse = {
        ...app,
        updatedAt: now,
        events: [
          ...app.events,
          {
            id: `ev-custom-${Date.now()}`,
            applicationId: app.id,
            eventType: input.eventType,
            detail: input.detail,
            occurredAt: now,
            actor: 'Candidate',
          },
        ],
      };
      this.snapshot = {
        ...this.snapshot,
        applications: this.snapshot.applications.map((item) =>
          item.id === applicationId
            ? {
                ...item,
                updatedAt: now,
                events: updated.events.map((event) => ({
                  id: event.id,
                  date: event.occurredAt,
                  title: event.eventType.replace(/_/g, ' '),
                  detail: event.detail,
                  actor: event.actor,
                })),
              }
            : item,
        ),
      };
      this.applicationDetails.set(applicationId, updated);
      return updated;
    });
  }
}

const SEED_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  Saved: ['Preparing', 'Applied', 'Withdrawn', 'Closed'],
  Preparing: ['Applied', 'Withdrawn', 'Closed'],
  Applied: ['Assessment', 'Interview', 'Offer', 'Rejected', 'Withdrawn', 'Closed'],
  Assessment: ['Interview', 'Offer', 'Rejected', 'Withdrawn', 'Closed'],
  Interview: ['Offer', 'Rejected', 'Withdrawn', 'Closed'],
  Offer: ['Closed', 'Withdrawn'],
  Rejected: [],
  Withdrawn: [],
  Closed: [],
};

function validateSeedTransition(
  current: ApplicationStatus,
  next: ApplicationStatus,
): void {
  if (!SEED_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid application status transition from '${current}' to '${next}'.`);
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
