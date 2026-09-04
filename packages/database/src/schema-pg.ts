import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const backgroundTasksPg = pgTable(
  'background_tasks',
  {
    id: text('id').primaryKey(),
    taskType: text('task_type').notNull(),
    payload: text('payload').notNull(),
    state: text('state').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    availableAt: timestamp('available_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    idempotencyKey: text('idempotency_key'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('pg_background_tasks_idempotency_key_unique').on(
      table.idempotencyKey,
    ),
    index('pg_background_tasks_claimable_idx').on(
      table.state,
      table.availableAt,
      table.createdAt,
    ),
    index('pg_background_tasks_expired_lease_idx').on(
      table.state,
      table.leaseExpiresAt,
    ),
    check(
      'pg_background_tasks_state_check',
      sql`${table.state} in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')`,
    ),
    check('pg_background_tasks_attempts_check', sql`${table.attempts} >= 0`),
    check(
      'pg_background_tasks_max_attempts_check',
      sql`${table.maxAttempts} > 0`,
    ),
  ],
);

export const backgroundTaskEventsPg = pgTable(
  'background_task_events',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => backgroundTasksPg.id, { onDelete: 'cascade' }),
    fromState: text('from_state'),
    toState: text('to_state').notNull(),
    detail: text('detail'),
    occurredAt: timestamp('occurred_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('pg_background_task_events_task_time_idx').on(
      table.taskId,
      table.occurredAt,
    ),
  ],
);

export const candidatesPg = pgTable('candidates', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
});

export const usersPg = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    normalizedEmail: text('normalized_email').notNull(),
    passwordHash: text('password_hash').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('pg_users_normalized_email_unique').on(table.normalizedEmail),
  ],
);

export const userCandidatesPg = pgTable(
  'user_candidates',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => usersPg.id, { onDelete: 'restrict' }),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidatesPg.id, { onDelete: 'restrict' }),
    relationship: text('relationship').notNull().default('OWNER'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('pg_user_candidates_user_candidate_unique').on(
      table.userId,
      table.candidateId,
    ),
    uniqueIndex('pg_user_candidates_candidate_unique').on(table.candidateId),
    uniqueIndex('pg_user_candidates_primary_user_unique')
      .on(table.userId)
      .where(sql`${table.isPrimary} = true`),
    index('pg_user_candidates_user_idx').on(table.userId),
    check(
      'pg_user_candidates_relationship_check',
      sql`${table.relationship} in ('OWNER')`,
    ),
  ],
);

export const sessionsPg = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => usersPg.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    lastSeenAt: timestamp('last_seen_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('pg_sessions_token_hash_unique').on(table.tokenHash),
    index('pg_sessions_user_idx').on(table.userId),
    index('pg_sessions_expiration_idx').on(table.expiresAt),
  ],
);

export const userIdentitiesPg = pgTable(
  'user_identities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => usersPg.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    providerEmail: text('provider_email'),
    providerEmailVerified: boolean('provider_email_verified')
      .notNull()
      .default(false),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('pg_user_identities_provider_subject_unique').on(
      table.provider,
      table.providerSubject,
    ),
    index('pg_user_identities_user_idx').on(table.userId),
  ],
);

export const authActionTokensPg = pgTable(
  'auth_action_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => usersPg.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('pg_auth_action_tokens_hash_unique').on(table.tokenHash),
    index('pg_auth_action_tokens_user_purpose_idx').on(
      table.userId,
      table.purpose,
      table.createdAt,
    ),
    index('pg_auth_action_tokens_expiry_idx').on(table.expiresAt),
  ],
);

export const oauthAttemptsPg = pgTable(
  'oauth_attempts',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    stateHash: text('state_hash').notNull(),
    nonceHash: text('nonce_hash').notNull(),
    redirectPath: text('redirect_path').notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('pg_oauth_attempts_state_hash_unique').on(table.stateHash),
    index('pg_oauth_attempts_expiry_idx').on(table.expiresAt),
  ],
);

export const candidateClaimsPg = pgTable(
  'candidate_claims',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidatesPg.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    scope: text('scope'),
    state: text('state').notNull(),
    confidence: text('confidence'),
    subjectKey: text('subject_key').notNull(),
    lifecycleState: text('lifecycle_state').notNull().default('CURRENT'),
    predecessorClaimId: text('predecessor_claim_id'),
    successionType: text('succession_type'),
    successionNote: text('succession_note'),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('pg_candidate_claims_candidate_lifecycle_idx').on(
      table.candidateId,
      table.lifecycleState,
    ),
    uniqueIndex('pg_candidate_claims_current_subject_unique')
      .on(table.candidateId, table.subjectKey)
      .where(sql`${table.lifecycleState} = 'CURRENT'`),
  ],
);

export const careerProfileReevaluationsPg = pgTable(
  'career_profile_reevaluations',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidatesPg.id, { onDelete: 'restrict' }),
    taskCount: integer('task_count').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('pg_career_profile_reevaluations_candidate_idx').on(
      table.candidateId,
      table.createdAt,
    ),
  ],
);

export const opportunitiesPg = pgTable('opportunities', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
});

export const opportunitySnapshotsPg = pgTable(
  'opportunity_snapshots',
  {
    id: text('id').primaryKey(),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => opportunitiesPg.id, { onDelete: 'restrict' }),
    observedAt: timestamp('observed_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    title: text('title').notNull(),
    organization: text('organization').notNull(),
    location: text('location'),
    workModel: text('work_model'),
    employmentType: text('employment_type'),
    compensation: text('compensation'),
    content: text('content').notNull(),
    fingerprint: text('fingerprint').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('pg_opportunity_snapshots_opp_time_idx').on(
      table.opportunityId,
      table.observedAt,
    ),
  ],
);

export const sourceListingsPg = pgTable(
  'source_listings',
  {
    id: text('id').primaryKey(),
    opportunityId: text('opportunity_id').references(() => opportunitiesPg.id, {
      onDelete: 'restrict',
    }),
    sourceSystem: text('source_system').notNull(),
    sourceExternalId: text('source_external_id').notNull(),
    sourceUrl: text('source_url'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('pg_source_listings_system_ext_idx').on(
      table.sourceSystem,
      table.sourceExternalId,
    ),
  ],
);

export const opportunityIdentityKeysPg = pgTable(
  'opportunity_identity_keys',
  {
    identityKey: text('identity_key').primaryKey(),
    kind: text('kind').notNull(),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => opportunitiesPg.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('pg_opportunity_identity_keys_opportunity_idx').on(
      table.opportunityId,
    ),
  ],
);

export const sourceObservationsPg = pgTable(
  'source_observations',
  {
    id: text('id').primaryKey(),
    sourceListingId: text('source_listing_id')
      .notNull()
      .references(() => sourceListingsPg.id, { onDelete: 'restrict' }),
    rawPayload: text('raw_payload').notNull(),
    fingerprint: text('fingerprint').notNull(),
    observedAt: timestamp('observed_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    sourceUpdatedAt: timestamp('source_updated_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('pg_source_observations_listing_time_idx').on(
      table.sourceListingId,
      table.observedAt,
    ),
    uniqueIndex('pg_source_observations_listing_fingerprint_idx').on(
      table.sourceListingId,
      table.fingerprint,
    ),
  ],
);

export const opportunitySnapshotSourcesPg = pgTable(
  'opportunity_snapshot_sources',
  {
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => opportunitySnapshotsPg.id, { onDelete: 'restrict' }),
    sourceObservationId: text('source_observation_id')
      .notNull()
      .references(() => sourceObservationsPg.id, { onDelete: 'restrict' }),
  },
  (table) => [
    index('pg_oss_snapshot_idx').on(table.snapshotId),
    uniqueIndex('pg_oss_unique_idx').on(
      table.snapshotId,
      table.sourceObservationId,
    ),
  ],
);

export const evidencePg = pgTable('evidence', {
  id: text('id').primaryKey(),
  evidenceType: text('evidence_type').notNull(),
  sourceReference: text('source_reference').notNull(),
  excerpt: text('excerpt').notNull(),
  state: text('state').notNull().default('unreviewed'),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
});

export const candidateClaimEvidencePg = pgTable(
  'candidate_claim_evidence',
  {
    claimId: text('claim_id')
      .notNull()
      .references(() => candidateClaimsPg.id, { onDelete: 'cascade' }),
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => evidencePg.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('pg_cce_claim_idx').on(table.claimId),
    index('pg_cce_evidence_idx').on(table.evidenceId),
    uniqueIndex('pg_cce_unique_idx').on(table.claimId, table.evidenceId),
  ],
);

export const opportunitySnapshotEvidencePg = pgTable(
  'opportunity_snapshot_evidence',
  {
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => opportunitySnapshotsPg.id, { onDelete: 'cascade' }),
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => evidencePg.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('pg_ose_snapshot_idx').on(table.snapshotId),
    index('pg_ose_evidence_idx').on(table.evidenceId),
    uniqueIndex('pg_ose_unique_idx').on(table.snapshotId, table.evidenceId),
  ],
);

export const evaluationsPg = pgTable(
  'evaluations',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidatesPg.id, { onDelete: 'restrict' }),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => opportunitySnapshotsPg.id, { onDelete: 'restrict' }),
    eligibilityState: text('eligibility_state').notNull(),
    eligibilityEngineVersion: text('eligibility_engine_version'),
    eligibilityInputFingerprint: text('eligibility_input_fingerprint'),
    fitLevel: text('fit_level'),
    fitEngineVersion: text('fit_engine_version'),
    fitInputFingerprint: text('fit_input_fingerprint'),
    fitSummary: text('fit_summary'),
    qualityLevel: text('quality_level'),
    qualityEngineVersion: text('quality_engine_version'),
    qualityInputFingerprint: text('quality_input_fingerprint'),
    qualitySummary: text('quality_summary'),
    qualityEvaluatedAt: timestamp('quality_evaluated_at', {
      withTimezone: true,
      mode: 'date',
    }),
    qualityFreshnessBucket: text('quality_freshness_bucket'),
    supersedesEvaluationId: text('supersedes_evaluation_id'),
    supersededAt: timestamp('superseded_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('pg_evaluations_candidate_snapshot_idx').on(
      table.candidateId,
      table.snapshotId,
    ),
  ],
);

export const evaluationFindingsPg = pgTable(
  'evaluation_findings',
  {
    id: text('id').primaryKey(),
    evaluationId: text('evaluation_id')
      .notNull()
      .references(() => evaluationsPg.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
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
    index('pg_eval_finding_eval_idx').on(table.evaluationId),
    uniqueIndex('pg_eval_finding_unique_idx').on(
      table.evaluationId,
      table.category,
      table.dimensionKey,
    ),
  ],
);

export const evaluationFindingEvidencePg = pgTable(
  'evaluation_finding_evidence',
  {
    findingId: text('finding_id')
      .notNull()
      .references(() => evaluationFindingsPg.id, { onDelete: 'cascade' }),
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => evidencePg.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('pg_efe_finding_idx').on(table.findingId),
    uniqueIndex('pg_efe_unique_idx').on(table.findingId, table.evidenceId),
  ],
);

export const evaluationEvidencePg = pgTable(
  'evaluation_evidence',
  {
    evaluationId: text('evaluation_id')
      .notNull()
      .references(() => evaluationsPg.id, { onDelete: 'cascade' }),
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => evidencePg.id, { onDelete: 'cascade' }),
    dimension: text('dimension').notNull(),
  },
  (table) => [
    index('pg_eval_ev_eval_idx').on(table.evaluationId),
    uniqueIndex('pg_eval_ev_unique_idx').on(
      table.evaluationId,
      table.evidenceId,
      table.dimension,
    ),
  ],
);

export const decisionsPg = pgTable(
  'decisions',
  {
    id: text('id').primaryKey(),
    evaluationId: text('evaluation_id')
      .notNull()
      .references(() => evaluationsPg.id, { onDelete: 'restrict' }),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidatesPg.id, { onDelete: 'restrict' }),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => opportunitySnapshotsPg.id, { onDelete: 'restrict' }),
    priority: text('priority').notNull(),
    action: text('action'),
    explanation: text('explanation').notNull(),
    engineVersion: text('engine_version'),
    inputFingerprint: text('input_fingerprint'),
    eligibilityInputFingerprint: text(
      'eligibility_input_fingerprint',
    ).notNull(),
    fitInputFingerprint: text('fit_input_fingerprint').notNull(),
    qualityInputFingerprint: text('quality_input_fingerprint').notNull(),
    reasonCodes: text('reason_codes'),
    evaluatedAt: timestamp('evaluated_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('pg_decisions_eval_idx').on(table.evaluationId),
    index('pg_decisions_input_idx').on(
      table.candidateId,
      table.snapshotId,
      table.engineVersion,
      table.inputFingerprint,
    ),
    uniqueIndex('pg_decisions_semantic_input_unique').on(
      table.candidateId,
      table.snapshotId,
      table.engineVersion,
      table.inputFingerprint,
    ),
  ],
);

export const decisionReasonsPg = pgTable(
  'decision_reasons',
  {
    id: text('id').primaryKey(),
    decisionId: text('decision_id')
      .notNull()
      .references(() => decisionsPg.id, { onDelete: 'cascade' }),
    reasonCode: text('reason_code').notNull(),
    findingId: text('finding_id')
      .notNull()
      .references(() => evaluationFindingsPg.id, { onDelete: 'restrict' }),
  },
  (table) => [
    index('pg_decision_reason_decision_idx').on(table.decisionId),
    uniqueIndex('pg_decision_reason_unique').on(
      table.decisionId,
      table.reasonCode,
      table.findingId,
    ),
  ],
);

export const applicationsPg = pgTable(
  'applications',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidatesPg.id, { onDelete: 'restrict' }),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => opportunitiesPg.id, { onDelete: 'restrict' }),
    status: text('status').notNull(),
    originatingDecisionId: text('originating_decision_id').references(
      () => decisionsPg.id,
      { onDelete: 'set null' },
    ),
    originatingDecisionState: text('originating_decision_state'),
    originatingDecisionAction: text('originating_decision_action'),
    submittedAt: timestamp('submitted_at', {
      withTimezone: true,
      mode: 'date',
    }),
    followUpDueAt: timestamp('follow_up_due_at', {
      withTimezone: true,
      mode: 'date',
    }),
    followUpNote: text('follow_up_note'),
    followUpCompletedAt: timestamp('follow_up_completed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    note: text('note'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('pg_applications_candidate_opportunity_idx').on(
      table.candidateId,
      table.opportunityId,
    ),
    index('pg_applications_candidate_status_idx').on(
      table.candidateId,
      table.status,
    ),
  ],
);

export const applicationEventsPg = pgTable(
  'application_events',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => applicationsPg.id, { onDelete: 'restrict' }),
    eventType: text('event_type').notNull(),
    detail: text('detail').notNull(),
    occurredAt: timestamp('occurred_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('pg_app_events_app_time_idx').on(
      table.applicationId,
      table.occurredAt,
    ),
  ],
);

export const searchTargetsPg = pgTable(
  'search_targets',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidatesPg.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    targetRolesJson: text('target_roles_json').notNull().default('[]'),
    skillsJson: text('skills_json').notNull().default('[]'),
    locationsJson: text('locations_json').notNull().default('[]'),
    locationIsHardFilter: boolean('location_is_hard_filter')
      .notNull()
      .default(false),
    workModelsJson: text('work_models_json').notNull().default('[]'),
    workModelIsHardFilter: boolean('work_model_is_hard_filter')
      .notNull()
      .default(false),
    seniorityLevelsJson: text('seniority_levels_json').notNull().default('[]'),
    seniorityIsHardFilter: boolean('seniority_is_hard_filter')
      .notNull()
      .default(false),
    employmentTypesJson: text('employment_types_json').notNull().default('[]'),
    employmentTypeIsHardFilter: boolean('employment_type_is_hard_filter')
      .notNull()
      .default(false),
    requiresSponsorship: boolean('requires_sponsorship'),
    willingToRelocate: boolean('willing_to_relocate'),
    minSalary: integer('min_salary'),
    currency: text('currency'),
    freshnessDays: integer('freshness_days'),
    requiredTermsJson: text('required_terms_json').notNull().default('[]'),
    excludedTermsJson: text('excluded_terms_json').notNull().default('[]'),
    sourcesJson: text('sources_json').notNull().default('[]'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [index('pg_search_targets_candidate_idx').on(table.candidateId)],
);

export const discoveryRunsPg = pgTable(
  'discovery_runs',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidatesPg.id, { onDelete: 'cascade' }),
    searchTargetId: text('search_target_id')
      .notNull()
      .references(() => searchTargetsPg.id, { onDelete: 'restrict' }),
    sourceSystem: text('source_system').notNull(),
    startedAt: timestamp('started_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    status: text('status').notNull(),
    discoveredCount: integer('discovered_count').notNull().default(0),
    acceptedCount: integer('accepted_count').notNull().default(0),
    rejectedCount: integer('rejected_count').notNull().default(0),
    rejectedByReasonJson: text('rejected_by_reason_json'),
    errorSummary: text('error_summary'),
  },
  (table) => [
    index('pg_discovery_runs_target_idx').on(table.searchTargetId),
    index('pg_discovery_runs_candidate_idx').on(table.candidateId),
  ],
);

export const discoveryMatchesPg = pgTable(
  'discovery_matches',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidatesPg.id, { onDelete: 'cascade' }),
    searchTargetId: text('search_target_id')
      .notNull()
      .references(() => searchTargetsPg.id, { onDelete: 'restrict' }),
    discoveryRunId: text('discovery_run_id')
      .notNull()
      .references(() => discoveryRunsPg.id, { onDelete: 'cascade' }),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => opportunitiesPg.id, { onDelete: 'cascade' }),
    sourceListingId: text('source_listing_id')
      .notNull()
      .references(() => sourceListingsPg.id, { onDelete: 'cascade' }),
    matchedAt: timestamp('matched_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    matchReasonsJson: text('match_reasons_json').notNull().default('[]'),
    retainedUnresolvedJson: text('retained_unresolved_json')
      .notNull()
      .default('[]'),
  },
  (table) => [
    uniqueIndex('pg_discovery_matches_cand_target_opp_idx').on(
      table.candidateId,
      table.searchTargetId,
      table.opportunityId,
    ),
    index('pg_discovery_matches_candidate_idx').on(table.candidateId),
  ],
);
