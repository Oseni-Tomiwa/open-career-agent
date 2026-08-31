import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase, type DatabaseHandle } from './client.js';
import { applyMigrations } from './migrate.js';

const identityMigration = '20260831162337_bitter_moondragon';
const migrationsFolder = fileURLToPath(
  new URL('../migrations', import.meta.url),
);

describe('canonical Opportunity identity migration', () => {
  let directory: string | undefined;
  let database: DatabaseHandle | undefined;

  afterEach(async () => {
    await database?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('upgrades an existing SQLite installation without merging or losing rows', async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-identity-migration-'));
    const previousMigrations = join(directory, 'previous-migrations');
    mkdirSync(previousMigrations);
    for (const entry of readdirSync(migrationsFolder, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory() || entry.name === identityMigration) continue;
      cpSync(
        join(migrationsFolder, entry.name),
        join(previousMigrations, entry.name),
        {
          recursive: true,
        },
      );
    }

    database = openDatabase(join(directory, 'upgrade.sqlite'));
    await applyMigrations(database, previousMigrations);
    database.sqlite!.exec(`
      insert into opportunities (id, created_at) values ('existing-opportunity', 1);
      insert into source_listings
        (id, opportunity_id, source_system, source_external_id, created_at)
      values
        ('existing-listing', 'existing-opportunity', 'greenhouse', 'existing-id', 1);
    `);

    await applyMigrations(database, migrationsFolder);

    expect(
      database
        .sqlite!.prepare(
          'select opportunity_id as opportunityId from source_listings where id = ?',
        )
        .get('existing-listing'),
    ).toEqual({ opportunityId: 'existing-opportunity' });
    expect(
      database
        .sqlite!.prepare(
          "select name from sqlite_master where type = 'table' and name = 'opportunity_identity_keys'",
        )
        .get(),
    ).toEqual({ name: 'opportunity_identity_keys' });
    expect(
      database
        .sqlite!.prepare(
          'select count(*) as count from opportunity_identity_keys',
        )
        .get(),
    ).toEqual({ count: 0 });
  });
});
