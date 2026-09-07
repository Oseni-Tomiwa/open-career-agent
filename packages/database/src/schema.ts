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

// Accounts authenticate people. Candidates remain separate career-domain
// subjects; the join deliberately permits more than one Candidate per User.
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    normalizedEmail: text('normalized_email').notNull(),
    passwordHash: text('password_hash').notNull(),
    emailVerifiedAt: integer('email_verified_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('users_normalized_email_unique').on(table.normalizedEmail),
  ],
);

export const userCandidates = sqliteTable(
  'user_candidates',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'restrict' }),
    relationship: text('relationship').notNull().default('OWNER'),
    isPrimary: integer('is_primary', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('user_candidates_user_candidate_unique').on(
      table.userId,
      table.candidateId,
    ),
    uniqueIndex('user_candidates_candidate_unique').on(table.candidateId),
    uniqueIndex('user_candidates_primary_user_unique')
      .on(table.userId)
      .where(sql`${table.isPrimary} = 1`),
    index('user_candidates_user_idx').on(table.userId),
    check(
      'user_candidates_relationship_check',
      sql`${table.relationship} in ('OWNER')`,
    ),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
    index('sessions_expiration_idx').on(table.expiresAt),
  ],
);

export const AUTH_PROVIDERS = ['google', 'apple'] as const;
export const AUTH_TOKEN_PURPOSES = [
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
] as const;

export const userIdentities = sqliteTable(
  'user_identities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: AUTH_PROVIDERS }).notNull(),
    providerSubject: text('provider_subject').notNull(),
    providerEmail: text('provider_email'),
    providerEmailVerified: integer('provider_email_verified', {
      mode: 'boolean',
    })
      .notNull()
      .default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('user_identities_provider_subject_unique').on(
      table.provider,
      table.providerSubject,
    ),
    index('user_identities_user_idx').on(table.userId),
  ],
);

export const authActionTokens = sqliteTable(
  'auth_action_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: AUTH_TOKEN_PURPOSES }).notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('auth_action_tokens_hash_unique').on(table.tokenHash),
    index('auth_action_tokens_user_purpose_idx').on(
      table.userId,
      table.purpose,
      table.createdAt,
    ),
    index('auth_action_tokens_expiry_idx').on(table.expiresAt),
  ],
);

export const oauthAttempts = sqliteTable(
  'oauth_attempts',
  {
    id: text('id').primaryKey(),
    provider: text('provider', { enum: AUTH_PROVIDERS }).notNull(),
    stateHash: text('state_hash').notNull(),
    nonceHash: text('nonce_hash').notNull(),
    redirectPath: text('redirect_path').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('oauth_attempts_state_hash_unique').on(table.stateHash),
    index('oauth_attempts_expiry_idx').on(table.expiresAt),
  ],
);

export const CLAIM_STATES = [
  'SUPPORTED',
  'INFERRED',
  'UNKNOWN',
  'CONFLICTING',
  'UNSUPPORTED',
] as const;

export const CLAIM_CONFIDENCE_LEVELS = ['HIGH', 'MODERATE', 'LOW'] as const;

export const CLAIM_LIFECYCLE_STATES = [
  'CURRENT',
  'SUPERSEDED',
  'RETIRED',
] as const;

export const CLAIM_SUCCESSION_TYPES = ['CORRECTION', 'DEVELOPMENT'] as const;

export const candidateClaims = sqliteTable(
  'candidate_claims',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    scope: text('scope'),
    state: text('state', { enum: CLAIM_STATES }).notNull(),
    confidence: text('confidence', { enum: CLAIM_CONFIDENCE_LEVELS }),
    subjectKey: text('subject_key').notNull(),
    lifecycleState: text('lifecycle_state', { enum: CLAIM_LIFECYCLE_STATES })
      .notNull()
      .default('CURRENT'),
    predecessorClaimId: text('predecessor_claim_id'),
    successionType: text('succession_type', { enum: CLAIM_SUCCESSION_TYPES }),
    successionNote: text('succession_note'),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('candidate_claims_candidate_lifecycle_idx').on(
      table.candidateId,
      table.lifecycleState,
    ),
    uniqueIndex('candidate_claims_current_subject_unique')
      .on(table.candidateId, table.subjectKey)
      .where(sql`${table.lifecycleState} = 'CURRENT'`),
  ],
);

export const careerProfileReevaluations = sqliteTable(
  'career_profile_reevaluations',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'restrict' }),
    taskCount: integer('task_count').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('career_profile_reevaluations_candidate_idx').on(
      table.candidateId,
      table.createdAt,
    ),
  ],
);

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

export const opportunityIdentityKeys = sqliteTable(
  'opportunity_identity_keys',
  {
    identityKey: text('identity_key').primaryKey(),
    kind: text('kind').notNull(),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'restrict' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('opportunity_identity_keys_opportunity_idx').on(table.opportunityId),
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

export const requirementSets = sqliteTable(
  'requirement_sets',
  {
    id: text('id').primaryKey(),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => opportunitySnapshots.id, { onDelete: 'restrict' }),
    modelVersion: text('model_version').notNull(),
    inputFingerprint: text('input_fingerprint').notNull(),
    extractorPipelineVersion: text('extractor_pipeline_version').notNull(),
    deterministicExtractorVersion: text(
      'deterministic_extractor_version',
    ).notNull(),
    status: text('status').notNull(),
    deterministicStatus: text('deterministic_status').notNull(),
    assistedStatus: text('assisted_status').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('requirement_sets_snapshot_idx').on(table.snapshotId),
    uniqueIndex('requirement_sets_compatible_input_unique').on(
      table.snapshotId,
      table.extractorPipelineVersion,
      table.inputFingerprint,
    ),
    check(
      'requirement_sets_status_check',
      sql`${table.status} in ('COMPLETE', 'PARTIAL', 'FAILED')`,
    ),
    check(
      'requirement_sets_deterministic_status_check',
      sql`${table.deterministicStatus} in ('SUCCEEDED', 'FAILED')`,
    ),
    check(
      'requirement_sets_assisted_status_check',
      sql`${table.assistedStatus} in ('NOT_REQUESTED', 'SUCCEEDED', 'UNAVAILABLE', 'REJECTED', 'FAILED')`,
    ),
  ],
);

export const canonicalRequirements = sqliteTable(
  'canonical_requirements',
  {
    id: text('id').primaryKey(),
    requirementSetId: text('requirement_set_id')
      .notNull()
      .references(() => requirementSets.id, { onDelete: 'restrict' }),
    category: text('category').notNull(),
    normalizedKey: text('normalized_key').notNull(),
    valueJson: text('value_json').notNull(),
    statement: text('statement').notNull(),
    strength: text('strength').notNull(),
    polarity: text('polarity').notNull(),
    assertionBasis: text('assertion_basis').notNull(),
    evaluationUse: text('evaluation_use').notNull(),
    actionability: text('actionability').notNull(),
    extractionConfidence: text('extraction_confidence').notNull(),
    extractorId: text('extractor_id').notNull(),
    extractorVersion: text('extractor_version').notNull(),
    canonicalHash: text('canonical_hash').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('canonical_requirements_set_idx').on(table.requirementSetId),
    uniqueIndex('canonical_requirements_set_hash_unique').on(
      table.requirementSetId,
      table.canonicalHash,
    ),
    check(
      'canonical_requirements_strength_check',
      sql`${table.strength} in ('REQUIRED', 'PREFERRED', 'CONTEXTUAL')`,
    ),
    check(
      'canonical_requirements_hard_safety_check',
      sql`${table.actionability} <> 'HARD_CONSTRAINT_SAFE' OR (${table.strength} = 'REQUIRED' AND ${table.evaluationUse} = 'ELIGIBILITY' AND ${table.assertionBasis} in ('EXPLICIT_STRUCTURED', 'EXPLICIT_TEXT') AND ${table.extractionConfidence} = 'HIGH')`,
    ),
  ],
);

export const requirementProvenance = sqliteTable(
  'requirement_provenance',
  {
    id: text('id').primaryKey(),
    requirementId: text('requirement_id')
      .notNull()
      .references(() => canonicalRequirements.id, { onDelete: 'restrict' }),
    sourceObservationId: text('source_observation_id')
      .notNull()
      .references(() => sourceObservations.id, { onDelete: 'restrict' }),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => opportunitySnapshots.id, { onDelete: 'restrict' }),
    sourceFieldPath: text('source_field_path'),
    normalizedSection: text('normalized_section'),
    normalizedFragmentId: text('normalized_fragment_id'),
    startOffset: integer('start_offset'),
    endOffset: integer('end_offset'),
    excerpt: text('excerpt').notNull(),
    excerptHash: text('excerpt_hash').notNull(),
    locatorVersion: text('locator_version').notNull(),
    extractorId: text('extractor_id').notNull(),
    extractorVersion: text('extractor_version').notNull(),
  },
  (table) => [
    index('requirement_provenance_requirement_idx').on(table.requirementId),
    index('requirement_provenance_observation_idx').on(
      table.sourceObservationId,
    ),
    index('requirement_provenance_snapshot_idx').on(table.snapshotId),
    uniqueIndex('requirement_provenance_locator_unique').on(
      table.requirementId,
      table.sourceObservationId,
      table.excerptHash,
      table.locatorVersion,
    ),
    check(
      'requirement_provenance_offsets_check',
      sql`(${table.startOffset} is null AND ${table.endOffset} is null) OR (${table.startOffset} >= 0 AND ${table.endOffset} >= ${table.startOffset})`,
    ),
  ],
);

export const requirementAssistanceRuns = sqliteTable(
  'requirement_assistance_runs',
  {
    id: text('id').primaryKey(),
    requirementSetId: text('requirement_set_id')
      .notNull()
      .references(() => requirementSets.id, { onDelete: 'restrict' }),
    requestFingerprint: text('request_fingerprint').notNull(),
    assistedPipelineVersion: text('assisted_pipeline_version').notNull(),
    selectionVersion: text('selection_version').notNull(),
    proposalSchemaVersion: text('proposal_schema_version').notNull(),
    instructionVersion: text('instruction_version').notNull(),
    groundingValidatorVersion: text('grounding_validator_version').notNull(),
    providerId: text('provider_id').notNull(),
    providerCapabilityVersion: text('provider_capability_version').notNull(),
    status: text('status').notNull(),
    attempted: integer('attempted', { mode: 'boolean' }).notNull(),
    selectedFragmentCount: integer('selected_fragment_count').notNull(),
    selectedCharacterCount: integer('selected_character_count').notNull(),
    proposalCount: integer('proposal_count').notNull(),
    groundedCount: integer('grounded_count').notNull(),
    rejectedCount: integer('rejected_count').notNull(),
    duplicateCount: integer('duplicate_count').notNull(),
    consequentialCount: integer('consequential_count').notNull(),
    unsafePromotionAttempts: integer('unsafe_promotion_attempts').notNull(),
    rejectionReasonCountsJson: text('rejection_reason_counts_json').notNull(),
    safeReason: text('safe_reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('requirement_assistance_runs_set_unique').on(
      table.requirementSetId,
    ),
    check(
      'requirement_assistance_runs_status_check',
      sql`${table.status} in ('SUCCEEDED', 'UNAVAILABLE', 'REJECTED', 'FAILED')`,
    ),
  ],
);

export const requirementCandidates = sqliteTable(
  'requirement_candidates',
  {
    id: text('id').primaryKey(),
    requirementSetId: text('requirement_set_id')
      .notNull()
      .references(() => requirementSets.id, { onDelete: 'restrict' }),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => opportunitySnapshots.id, { onDelete: 'restrict' }),
    category: text('category').notNull(),
    normalizedKey: text('normalized_key').notNull(),
    valueJson: text('value_json').notNull(),
    statement: text('statement').notNull(),
    strength: text('strength').notNull(),
    polarity: text('polarity').notNull(),
    assertionBasis: text('assertion_basis').notNull(),
    evaluationUse: text('evaluation_use').notNull(),
    actionabilityCeiling: text('actionability_ceiling').notNull(),
    modelConfidence: text('model_confidence').notNull(),
    rationale: text('rationale').notNull(),
    proposerId: text('proposer_id').notNull(),
    modelCapabilityVersion: text('model_capability_version').notNull(),
    instructionVersion: text('instruction_version').notNull(),
    proposalSchemaVersion: text('proposal_schema_version').notNull(),
    groundingValidatorVersion: text('grounding_validator_version').notNull(),
    validationStatus: text('validation_status').notNull(),
    groundingStatus: text('grounding_status').notNull(),
    rejectionReasonsJson: text('rejection_reasons_json').notNull(),
    proposalHash: text('proposal_hash').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('requirement_candidates_set_idx').on(table.requirementSetId),
    uniqueIndex('requirement_candidates_set_hash_unique').on(
      table.requirementSetId,
      table.proposalHash,
    ),
    check(
      'requirement_candidates_actionability_ceiling_check',
      sql`${table.actionabilityCeiling} in ('FIT_SIGNAL_SAFE', 'REVIEW_ONLY')`,
    ),
    check(
      'requirement_candidates_validation_status_check',
      sql`${table.validationStatus} in ('ACCEPTED_FOR_REVIEW', 'DUPLICATE', 'REJECTED')`,
    ),
  ],
);

export const requirementCandidateSources = sqliteTable(
  'requirement_candidate_sources',
  {
    id: text('id').primaryKey(),
    requirementCandidateId: text('requirement_candidate_id')
      .notNull()
      .references(() => requirementCandidates.id, { onDelete: 'restrict' }),
    sourceObservationId: text('source_observation_id')
      .notNull()
      .references(() => sourceObservations.id, { onDelete: 'restrict' }),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => opportunitySnapshots.id, { onDelete: 'restrict' }),
    normalizedFragmentId: text('normalized_fragment_id').notNull(),
    sourceFieldPath: text('source_field_path'),
    excerpt: text('excerpt').notNull(),
    excerptHash: text('excerpt_hash').notNull(),
  },
  (table) => [
    index('requirement_candidate_sources_candidate_idx').on(
      table.requirementCandidateId,
    ),
    uniqueIndex('requirement_candidate_sources_locator_unique').on(
      table.requirementCandidateId,
      table.sourceObservationId,
      table.normalizedFragmentId,
      table.excerptHash,
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
export const FIT_ASSESSMENT_STATUSES = [
  'ASSESSED',
  'INSUFFICIENT_LISTING_REQUIREMENTS',
  'INSUFFICIENT_CANDIDATE_EVIDENCE',
] as const;
export const REQUIREMENT_INPUT_MODES = [
  'CANONICAL',
  'FALLBACK_TRANSIENT_V1',
] as const;
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
    requirementSetId: text('requirement_set_id').references(
      () => requirementSets.id,
      { onDelete: 'restrict' },
    ),
    requirementInputFingerprint: text('requirement_input_fingerprint'),
    requirementInputMode: text('requirement_input_mode', {
      enum: REQUIREMENT_INPUT_MODES,
    }),
    eligibilityState: text('eligibility_state', {
      enum: ELIGIBILITY_STATES,
    }).notNull(),
    eligibilityEngineVersion: text('eligibility_engine_version'),
    eligibilityInputFingerprint: text('eligibility_input_fingerprint'),
    fitLevel: text('fit_level', { enum: FIT_LEVELS }),
    fitAssessmentStatus: text('fit_assessment_status', {
      enum: FIT_ASSESSMENT_STATUSES,
    }),
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
    index('evaluations_requirement_set_idx').on(table.requirementSetId),
    check(
      'evaluations_requirement_input_mode_check',
      sql`${table.requirementInputMode} is null or ${table.requirementInputMode} in ('CANONICAL', 'FALLBACK_TRANSIENT_V1')`,
    ),
    check(
      'evaluations_fit_assessment_check',
      sql`${table.fitAssessmentStatus} is null or (${table.fitAssessmentStatus} = 'ASSESSED' and ${table.fitLevel} is not null) or (${table.fitAssessmentStatus} in ('INSUFFICIENT_LISTING_REQUIREMENTS', 'INSUFFICIENT_CANDIDATE_EVIDENCE') and ${table.fitLevel} is null)`,
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
    canonicalRequirementId: text('canonical_requirement_id').references(
      () => canonicalRequirements.id,
      { onDelete: 'restrict' },
    ),
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
  'Saved',
  'Preparing',
  'Applied',
  'Assessment',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
  'Closed',
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
    originatingDecisionId: text('originating_decision_id').references(
      () => decisions.id,
      { onDelete: 'set null' },
    ),
    originatingDecisionState: text('originating_decision_state'),
    originatingDecisionAction: text('originating_decision_action'),
    submittedAt: integer('submitted_at', { mode: 'timestamp_ms' }),
    followUpDueAt: integer('follow_up_due_at', { mode: 'timestamp_ms' }),
    followUpNote: text('follow_up_note'),
    followUpCompletedAt: integer('follow_up_completed_at', {
      mode: 'timestamp_ms',
    }),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('applications_candidate_opportunity_idx').on(
      table.candidateId,
      table.opportunityId,
    ),
    index('applications_candidate_status_idx').on(
      table.candidateId,
      table.status,
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
