CREATE TABLE "requirement_sets" (
  "id" text PRIMARY KEY NOT NULL,
  "snapshot_id" text NOT NULL REFERENCES "opportunity_snapshots"("id") ON DELETE restrict,
  "model_version" text NOT NULL,
  "input_fingerprint" text NOT NULL,
  "extractor_pipeline_version" text NOT NULL,
  "deterministic_extractor_version" text NOT NULL,
  "status" text NOT NULL,
  "deterministic_status" text NOT NULL,
  "assisted_status" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "pg_requirement_sets_status_check" CHECK ("status" in ('COMPLETE', 'PARTIAL', 'FAILED')),
  CONSTRAINT "pg_requirement_sets_deterministic_status_check" CHECK ("deterministic_status" in ('SUCCEEDED', 'FAILED')),
  CONSTRAINT "pg_requirement_sets_assisted_status_check" CHECK ("assisted_status" in ('NOT_REQUESTED', 'SUCCEEDED', 'UNAVAILABLE', 'REJECTED', 'FAILED'))
);
--> statement-breakpoint
CREATE INDEX "pg_requirement_sets_snapshot_idx" ON "requirement_sets" ("snapshot_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "pg_requirement_sets_compatible_input_unique" ON "requirement_sets" ("snapshot_id", "extractor_pipeline_version", "input_fingerprint");
--> statement-breakpoint
CREATE TABLE "canonical_requirements" (
  "id" text PRIMARY KEY NOT NULL,
  "requirement_set_id" text NOT NULL REFERENCES "requirement_sets"("id") ON DELETE restrict,
  "category" text NOT NULL,
  "normalized_key" text NOT NULL,
  "value_json" text NOT NULL,
  "statement" text NOT NULL,
  "strength" text NOT NULL,
  "polarity" text NOT NULL,
  "assertion_basis" text NOT NULL,
  "evaluation_use" text NOT NULL,
  "actionability" text NOT NULL,
  "extraction_confidence" text NOT NULL,
  "extractor_id" text NOT NULL,
  "extractor_version" text NOT NULL,
  "canonical_hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "pg_canonical_requirements_strength_check" CHECK ("strength" in ('REQUIRED', 'PREFERRED', 'CONTEXTUAL')),
  CONSTRAINT "pg_canonical_requirements_hard_safety_check" CHECK ("actionability" <> 'HARD_CONSTRAINT_SAFE' OR ("strength" = 'REQUIRED' AND "evaluation_use" = 'ELIGIBILITY' AND "assertion_basis" in ('EXPLICIT_STRUCTURED', 'EXPLICIT_TEXT') AND "extraction_confidence" = 'HIGH'))
);
--> statement-breakpoint
CREATE INDEX "pg_canonical_requirements_set_idx" ON "canonical_requirements" ("requirement_set_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "pg_canonical_requirements_set_hash_unique" ON "canonical_requirements" ("requirement_set_id", "canonical_hash");
--> statement-breakpoint
CREATE TABLE "requirement_provenance" (
  "id" text PRIMARY KEY NOT NULL,
  "requirement_id" text NOT NULL REFERENCES "canonical_requirements"("id") ON DELETE restrict,
  "source_observation_id" text NOT NULL REFERENCES "source_observations"("id") ON DELETE restrict,
  "snapshot_id" text NOT NULL REFERENCES "opportunity_snapshots"("id") ON DELETE restrict,
  "source_field_path" text,
  "normalized_section" text,
  "start_offset" integer,
  "end_offset" integer,
  "excerpt" text NOT NULL,
  "excerpt_hash" text NOT NULL,
  "locator_version" text NOT NULL,
  "extractor_id" text NOT NULL,
  "extractor_version" text NOT NULL,
  CONSTRAINT "pg_requirement_provenance_offsets_check" CHECK (("start_offset" is null AND "end_offset" is null) OR ("start_offset" >= 0 AND "end_offset" >= "start_offset"))
);
--> statement-breakpoint
CREATE INDEX "pg_requirement_provenance_requirement_idx" ON "requirement_provenance" ("requirement_id");
--> statement-breakpoint
CREATE INDEX "pg_requirement_provenance_observation_idx" ON "requirement_provenance" ("source_observation_id");
--> statement-breakpoint
CREATE INDEX "pg_requirement_provenance_snapshot_idx" ON "requirement_provenance" ("snapshot_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "pg_requirement_provenance_locator_unique" ON "requirement_provenance" ("requirement_id", "source_observation_id", "excerpt_hash", "locator_version");
--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "requirement_set_id" text REFERENCES "requirement_sets"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "requirement_input_fingerprint" text;
--> statement-breakpoint
CREATE INDEX "pg_evaluations_requirement_set_idx" ON "evaluations" ("requirement_set_id");
