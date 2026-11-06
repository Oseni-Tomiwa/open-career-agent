-- R-01.2 REVIEW DRAFT. Outside active migrations. Do not execute.
ALTER TABLE opportunities ADD COLUMN visibility text NOT NULL DEFAULT 'PUBLIC';
--> statement-breakpoint
ALTER TABLE opportunities ADD COLUMN owner_candidate_id text REFERENCES candidates(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE opportunities ADD CONSTRAINT r012_opportunity_scope CHECK ((visibility = 'PUBLIC' AND owner_candidate_id IS NULL) OR (visibility = 'CANDIDATE_PRIVATE' AND owner_candidate_id IS NOT NULL));
--> statement-breakpoint
CREATE UNIQUE INDEX r012_opportunity_owner_key ON opportunities (id, owner_candidate_id);
--> statement-breakpoint
CREATE FUNCTION r012_prevent_ownership_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.visibility IS DISTINCT FROM OLD.visibility OR
     NEW.owner_candidate_id IS DISTINCT FROM OLD.owner_candidate_id THEN
    RAISE EXCEPTION 'opportunity ownership is immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER r012_opportunity_ownership_immutable BEFORE UPDATE OF visibility, owner_candidate_id ON opportunities FOR EACH ROW EXECUTE FUNCTION r012_prevent_ownership_change();
--> statement-breakpoint
ALTER TABLE opportunity_snapshots ADD COLUMN category text NOT NULL DEFAULT 'JOB' CHECK (category IN ('JOB','INTERNSHIP','FREELANCE_CONTRACT','FELLOWSHIP','GRANT','COMPETITION','HACKATHON'));
--> statement-breakpoint
ALTER TABLE opportunity_snapshots ADD COLUMN deadline_date date CHECK (deadline_date IS NULL OR (deadline_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'));
--> statement-breakpoint
ALTER TABLE opportunity_snapshots ADD COLUMN manual_source_url text;
--> statement-breakpoint
ALTER TABLE opportunity_snapshots ADD COLUMN manual_source_context text;
--> statement-breakpoint
ALTER TABLE opportunity_snapshots ADD COLUMN manual_revision integer
 CHECK (manual_revision IS NULL OR (manual_revision >= 1
 AND (NULLIF(trim(manual_source_url), '') IS NOT NULL OR NULLIF(trim(manual_source_context), '') IS NOT NULL)));
--> statement-breakpoint
CREATE UNIQUE INDEX r012_snapshot_revision_key ON opportunity_snapshots (opportunity_id, manual_revision);
--> statement-breakpoint
CREATE TABLE manual_opportunity_captures (
  opportunity_id text NOT NULL PRIMARY KEY,
  candidate_id text NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  normalized_url text,
  match_key text NOT NULL,
  duplicate_fingerprint text NOT NULL,
  duplicate_slot text NOT NULL DEFAULT 'default',
  create_idempotency_key text NOT NULL,
  create_request_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
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
