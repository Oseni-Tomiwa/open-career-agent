import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase, type DatabaseHandle } from './client.js';
import { applyMigrations } from './migrate.js';

const evaluatorMigration = '20260906231847_evaluator_v2_5';
const migrationsFolder = fileURLToPath(
  new URL('../migrations', import.meta.url),
);

describe('V2.5 evaluator migration', () => {
  let directory: string | undefined;
  let database: DatabaseHandle | undefined;

  afterEach(async () => {
    await database?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('preserves populated historical evaluation lineage and enforces Fit status invariants', async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-v2-5-migration-'));
    const previousMigrations = join(directory, 'previous-migrations');
    mkdirSync(previousMigrations);
    for (const entry of readdirSync(migrationsFolder, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory() || entry.name === evaluatorMigration) continue;
      cpSync(
        join(migrationsFolder, entry.name),
        join(previousMigrations, entry.name),
        { recursive: true },
      );
    }

    database = openDatabase(join(directory, 'upgrade.sqlite'));
    await applyMigrations(database, previousMigrations);
    database.sqlite!.exec(`
      insert into candidates (id, created_at, updated_at)
      values ('historical-candidate', 1, 1);
      insert into opportunities (id, created_at)
      values ('historical-opportunity', 1);
      insert into opportunity_snapshots
        (id, opportunity_id, observed_at, title, organization, content, fingerprint, created_at)
      values
        ('historical-snapshot', 'historical-opportunity', 1, 'Role', 'Organization', 'Content', 'snapshot-fingerprint', 1);
      insert into evaluations
        (id, candidate_id, snapshot_id, eligibility_state, fit_level, quality_level, eligibility_input_fingerprint, fit_input_fingerprint, quality_input_fingerprint, created_at)
      values
        ('historical-evaluation', 'historical-candidate', 'historical-snapshot', 'eligible', 'strong', 'strong', 'eligibility-fingerprint', 'fit-fingerprint', 'quality-fingerprint', 1);
      insert into evaluation_findings
        (id, evaluation_id, category, dimension_key, state, summary)
      values
        ('historical-finding', 'historical-evaluation', 'fit', 'technical_skill', 'MATCH', 'Historical finding');
      insert into decisions
        (id, evaluation_id, candidate_id, snapshot_id, priority, explanation, eligibility_input_fingerprint, fit_input_fingerprint, quality_input_fingerprint, created_at)
      values
        ('historical-decision', 'historical-evaluation', 'historical-candidate', 'historical-snapshot', 'high-priority', 'Historical decision', 'eligibility-fingerprint', 'fit-fingerprint', 'quality-fingerprint', 1);
      insert into decision_reasons (id, decision_id, reason_code, finding_id)
      values ('historical-reason', 'historical-decision', 'STRONG_REQUIRED_FIT', 'historical-finding');
    `);

    await applyMigrations(database, migrationsFolder);

    for (const table of [
      'evaluations',
      'evaluation_findings',
      'decisions',
      'decision_reasons',
    ]) {
      expect(
        database
          .sqlite!.prepare(`select count(*) as count from ${table}`)
          .get(),
      ).toEqual({ count: 1 });
    }
    expect(database.sqlite!.prepare('pragma foreign_key_check').all()).toEqual(
      [],
    );
    expect(
      database
        .sqlite!.prepare(
          'select requirement_input_mode as requirementInputMode, fit_assessment_status as fitAssessmentStatus from evaluations where id = ?',
        )
        .get('historical-evaluation'),
    ).toEqual({ requirementInputMode: null, fitAssessmentStatus: null });

    expect(() =>
      database!.sqlite!.exec(
        "update evaluations set fit_assessment_status = 'INSUFFICIENT_LISTING_REQUIREMENTS', fit_level = 'weak' where id = 'historical-evaluation'",
      ),
    ).toThrow(/invalid fit assessment status\/level combination/);
    expect(() =>
      database!.sqlite!.exec(
        "update evaluations set requirement_input_mode = 'UNSAFE' where id = 'historical-evaluation'",
      ),
    ).toThrow(/invalid requirement_input_mode/);
  });
});
