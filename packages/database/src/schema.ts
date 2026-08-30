import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const BACKGROUND_TASK_STATES = [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
] as const;

export type BackgroundTaskState = (typeof BACKGROUND_TASK_STATES)[number];

export const backgroundTasks = sqliteTable(
  'background_tasks',
  {
    id: text('id').primaryKey(),
    taskType: text('task_type').notNull(),
    payload: text('payload').notNull(),
    state: text('state', { enum: BACKGROUND_TASK_STATES })
      .notNull()
      .default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    availableAt: integer('available_at', { mode: 'timestamp_ms' }).notNull(),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: integer('lease_expires_at', { mode: 'timestamp_ms' }),
    idempotencyKey: text('idempotency_key'),
    lastError: text('last_error'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('background_tasks_idempotency_key_unique').on(
      table.idempotencyKey,
    ),
    index('background_tasks_claimable_idx').on(
      table.state,
      table.availableAt,
      table.createdAt,
    ),
    index('background_tasks_expired_lease_idx').on(
      table.state,
      table.leaseExpiresAt,
    ),
    check(
      'background_tasks_state_check',
      sql`${table.state} in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')`,
    ),
    check('background_tasks_attempts_check', sql`${table.attempts} >= 0`),
    check('background_tasks_max_attempts_check', sql`${table.maxAttempts} > 0`),
  ],
);

export const backgroundTaskEvents = sqliteTable(
  'background_task_events',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => backgroundTasks.id, { onDelete: 'cascade' }),
    fromState: text('from_state', { enum: BACKGROUND_TASK_STATES }),
    toState: text('to_state', { enum: BACKGROUND_TASK_STATES }).notNull(),
    detail: text('detail'),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('background_task_events_task_time_idx').on(
      table.taskId,
      table.occurredAt,
    ),
  ],
);

export type BackgroundTaskRow = typeof backgroundTasks.$inferSelect;
export type BackgroundTaskEventRow = typeof backgroundTaskEvents.$inferSelect;

// ==========================================
// DOMAIN PERSISTENCE FOUNDATION
// ==========================================

export const candidates = sqliteTable('candidates', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const CLAIM_STATES = [
  'SUPPORTED',
  'INFERRED',
  'UNKNOWN',
  'CONFLICTING',
  'UNSUPPORTED',
] as const;

export const CLAIM_CONFIDENCE_LEVELS = ['HIGH', 'MODERATE', 'LOW'] as const;

export const candidateClaims = sqliteTable('candidate_claims', {
  id: text('id').primaryKey(),
  candidateId: text('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'restrict' }),
  kind: text('kind').notNull(),
  value: text('value').notNull(),
  scope: text('scope'),
  state: text('state', { enum: CLAIM_STATES }).notNull(),
  confidence: text('confidence', { enum: CLAIM_CONFIDENCE_LEVELS }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const opportunities = sqliteTable('opportunities', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const opportunitySnapshots = sqliteTable(
  'opportunity_snapshots',
  {
    id: text('id').primaryKey(),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'restrict' }),
    observedAt: integer('observed_at', { mode: 'timestamp_ms' }).notNull(),
    title: text('title').notNull(),
    organization: text('organization').notNull(),
    location: text('location'),
    workModel: text('work_model'),
    employmentType: text('employment_type'),
    compensation: text('compensation'),
    content: text('content').notNull(),
    fingerprint: text('fingerprint').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('opportunity_snapshots_opp_time_idx').on(
      table.opportunityId,
      table.observedAt,
    ),
  ],
);

export const opportunitySnapshotSources = sqliteTable(
  'opportunity_snapshot_sources',
  {
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => opportunitySnapshots.id, { onDelete: 'restrict' }),
    sourceObservationId: text('source_observation_id')
      .notNull()
      .references(() => sourceObservations.id, { onDelete: 'restrict' }),
  },
  (table) => [
    index('oss_snapshot_idx').on(table.snapshotId),
    uniqueIndex('oss_unique_idx').on(
      table.snapshotId,
      table.sourceObservationId,
    ),
  ],
);

export const sourceListings = sqliteTable(
  'source_listings',
  {
    id: text('id').primaryKey(),
    opportunityId: text('opportunity_id').references(() => opportunities.id, {
      onDelete: 'restrict',
    }),
    sourceSystem: text('source_system').notNull(),
    sourceExternalId: text('source_external_id').notNull(),
    sourceUrl: text('source_url'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('source_listings_system_ext_idx').on(
      table.sourceSystem,
      table.sourceExternalId,
    ),
  ],
);

export const sourceObservations = sqliteTable(
  'source_observations',
  {
    id: text('id').primaryKey(),
    sourceListingId: text('source_listing_id')
      .notNull()
      .references(() => sourceListings.id, { onDelete: 'restrict' }),
    rawPayload: text('raw_payload').notNull(),
    fingerprint: text('fingerprint').notNull(),
    observedAt: integer('observed_at', { mode: 'timestamp_ms' }).notNull(),
    sourceUpdatedAt: integer('source_updated_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('source_observations_listing_time_idx').on(
      table.sourceListingId,
      table.observedAt,
    ),
    uniqueIndex('source_observations_listing_fingerprint_idx').on(
      table.sourceListingId,
      table.fingerprint,
    ),
  ],
);

export const EVIDENCE_STATES = [
  'source-verified',
  'candidate-confirmed',
  'unreviewed',
  'disputed',
] as const;

export const evidence = sqliteTable('evidence', {
  id: text('id').primaryKey(),
  evidenceType: text('evidence_type').notNull(),
  sourceReference: text('source_reference').notNull(),
  excerpt: text('excerpt').notNull(),
  state: text('state', { enum: EVIDENCE_STATES })
    .notNull()
    .default('unreviewed'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const candidateClaimEvidence = sqliteTable(
  'candidate_claim_evidence',
  {
    claimId: text('claim_id')
      .notNull()
      .references(() => candidateClaims.id, { onDelete: 'cascade' }),
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('cce_claim_idx').on(table.claimId),
    index('cce_evidence_idx').on(table.evidenceId),
    uniqueIndex('cce_unique_idx').on(table.claimId, table.evidenceId),
  ],
);

export const opportunitySnapshotEvidence = sqliteTable(
  'opportunity_snapshot_evidence',
  {
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => opportunitySnapshots.id, { onDelete: 'cascade' }),
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('ose_snapshot_idx').on(table.snapshotId),
    index('ose_evidence_idx').on(table.evidenceId),
    uniqueIndex('ose_unique_idx').on(table.snapshotId, table.evidenceId),
  ],
);

export const ELIGIBILITY_STATES = [
  'eligible',
  'ineligible',
  'investigate',
  'unknown',
] as const;

export const FIT_LEVELS = ['strong', 'moderate', 'weak'] as const;
export const QUALITY_LEVELS = ['strong', 'moderate', 'weak', 'risk'] as const;

export const evaluations = sqliteTable(
  'evaluations',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'restrict' }),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => opportunitySnapshots.id, { onDelete: 'restrict' }),
    eligibilityState: text('eligibility_state', {
      enum: ELIGIBILITY_STATES,
    }).notNull(),
    eligibilityEngineVersion: text('eligibility_engine_version'),
    eligibilityInputFingerprint: text('eligibility_input_fingerprint'),
    fitLevel: text('fit_level', { enum: FIT_LEVELS }),
    fitEngineVersion: text('fit_engine_version'),
    fitInputFingerprint: text('fit_input_fingerprint'),
    fitSummary: text('fit_summary'),
    qualityLevel: text('quality_level', { enum: QUALITY_LEVELS }),
    qualityEngineVersion: text('quality_engine_version'),
    qualityInputFingerprint: text('quality_input_fingerprint'),
    qualitySummary: text('quality_summary'),
    qualityEvaluatedAt: integer('quality_evaluated_at', {
      mode: 'timestamp_ms',
    }),
    qualityFreshnessBucket: text('quality_freshness_bucket'),
    supersedesEvaluationId: text('supersedes_evaluation_id'),
    supersededAt: integer('superseded_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('evaluations_candidate_snapshot_idx').on(
      table.candidateId,
      table.snapshotId,
    ),
  ],
);

export const EVALUATION_CATEGORY = ['eligibility', 'fit', 'quality'] as const;

export const evaluationFindings = sqliteTable(
  'evaluation_findings',
  {
    id: text('id').primaryKey(),
    evaluationId: text('evaluation_id')
      .notNull()
      .references(() => evaluations.id, { onDelete: 'cascade' }), // finding deletes if evaluation deletes
    category: text('category', { enum: EVALUATION_CATEGORY }).notNull(),
    dimensionKey: text('dimension_key').notNull(),
    label: text('label'),
    state: text('state').notNull(),
    summary: text('summary').notNull(),
    confidence: text('confidence'),
    modality: text('modality'),
    requirementText: text('requirement_text'),
    explanation: text('explanation'),
  },
  (table) => [
    index('eval_finding_eval_idx').on(table.evaluationId),
    uniqueIndex('eval_finding_unique_idx').on(
      table.evaluationId,
      table.category,
      table.dimensionKey,
    ),
  ],
);

export const evaluationFindingEvidence = sqliteTable(
  'evaluation_finding_evidence',
  {
    findingId: text('finding_id')
      .notNull()
      .references(() => evaluationFindings.id, { onDelete: 'cascade' }),
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('efe_finding_idx').on(table.findingId),
    uniqueIndex('efe_unique_idx').on(table.findingId, table.evidenceId),
  ],
);

export const evaluationEvidence = sqliteTable(
  'evaluation_evidence',
  {
    evaluationId: text('evaluation_id')
      .notNull()
      .references(() => evaluations.id, { onDelete: 'cascade' }),
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
    dimension: text('dimension').notNull(),
  },
  (table) => [
    index('eval_ev_eval_idx').on(table.evaluationId),
    uniqueIndex('eval_ev_unique_idx').on(
      table.evaluationId,
      table.evidenceId,
      table.dimension,
    ),
  ],
);

export const DECISION_STATES = [
  'high-priority',
  'consider',
  'investigate',
  'low-priority',
  'blocked',
] as const;

export const DECISION_ACTIONS = [
  'apply',
  'review',
  'investigate',
  'do_not_apply',
] as const;

export const decisions = sqliteTable(
  'decisions',
  {
    id: text('id').primaryKey(),
    evaluationId: text('evaluation_id')
      .notNull()
      .references(() => evaluations.id, { onDelete: 'restrict' }),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'restrict' }),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => opportunitySnapshots.id, { onDelete: 'restrict' }),
    priority: text('priority', { enum: DECISION_STATES }).notNull(),
    action: text('action', { enum: DECISION_ACTIONS }),
    explanation: text('explanation').notNull(),
    engineVersion: text('engine_version'),
    inputFingerprint: text('input_fingerprint'),
    eligibilityInputFingerprint: text(
      'eligibility_input_fingerprint',
    ).notNull(),
    fitInputFingerprint: text('fit_input_fingerprint').notNull(),
    qualityInputFingerprint: text('quality_input_fingerprint').notNull(),
    reasonCodes: text('reason_codes'),
    evaluatedAt: integer('evaluated_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('decisions_eval_idx').on(table.evaluationId),
    index('decisions_input_idx').on(
      table.candidateId,
      table.snapshotId,
      table.engineVersion,
      table.inputFingerprint,
    ),
    uniqueIndex('decisions_semantic_input_unique').on(
      table.candidateId,
      table.snapshotId,
      table.engineVersion,
      table.inputFingerprint,
    ),
  ],
);

export const decisionReasons = sqliteTable(
  'decision_reasons',
  {
    id: text('id').primaryKey(),
    decisionId: text('decision_id')
      .notNull()
      .references(() => decisions.id, { onDelete: 'cascade' }),
    reasonCode: text('reason_code').notNull(),
    findingId: text('finding_id')
      .notNull()
      .references(() => evaluationFindings.id, { onDelete: 'restrict' }),
  },
  (table) => [
    index('decision_reason_decision_idx').on(table.decisionId),
    uniqueIndex('decision_reason_unique').on(
      table.decisionId,
      table.reasonCode,
      table.findingId,
    ),
  ],
);

export const APPLICATION_STATUSES = [
  'Preparing',
  'Applied',
  'Assessment',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
] as const;

export const applications = sqliteTable(
  'applications',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'restrict' }),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'restrict' }),
    status: text('status', { enum: APPLICATION_STATUSES }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('applications_candidate_opportunity_idx').on(
      table.candidateId,
      table.opportunityId,
    ),
  ],
);

export const applicationEvents = sqliteTable(
  'application_events',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'restrict' }),
    eventType: text('event_type').notNull(),
    detail: text('detail').notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('app_events_app_time_idx').on(table.applicationId, table.occurredAt),
  ],
);

// ==========================================
// SEARCH & DISCOVERY CONFIGURATION
// ==========================================

export const DISCOVERY_RUN_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
] as const;

export type DiscoveryRunStatus = (typeof DISCOVERY_RUN_STATUSES)[number];

export const searchTargets = sqliteTable(
  'search_targets',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    targetRolesJson: text('target_roles_json').notNull().default('[]'),
    skillsJson: text('skills_json').notNull().default('[]'),
    locationsJson: text('locations_json').notNull().default('[]'),
    locationIsHardFilter: integer('location_is_hard_filter', {
      mode: 'boolean',
    })
      .notNull()
      .default(false),
    workModelsJson: text('work_models_json').notNull().default('[]'),
    workModelIsHardFilter: integer('work_model_is_hard_filter', {
      mode: 'boolean',
    })
      .notNull()
      .default(false),
    seniorityLevelsJson: text('seniority_levels_json').notNull().default('[]'),
    seniorityIsHardFilter: integer('seniority_is_hard_filter', {
      mode: 'boolean',
    })
      .notNull()
      .default(false),
    employmentTypesJson: text('employment_types_json').notNull().default('[]'),
    employmentTypeIsHardFilter: integer('employment_type_is_hard_filter', {
      mode: 'boolean',
    })
      .notNull()
      .default(false),
    requiresSponsorship: integer('requires_sponsorship', { mode: 'boolean' }),
    willingToRelocate: integer('willing_to_relocate', { mode: 'boolean' }),
    minSalary: integer('min_salary'),
    currency: text('currency'),
    freshnessDays: integer('freshness_days'),
    requiredTermsJson: text('required_terms_json').notNull().default('[]'),
    excludedTermsJson: text('excluded_terms_json').notNull().default('[]'),
    sourcesJson: text('sources_json').notNull().default('[]'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('search_targets_candidate_idx').on(table.candidateId)],
);

export const discoveryRuns = sqliteTable(
  'discovery_runs',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    searchTargetId: text('search_target_id')
      .notNull()
      .references(() => searchTargets.id, { onDelete: 'restrict' }),
    sourceSystem: text('source_system').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    status: text('status', { enum: DISCOVERY_RUN_STATUSES }).notNull(),
    discoveredCount: integer('discovered_count').notNull().default(0),
    acceptedCount: integer('accepted_count').notNull().default(0),
    rejectedCount: integer('rejected_count').notNull().default(0),
    rejectedByReasonJson: text('rejected_by_reason_json'),
    errorSummary: text('error_summary'),
  },
  (table) => [
    index('discovery_runs_target_idx').on(table.searchTargetId),
    index('discovery_runs_candidate_idx').on(table.candidateId),
  ],
);

export const discoveryMatches = sqliteTable(
  'discovery_matches',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    searchTargetId: text('search_target_id')
      .notNull()
      .references(() => searchTargets.id, { onDelete: 'restrict' }),
    discoveryRunId: text('discovery_run_id')
      .notNull()
      .references(() => discoveryRuns.id, { onDelete: 'cascade' }),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    sourceListingId: text('source_listing_id')
      .notNull()
      .references(() => sourceListings.id, { onDelete: 'cascade' }),
    matchedAt: integer('matched_at', { mode: 'timestamp_ms' }).notNull(),
    matchReasonsJson: text('match_reasons_json').notNull().default('[]'),
    retainedUnresolvedJson: text('retained_unresolved_json')
      .notNull()
      .default('[]'),
  },
  (table) => [
    uniqueIndex('discovery_matches_cand_target_opp_idx').on(
      table.candidateId,
      table.searchTargetId,
      table.opportunityId,
    ),
    index('discovery_matches_candidate_idx').on(table.candidateId),
  ],
);
