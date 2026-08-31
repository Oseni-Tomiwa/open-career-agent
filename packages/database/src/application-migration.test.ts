import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase, type DatabaseHandle } from './client.js';
import { applyMigrations } from './migrate.js';

const latestMigration = '20260830233447_sparkling_jigsaw';
const migrationsFolder = fileURLToPath(
  new URL('../migrations', import.meta.url),
);

describe('Applications V1 migration', () => {
  let directory: string | undefined;
  let database: DatabaseHandle | undefined;

  afterEach(() => {
    database?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('upgrades the previous schema without losing Applications or events', () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-app-migration-'));
    const previousMigrations = join(directory, 'previous-migrations');
    mkdirSync(previousMigrations);
    for (const entry of readdirSync(migrationsFolder, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory() || entry.name === latestMigration) continue;
      cpSync(
        join(migrationsFolder, entry.name),
        join(previousMigrations, entry.name),
        { recursive: true },
      );
    }

    database = openDatabase(join(directory, 'upgrade.sqlite'));
    applyMigrations(database, previousMigrations);
    database.sqlite.exec(`
      insert into candidates (id, created_at, updated_at)
      values ('candidate-upgrade', 1, 1);
      insert into opportunities (id, created_at)
      values ('opportunity-upgrade', 1);
      insert into applications
        (id, candidate_id, opportunity_id, status, created_at, updated_at)
      values
        ('application-upgrade', 'candidate-upgrade', 'opportunity-upgrade', 'Applied', 1, 1);
      insert into application_events
        (id, application_id, event_type, detail, occurred_at)
      values
        ('event-upgrade', 'application-upgrade', 'status_changed', 'Applied', 1);
    `);

    applyMigrations(database, migrationsFolder);

    expect(
      database.sqlite
        .prepare('select status, note from applications where id = ?')
        .get('application-upgrade'),
    ).toEqual({ status: 'Applied', note: null });
    expect(
      database.sqlite
        .prepare(
          'select event_type as eventType, detail from application_events where id = ?',
        )
        .get('event-upgrade'),
    ).toEqual({ eventType: 'status_changed', detail: 'Applied' });
    expect(() =>
      database!.sqlite
        .prepare(
          `insert into applications
            (id, candidate_id, opportunity_id, status, created_at, updated_at)
           values (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'application-duplicate',
          'candidate-upgrade',
          'opportunity-upgrade',
          'Saved',
          2,
          2,
        ),
    ).toThrow();
    expect(
      database.sqlite
        .prepare(
          "select name from sqlite_master where type = 'index' and name = 'applications_candidate_status_idx'",
        )
        .get(),
    ).toEqual({ name: 'applications_candidate_status_idx' });
  });
});
