ALTER TABLE "evaluations" ADD COLUMN "requirement_input_mode" text;
--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "fit_assessment_status" text;
--> statement-breakpoint
ALTER TABLE "evaluation_findings" ADD COLUMN "canonical_requirement_id" text REFERENCES "canonical_requirements"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "pg_evaluations_requirement_input_mode_check" CHECK("requirement_input_mode" is null or "requirement_input_mode" in ('CANONICAL', 'FALLBACK_TRANSIENT_V1'));
--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "pg_evaluations_fit_assessment_check" CHECK("fit_assessment_status" is null or ("fit_assessment_status" = 'ASSESSED' and "fit_level" is not null) or ("fit_assessment_status" in ('INSUFFICIENT_LISTING_REQUIREMENTS', 'INSUFFICIENT_CANDIDATE_EVIDENCE') and "fit_level" is null));
