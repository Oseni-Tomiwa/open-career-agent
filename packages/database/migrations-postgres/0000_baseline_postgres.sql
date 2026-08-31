CREATE TABLE IF NOT EXISTS "background_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"task_type" text NOT NULL,
	"payload" text NOT NULL,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"idempotency_key" text,
	"last_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pg_background_tasks_state_check" CHECK ("background_tasks"."state" in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
	CONSTRAINT "pg_background_tasks_attempts_check" CHECK ("background_tasks"."attempts" >= 0),
	CONSTRAINT "pg_background_tasks_max_attempts_check" CHECK ("background_tasks"."max_attempts" > 0)
);

CREATE TABLE IF NOT EXISTS "background_task_events" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL REFERENCES "background_tasks"("id") ON DELETE CASCADE,
	"from_state" text,
	"to_state" text NOT NULL,
	"detail" text,
	"occurred_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
	"candidate_id" text NOT NULL REFERENCES "candidates"("id") ON DELETE RESTRICT,
	"relationship" text DEFAULT 'OWNER' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pg_user_candidates_relationship_check" CHECK ("user_candidates"."relationship" in ('OWNER'))
);

CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "candidate_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL REFERENCES "candidates"("id") ON DELETE RESTRICT,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"scope" text,
	"state" text NOT NULL,
	"confidence" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "opportunity_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"opportunity_id" text NOT NULL REFERENCES "opportunities"("id") ON DELETE RESTRICT,
	"observed_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"organization" text NOT NULL,
	"location" text,
	"work_model" text,
	"employment_type" text,
	"compensation" text,
	"content" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "source_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"opportunity_id" text REFERENCES "opportunities"("id") ON DELETE RESTRICT,
	"source_system" text NOT NULL,
	"source_external_id" text NOT NULL,
	"source_url" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "source_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"source_listing_id" text NOT NULL REFERENCES "source_listings"("id") ON DELETE RESTRICT,
	"raw_payload" text NOT NULL,
	"fingerprint" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"source_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "opportunity_snapshot_sources" (
	"snapshot_id" text NOT NULL REFERENCES "opportunity_snapshots"("id") ON DELETE RESTRICT,
	"source_observation_id" text NOT NULL REFERENCES "source_observations"("id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"evidence_type" text NOT NULL,
	"source_reference" text NOT NULL,
	"excerpt" text NOT NULL,
	"state" text DEFAULT 'unreviewed' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "candidate_claim_evidence" (
	"claim_id" text NOT NULL REFERENCES "candidate_claims"("id") ON DELETE CASCADE,
	"evidence_id" text NOT NULL REFERENCES "evidence"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "opportunity_snapshot_evidence" (
	"snapshot_id" text NOT NULL REFERENCES "opportunity_snapshots"("id") ON DELETE CASCADE,
	"evidence_id" text NOT NULL REFERENCES "evidence"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL REFERENCES "candidates"("id") ON DELETE RESTRICT,
	"snapshot_id" text NOT NULL REFERENCES "opportunity_snapshots"("id") ON DELETE RESTRICT,
	"eligibility_state" text NOT NULL,
	"eligibility_engine_version" text,
	"eligibility_input_fingerprint" text,
	"fit_level" text,
	"fit_engine_version" text,
	"fit_input_fingerprint" text,
	"fit_summary" text,
	"quality_level" text,
	"quality_engine_version" text,
	"quality_input_fingerprint" text,
	"quality_summary" text,
	"quality_evaluated_at" timestamp with time zone,
	"quality_freshness_bucket" text,
	"supersedes_evaluation_id" text,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "evaluation_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"evaluation_id" text NOT NULL REFERENCES "evaluations"("id") ON DELETE CASCADE,
	"category" text NOT NULL,
	"dimension_key" text NOT NULL,
	"label" text,
	"state" text NOT NULL,
	"summary" text NOT NULL,
	"confidence" text,
	"modality" text,
	"requirement_text" text,
	"explanation" text
);

CREATE TABLE IF NOT EXISTS "evaluation_finding_evidence" (
	"finding_id" text NOT NULL REFERENCES "evaluation_findings"("id") ON DELETE CASCADE,
	"evidence_id" text NOT NULL REFERENCES "evidence"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "evaluation_evidence" (
	"evaluation_id" text NOT NULL REFERENCES "evaluations"("id") ON DELETE CASCADE,
	"evidence_id" text NOT NULL REFERENCES "evidence"("id") ON DELETE CASCADE,
	"dimension" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"evaluation_id" text NOT NULL REFERENCES "evaluations"("id") ON DELETE RESTRICT,
	"candidate_id" text NOT NULL REFERENCES "candidates"("id") ON DELETE RESTRICT,
	"snapshot_id" text NOT NULL REFERENCES "opportunity_snapshots"("id") ON DELETE RESTRICT,
	"priority" text NOT NULL,
	"action" text,
	"explanation" text NOT NULL,
	"engine_version" text,
	"input_fingerprint" text,
	"eligibility_input_fingerprint" text NOT NULL,
	"fit_input_fingerprint" text NOT NULL,
	"quality_input_fingerprint" text NOT NULL,
	"reason_codes" text,
	"evaluated_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "decision_reasons" (
	"id" text PRIMARY KEY NOT NULL,
	"decision_id" text NOT NULL REFERENCES "decisions"("id") ON DELETE CASCADE,
	"reason_code" text NOT NULL,
	"finding_id" text NOT NULL REFERENCES "evaluation_findings"("id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL REFERENCES "candidates"("id") ON DELETE RESTRICT,
	"opportunity_id" text NOT NULL REFERENCES "opportunities"("id") ON DELETE RESTRICT,
	"status" text NOT NULL,
	"originating_decision_id" text REFERENCES "decisions"("id") ON DELETE SET NULL,
	"originating_decision_state" text,
	"originating_decision_action" text,
	"submitted_at" timestamp with time zone,
	"follow_up_due_at" timestamp with time zone,
	"follow_up_note" text,
	"follow_up_completed_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "application_events" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL REFERENCES "applications"("id") ON DELETE RESTRICT,
	"event_type" text NOT NULL,
	"detail" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "search_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"target_roles_json" text DEFAULT '[]' NOT NULL,
	"skills_json" text DEFAULT '[]' NOT NULL,
	"locations_json" text DEFAULT '[]' NOT NULL,
	"location_is_hard_filter" boolean DEFAULT false NOT NULL,
	"work_models_json" text DEFAULT '[]' NOT NULL,
	"work_model_is_hard_filter" boolean DEFAULT false NOT NULL,
	"seniority_levels_json" text DEFAULT '[]' NOT NULL,
	"seniority_is_hard_filter" boolean DEFAULT false NOT NULL,
	"employment_types_json" text DEFAULT '[]' NOT NULL,
	"employment_type_is_hard_filter" boolean DEFAULT false NOT NULL,
	"requires_sponsorship" boolean,
	"willing_to_relocate" boolean,
	"min_salary" integer,
	"currency" text,
	"freshness_days" integer,
	"required_terms_json" text DEFAULT '[]' NOT NULL,
	"excluded_terms_json" text DEFAULT '[]' NOT NULL,
	"sources_json" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "discovery_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
	"search_target_id" text NOT NULL REFERENCES "search_targets"("id") ON DELETE RESTRICT,
	"source_system" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text NOT NULL,
	"discovered_count" integer DEFAULT 0 NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"rejected_by_reason_json" text,
	"error_summary" text
);

CREATE TABLE IF NOT EXISTS "discovery_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
	"search_target_id" text NOT NULL REFERENCES "search_targets"("id") ON DELETE RESTRICT,
	"discovery_run_id" text NOT NULL REFERENCES "discovery_runs"("id") ON DELETE CASCADE,
	"opportunity_id" text NOT NULL REFERENCES "opportunities"("id") ON DELETE CASCADE,
	"source_listing_id" text NOT NULL REFERENCES "source_listings"("id") ON DELETE CASCADE,
	"matched_at" timestamp with time zone NOT NULL,
	"match_reasons_json" text DEFAULT '[]' NOT NULL,
	"retained_unresolved_json" text DEFAULT '[]' NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "pg_background_tasks_idempotency_key_unique" ON "background_tasks" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "pg_background_tasks_claimable_idx" ON "background_tasks" ("state", "available_at", "created_at");
CREATE INDEX IF NOT EXISTS "pg_background_tasks_expired_lease_idx" ON "background_tasks" ("state", "lease_expires_at");
CREATE INDEX IF NOT EXISTS "pg_background_task_events_task_time_idx" ON "background_task_events" ("task_id", "occurred_at");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_users_normalized_email_unique" ON "users" ("normalized_email");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_user_candidates_user_candidate_unique" ON "user_candidates" ("user_id", "candidate_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_user_candidates_candidate_unique" ON "user_candidates" ("candidate_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_user_candidates_primary_user_unique" ON "user_candidates" ("user_id") WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS "pg_user_candidates_user_idx" ON "user_candidates" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_sessions_token_hash_unique" ON "sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "pg_sessions_user_idx" ON "sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "pg_sessions_expiration_idx" ON "sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "pg_opportunity_snapshots_opp_time_idx" ON "opportunity_snapshots" ("opportunity_id", "observed_at");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_source_listings_system_ext_idx" ON "source_listings" ("source_system", "source_external_id");
CREATE INDEX IF NOT EXISTS "pg_source_observations_listing_time_idx" ON "source_observations" ("source_listing_id", "observed_at");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_source_observations_listing_fingerprint_idx" ON "source_observations" ("source_listing_id", "fingerprint");
CREATE INDEX IF NOT EXISTS "pg_oss_snapshot_idx" ON "opportunity_snapshot_sources" ("snapshot_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_oss_unique_idx" ON "opportunity_snapshot_sources" ("snapshot_id", "source_observation_id");
CREATE INDEX IF NOT EXISTS "pg_cce_claim_idx" ON "candidate_claim_evidence" ("claim_id");
CREATE INDEX IF NOT EXISTS "pg_cce_evidence_idx" ON "candidate_claim_evidence" ("evidence_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_cce_unique_idx" ON "candidate_claim_evidence" ("claim_id", "evidence_id");
CREATE INDEX IF NOT EXISTS "pg_ose_snapshot_idx" ON "opportunity_snapshot_evidence" ("snapshot_id");
CREATE INDEX IF NOT EXISTS "pg_ose_evidence_idx" ON "opportunity_snapshot_evidence" ("evidence_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_ose_unique_idx" ON "opportunity_snapshot_evidence" ("snapshot_id", "evidence_id");
CREATE INDEX IF NOT EXISTS "pg_evaluations_candidate_snapshot_idx" ON "evaluations" ("candidate_id", "snapshot_id");
CREATE INDEX IF NOT EXISTS "pg_eval_finding_eval_idx" ON "evaluation_findings" ("evaluation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_eval_finding_unique_idx" ON "evaluation_findings" ("evaluation_id", "category", "dimension_key");
CREATE INDEX IF NOT EXISTS "pg_efe_finding_idx" ON "evaluation_finding_evidence" ("finding_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_efe_unique_idx" ON "evaluation_finding_evidence" ("finding_id", "evidence_id");
CREATE INDEX IF NOT EXISTS "pg_eval_ev_eval_idx" ON "evaluation_evidence" ("evaluation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_eval_ev_unique_idx" ON "evaluation_evidence" ("evaluation_id", "evidence_id", "dimension");
CREATE INDEX IF NOT EXISTS "pg_decisions_eval_idx" ON "decisions" ("evaluation_id");
CREATE INDEX IF NOT EXISTS "pg_decisions_input_idx" ON "decisions" ("candidate_id", "snapshot_id", "engine_version", "input_fingerprint");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_decisions_semantic_input_unique" ON "decisions" ("candidate_id", "snapshot_id", "engine_version", "input_fingerprint");
CREATE INDEX IF NOT EXISTS "pg_decision_reason_decision_idx" ON "decision_reasons" ("decision_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_decision_reason_unique" ON "decision_reasons" ("decision_id", "reason_code", "finding_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_applications_candidate_opportunity_idx" ON "applications" ("candidate_id", "opportunity_id");
CREATE INDEX IF NOT EXISTS "pg_applications_candidate_status_idx" ON "applications" ("status");
CREATE INDEX IF NOT EXISTS "pg_app_events_app_time_idx" ON "application_events" ("application_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "pg_search_targets_candidate_idx" ON "search_targets" ("candidate_id");
CREATE INDEX IF NOT EXISTS "pg_discovery_runs_target_idx" ON "discovery_runs" ("search_target_id");
CREATE INDEX IF NOT EXISTS "pg_discovery_runs_candidate_idx" ON "discovery_runs" ("candidate_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pg_discovery_matches_cand_target_opp_idx" ON "discovery_matches" ("candidate_id", "search_target_id", "opportunity_id");
CREATE INDEX IF NOT EXISTS "pg_discovery_matches_candidate_idx" ON "discovery_matches" ("candidate_id");
