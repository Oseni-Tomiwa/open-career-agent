import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase, type DatabaseHandle } from './client.js';
import { applyMigrations } from './migrate.js';

const cloudMigrations = new Set([
  '20260831050958_fancy_gorilla_man',
  '20260831053451_elite_scarlet_witch',
]);
const migrationsFolder = fileURLToPath(
  new URL('../migrations', import.meta.url),
);

describe('Cloud identity migration', () => {
  let directory: string | undefined;
  let database: DatabaseHandle | undefined;

  afterEach(() => {
    database?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('adds accounts without rewriting durable domain and history rows', () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-cloud-migration-'));
    const prior = join(directory, 'prior');
    mkdirSync(prior);
    for (const entry of readdirSync(migrationsFolder, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory() || cloudMigrations.has(entry.name)) continue;
      cpSync(join(migrationsFolder, entry.name), join(prior, entry.name), {
        recursive: true,
      });
    }

    database = openDatabase(join(directory, 'upgrade.sqlite'));
    applyMigrations(database, prior);
    database.sqlite.exec(`
      insert into candidates (id, created_at, updated_at)
      values ('candidate-preserved', 1, 1);
      insert into candidate_claims
        (id, candidate_id, kind, value, state, created_at, updated_at)
      values
        ('claim-preserved', 'candidate-preserved', 'skill', 'TypeScript', 'SUPPORTED', 1, 1);
      insert into evidence
        (id, evidence_type, source_reference, excerpt, state, created_at)
      values
        ('evidence-preserved', 'manual', 'candidate-confirmed/manual', 'Verified', 'candidate-confirmed', 1);
      insert into candidate_claim_evidence (claim_id, evidence_id)
      values ('claim-preserved', 'evidence-preserved');
      insert into opportunities (id, created_at)
      values ('opportunity-preserved', 1);
      insert into opportunity_snapshots
        (id, opportunity_id, observed_at, title, organization, content, fingerprint, created_at)
      values
        ('snapshot-preserved', 'opportunity-preserved', 1, 'Engineer', 'Example', 'Role', 'fp', 1);
      insert into source_listings
        (id, opportunity_id, source_system, source_external_id, created_at)
      values
        ('listing-preserved', 'opportunity-preserved', 'fixture', 'external-preserved', 1);
      insert into search_targets
        (id, candidate_id, name, created_at, updated_at)
      values
        ('target-preserved', 'candidate-preserved', 'Target', 1, 1);
      insert into discovery_runs
        (id, candidate_id, search_target_id, source_system, started_at, status)
      values
        ('run-preserved', 'candidate-preserved', 'target-preserved', 'fixture', 1, 'completed');
      insert into discovery_matches
        (id, candidate_id, search_target_id, discovery_run_id, opportunity_id,
         source_listing_id, matched_at)
      values
        ('match-preserved', 'candidate-preserved', 'target-preserved',
         'run-preserved', 'opportunity-preserved', 'listing-preserved', 1);
      insert into evaluations
        (id, candidate_id, snapshot_id, eligibility_state, created_at)
      values
        ('evaluation-preserved', 'candidate-preserved', 'snapshot-preserved', 'eligible', 1);
      insert into decisions
        (id, evaluation_id, candidate_id, snapshot_id, priority, explanation,
         eligibility_input_fingerprint, fit_input_fingerprint,
         quality_input_fingerprint, created_at)
      values
        ('decision-preserved', 'evaluation-preserved', 'candidate-preserved',
         'snapshot-preserved', 'consider', 'Preserve this decision',
         'elig', 'fit', 'quality', 1);
      insert into applications
        (id, candidate_id, opportunity_id, status, originating_decision_id,
         created_at, updated_at)
      values
        ('application-preserved', 'candidate-preserved',
         'opportunity-preserved', 'Applied', 'decision-preserved', 1, 1);
      insert into application_events
        (id, application_id, event_type, detail, occurred_at)
      values
        ('event-preserved', 'application-preserved', 'status_changed', 'Applied', 1);
    `);

    applyMigrations(database, migrationsFolder);

    for (const [table, id] of [
      ['candidates', 'candidate-preserved'],
      ['candidate_claims', 'claim-preserved'],
      ['evidence', 'evidence-preserved'],
      ['opportunity_snapshots', 'snapshot-preserved'],
      ['source_listings', 'listing-preserved'],
      ['search_targets', 'target-preserved'],
      ['discovery_runs', 'run-preserved'],
      ['discovery_matches', 'match-preserved'],
      ['evaluations', 'evaluation-preserved'],
      ['decisions', 'decision-preserved'],
      ['application_events', 'event-preserved'],
    ] as const) {
      expect(
        database.sqlite.prepare(`select id from ${table} where id = ?`).get(id),
      ).toEqual({ id });
    }
    expect(
      database.sqlite
        .prepare(
          "select name from sqlite_master where type = 'table' and name in ('users', 'sessions', 'user_candidates') order by name",
        )
        .all(),
    ).toHaveLength(3);
  });
});
