import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase, type DatabaseHandle } from './client.js';
import { applyMigrations } from './migrate.js';

const lifecycleMigration = '20260901033104_sweet_khan';
const migrationsFolder = fileURLToPath(
  new URL('../migrations', import.meta.url),
);

describe('Career Profile lifecycle migration', () => {
  let directory: string | undefined;
  let database: DatabaseHandle | undefined;

  afterEach(async () => {
    await database?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('preserves 43 existing claims, Evidence, timestamps, and factual meaning', async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-profile-lifecycle-migration-'));
    const previousMigrations = join(directory, 'previous-migrations');
    mkdirSync(previousMigrations);
    for (const entry of readdirSync(migrationsFolder, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory() || entry.name === lifecycleMigration) continue;
      cpSync(
        join(migrationsFolder, entry.name),
        join(previousMigrations, entry.name),
        { recursive: true },
      );
    }

    database = openDatabase(join(directory, 'upgrade.sqlite'));
    await applyMigrations(database, previousMigrations);
    database
      .sqlite!.prepare(
        `insert into candidates (id, created_at, updated_at)
       values ('candidate-existing-43', 1000, 2000)`,
      )
      .run();
    const insertClaim = database.sqlite!.prepare(
      `insert into candidate_claims
       (id, candidate_id, kind, value, scope, state, confidence, created_at, updated_at)
       values (?, 'candidate-existing-43', ?, ?, ?, 'SUPPORTED', 'HIGH', ?, ?)`,
    );
    const insertEvidence = database.sqlite!.prepare(
      `insert into evidence
       (id, evidence_type, source_reference, excerpt, state, created_at)
       values (?, 'candidate statement', 'candidate-confirmed/manual', ?, 'candidate-confirmed', ?)`,
    );
    const linkEvidence = database.sqlite!.prepare(
      `insert into candidate_claim_evidence (claim_id, evidence_id)
       values (?, ?)`,
    );
    for (let index = 1; index <= 43; index += 1) {
      const claim = `existing-claim-${index}`;
      const evidence = `existing-evidence-${index}`;
      insertClaim.run(
        claim,
        index % 2 === 0 ? 'skill' : 'capability',
        `Approved fact ${index}`,
        `Approved scope ${index}`,
        1000 + index,
        2000 + index,
      );
      insertEvidence.run(evidence, `Approved Evidence ${index}`, 1000 + index);
      linkEvidence.run(claim, evidence);
    }

    await applyMigrations(database, migrationsFolder);

    expect(
      database
        .sqlite!.prepare(
          `select count(*) as count from candidate_claims
         where candidate_id = 'candidate-existing-43'
           and lifecycle_state = 'CURRENT'`,
        )
        .get(),
    ).toEqual({ count: 43 });
    expect(
      database
        .sqlite!.prepare(
          `select count(*) as count from candidate_claim_evidence cce
         join candidate_claims cc on cc.id = cce.claim_id
         join evidence e on e.id = cce.evidence_id
         where cc.candidate_id = 'candidate-existing-43'
           and e.state = 'candidate-confirmed'`,
        )
        .get(),
    ).toEqual({ count: 43 });
    expect(
      database
        .sqlite!.prepare(
          `select value, scope, state, confidence,
                subject_key as subjectKey, created_at as createdAt,
                updated_at as updatedAt
         from candidate_claims where id = 'existing-claim-17'`,
        )
        .get(),
    ).toEqual({
      value: 'Approved fact 17',
      scope: 'Approved scope 17',
      state: 'SUPPORTED',
      confidence: 'HIGH',
      subjectKey: 'legacy:existing-claim-17',
      createdAt: 1017,
      updatedAt: 2017,
    });
  });
});
