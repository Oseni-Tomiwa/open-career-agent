CREATE TABLE "career_profile_reevaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"task_count" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "career_profile_reevaluations_candidate_id_candidates_id_fk"
		FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id")
		ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
ALTER TABLE "candidate_claims" ADD COLUMN "subject_key" text;--> statement-breakpoint
UPDATE "candidate_claims" SET "subject_key" = 'legacy:' || "id";--> statement-breakpoint
ALTER TABLE "candidate_claims" ALTER COLUMN "subject_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_claims" ADD COLUMN "lifecycle_state" text DEFAULT 'CURRENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_claims" ADD COLUMN "predecessor_claim_id" text;--> statement-breakpoint
ALTER TABLE "candidate_claims" ADD COLUMN "succession_type" text;--> statement-breakpoint
ALTER TABLE "candidate_claims" ADD COLUMN "succession_note" text;--> statement-breakpoint
ALTER TABLE "candidate_claims" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "pg_candidate_claims_candidate_lifecycle_idx"
	ON "candidate_claims" USING btree ("candidate_id", "lifecycle_state");--> statement-breakpoint
CREATE UNIQUE INDEX "pg_candidate_claims_current_subject_unique"
	ON "candidate_claims" USING btree ("candidate_id", "subject_key")
	WHERE "candidate_claims"."lifecycle_state" = 'CURRENT';--> statement-breakpoint
CREATE INDEX "pg_career_profile_reevaluations_candidate_idx"
	ON "career_profile_reevaluations" USING btree ("candidate_id", "created_at");
