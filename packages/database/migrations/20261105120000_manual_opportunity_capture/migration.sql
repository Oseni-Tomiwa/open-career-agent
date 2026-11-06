-- R-01.2 REVIEW DRAFT. Outside active migrations. Do not execute.
ALTER TABLE opportunities ADD COLUMN visibility text NOT NULL DEFAULT 'PUBLIC';
--> statement-breakpoint
ALTER TABLE opportunities ADD COLUMN owner_candidate_id text REFERENCES candidates(id) ON DELETE RESTRICT CONSTRAINT r012_opportunity_scope CHECK ((visibility = 'PUBLIC' AND owner_candidate_id IS NULL) OR (visibility = 'CANDIDATE_PRIVATE' AND owner_candidate_id IS NOT NULL));
--> statement-breakpoint
CREATE UNIQUE INDEX r012_opportunity_owner_key ON opportunities (id, owner_candidate_id);
--> statement-breakpoint
CREATE TRIGGER r012_opportunity_ownership_immutable
BEFORE UPDATE OF visibility, owner_candidate_id ON opportunities
WHEN NEW.visibility IS NOT OLD.visibility OR NEW.owner_candidate_id IS NOT OLD.owner_candidate_id
BEGIN
  SELECT RAISE(ABORT, 'opportunity ownership is immutable');
END;
--> statement-breakpoint
ALTER TABLE opportunity_snapshots ADD COLUMN category text NOT NULL DEFAULT 'JOB' CHECK (category IN ('JOB','INTERNSHIP','FREELANCE_CONTRACT','FELLOWSHIP','GRANT','COMPETITION','HACKATHON'));
--> statement-breakpoint
ALTER TABLE opportunity_snapshots ADD COLUMN deadline_date text CHECK (deadline_date IS NULL OR (length(deadline_date) = 10 AND substr(deadline_date,1,4) <> '0000' AND date(deadline_date,'+0 days') IS deadline_date));
--> statement-breakpoint
ALTER TABLE opportunity_snapshots ADD COLUMN manual_source_url text;
--> statement-breakpoint
ALTER TABLE opportunity_snapshots ADD COLUMN manual_source_context text;
--> statement-breakpoint
ALTER TABLE opportunity_snapshots ADD COLUMN manual_revision integer
 CHECK (manual_revision IS NULL OR (typeof(manual_revision) = 'integer' AND manual_revision BETWEEN 1 AND 2147483647
 AND (NULLIF(trim(manual_source_url), '') IS NOT NULL OR NULLIF(trim(manual_source_context), '') IS NOT NULL)));
--> statement-breakpoint
CREATE UNIQUE INDEX r012_snapshot_revision_key ON opportunity_snapshots (opportunity_id, manual_revision);
--> statement-breakpoint
CREATE TABLE manual_opportunity_captures (
  opportunity_id text NOT NULL PRIMARY KEY,
  candidate_id text NOT NULL,
  version integer NOT NULL CHECK (typeof(version) = 'integer' AND version BETWEEN 1 AND 2147483647),
  normalized_url text,
  match_key text NOT NULL,
  duplicate_fingerprint text NOT NULL,
  duplicate_slot text NOT NULL DEFAULT 'default',
  create_idempotency_key text NOT NULL,
  create_request_hash text NOT NULL,
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  CONSTRAINT r012_capture_owner FOREIGN KEY (opportunity_id, candidate_id)
    REFERENCES opportunities(id, owner_candidate_id) ON DELETE RESTRICT,
  CONSTRAINT r012_capture_revision FOREIGN KEY (opportunity_id, version)
    REFERENCES opportunity_snapshots(opportunity_id, manual_revision)
    DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (candidate_id, create_idempotency_key),
  UNIQUE (candidate_id, duplicate_fingerprint, duplicate_slot)
);
--> statement-breakpoint
CREATE INDEX r012_capture_list ON manual_opportunity_captures (candidate_id, created_at DESC, opportunity_id DESC);
--> statement-breakpoint
CREATE INDEX r012_capture_url ON manual_opportunity_captures (candidate_id, normalized_url);
--> statement-breakpoint
CREATE INDEX r012_capture_match ON manual_opportunity_captures (candidate_id, match_key);
