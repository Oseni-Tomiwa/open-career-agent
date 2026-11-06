import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EvaluationRepository } from './repositories/evaluation-repository.js';
import { SourceListingRepository } from './repositories/source-listing-repository.js';
import { ApplicationRepository } from './repositories/application-repository.js';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './client.js';
import { applyMigrations } from './migrate.js';
import { ManualOpportunityRepository } from './repositories/manual-opportunity-repository.js';
import { OpportunityRepository } from './repositories/opportunity-repository.js';
import {
  OPPORTUNITY_TYPES,
  opportunityId,
  snapshotId,
  evaluationId,
  candidateId,
  applicationId,
} from '@oca/domain';

describe('manual opportunity persistence', () => {
  it('isolates ownership, replays creation and appends only changed revisions', async () => {
    const db = openDatabase(':memory:');
    try {
      await applyMigrations(db);
      db.sqlite!.exec(
        "INSERT INTO candidates (id, created_at, updated_at) VALUES ('a', 0, 0), ('b', 0, 0)",
      );
      const repo = new ManualOpportunityRepository(db);
      const input = {
        category: 'GRANT',
        title: 'Research grant',
        organization: 'Foundation',
        sourceUrl: null,
        sourceContext: 'Email',
        deadline: '2028-02-29',
      } as const;
      const key = 'a217dfc0-332f-4df3-9094-78678d0141a8';
      const created = await repo.create('a', key, input);
      expect(created.replayed).toBe(false);
      expect(await repo.get('b', created.record.id)).toBeNull();
      expect(await repo.create('a', key, input)).toEqual({
        record: created.record,
        replayed: true,
      });
      expect(await repo.edit('a', created.record.id, 1, input)).toEqual(
        created.record,
      );
      const edited = await repo.edit('a', created.record.id, 1, {
        ...input,
        title: 'Revised grant',
      });
      expect(edited.version).toBe(2);
      expect((await repo.create('a', key, input)).record).toEqual(edited);
      await expect(
        repo.edit('a', created.record.id, 1, input),
      ).rejects.toMatchObject({ code: 'STALE_VERSION' });
      const publicRepo = new OpportunityRepository(db);
      expect(
        await publicRepo.getOpportunity(opportunityId(created.record.id)),
      ).toBeNull();
      expect(
        await publicRepo.getSnapshots(opportunityId(created.record.id)),
      ).toEqual([]);
      const rows = db
        .sqlite!.prepare(
          'SELECT id FROM opportunity_snapshots ORDER BY manual_revision',
        )
        .all();
      expect(rows).toHaveLength(2);
      expect(
        await publicRepo.getSnapshot(snapshotId(String(rows[0]!.id))),
      ).toBeNull();
    } finally {
      await db.close();
    }
  });
  it('captures every category, rejects malformed legacy links and rolls back a late write failure', async () => {
    const db = openDatabase(':memory:');
    try {
      await applyMigrations(db);
      db.sqlite!.exec(
        "INSERT INTO candidates (id,created_at,updated_at) VALUES ('a',0,0)",
      );
      const repo = new ManualOpportunityRepository(db);
      const input = {
        title: 'Example',
        organization: 'Example',
        sourceUrl: null,
        sourceContext: 'Private email',
        deadline: null,
      };
      for (const category of OPPORTUNITY_TYPES) {
        const saved = await repo.create('a', randomUUID(), {
          ...input,
          category,
        });
        expect((await repo.get('a', saved.record.id))?.category).toBe(category);
      }
      const page = await repo.list('a', 3);
      expect(page.items).toHaveLength(3);
      expect((await repo.list('a', 10, page.nextCursor!)).items).toHaveLength(
        4,
      );
      const id = page.items[0]!.id;
      const snapshot = db
        .sqlite!.prepare(
          'SELECT id FROM opportunity_snapshots WHERE opportunity_id=?',
        )
        .get(id)!.id as string;
      db.sqlite!.prepare(
        "INSERT INTO evaluations (id,candidate_id,snapshot_id,eligibility_state,created_at) VALUES ('forged','a',?,'unknown',0)",
      ).run(snapshot);
      expect(
        await new EvaluationRepository(db).getEvaluation(
          evaluationId('forged'),
        ),
      ).toBeNull();
      const listing = new SourceListingRepository(db);
      expect(await listing.getListing(id)).toBeNull();
      expect(await listing.listObservationsForListing(id)).toEqual([]);
      await expect(
        new ApplicationRepository(db).createApplication({
          candidateId: candidateId('a'),
          opportunityId: opportunityId(id),
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      db.sqlite!.prepare(
        "INSERT INTO applications (id,candidate_id,opportunity_id,status,created_at,updated_at) VALUES ('forged','a',?,'Saved',0,0)",
      ).run(id);
      const appRepo = new ApplicationRepository(db);
      expect(
        await appRepo.getApplication(candidateId('a'), applicationId('forged')),
      ).toBeNull();
      await expect(
        appRepo.getEvents(candidateId('a'), applicationId('forged')),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      db.sqlite!.exec(
        "CREATE TRIGGER fail_capture BEFORE INSERT ON manual_opportunity_captures BEGIN SELECT RAISE(ABORT,'injected'); END",
      );
      const key = randomUUID();
      const failing = {
        ...input,
        title: 'Rollback example',
        category: 'JOB',
      } as const;
      await expect(repo.create('a', key, failing)).rejects.toThrow();
      for (const table of [
        'opportunities',
        'source_listings',
        'opportunity_snapshots',
        'source_observations',
        'opportunity_snapshot_sources',
        'manual_opportunity_captures',
      ]) {
        expect(
          db.sqlite!.prepare('SELECT count(*) AS n FROM ' + table).get()?.n,
        ).toBe(7);
      }
      db.sqlite!.exec('DROP TRIGGER fail_capture');
      expect((await repo.create('a', key, failing)).replayed).toBe(false);
    } finally {
      await db.close();
    }
  });
  it('serializes independent SQLite processes and preserves creation across reopen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rolevia-manual-race-'));
    const path = join(dir, 'manual.sqlite');
    const db = openDatabase(path);
    const children: ReturnType<typeof spawn>[] = [];
    const input = {
      category: 'JOB',
      title: 'Example',
      organization: 'Studio',
      sourceUrl: null,
      sourceContext: 'Email',
      deadline: null,
    } as const;
    const key = randomUUID();
    try {
      await applyMigrations(db);
      db.sqlite!.exec(
        "INSERT INTO candidates (id,created_at,updated_at) VALUES ('a',0,0)",
      );
      const code = `
        import { openDatabase } from ${JSON.stringify(new URL('./client.ts', import.meta.url).href)};
        import { ManualOpportunityRepository } from ${JSON.stringify(new URL('./repositories/manual-opportunity-repository.ts', import.meta.url).href)};
        const db=openDatabase(process.argv[1]);
        const repository=new ManualOpportunityRepository(db);
        process.send({ready:true});
        process.once('message',async ({key,input})=>{
          try { process.send({result:await repository.create('a',key,input)}); }
          catch(error){process.send({error:error.message});process.exitCode=1;}
          finally {await db.close();process.disconnect();}
        });`;
      const readiness: Promise<void>[] = [];
      const results: Promise<
        Awaited<ReturnType<ManualOpportunityRepository['create']>>
      >[] = [];
      for (let i = 0; i < 2; i++) {
        const child = spawn(
          process.execPath,
          [
            '--conditions=development',
            '--import',
            'tsx',
            '--input-type=module',
            '-e',
            code,
            path,
          ],
          { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
        );
        children.push(child);
        let stderr = '';
        child.stderr!.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        readiness.push(
          new Promise((resolve, reject) => {
            child.on('message', (m: { ready?: boolean }) => {
              if (m.ready) resolve();
            });
            child.once('error', reject);
            child.once('exit', () =>
              reject(
                new Error(stderr || 'SQLite child exited before readiness'),
              ),
            );
          }),
        );
        results.push(
          new Promise((resolve, reject) => {
            child.on(
              'message',
              (m: {
                result?: Awaited<
                  ReturnType<ManualOpportunityRepository['create']>
                >;
                error?: string;
              }) => {
                if (m.error) reject(new Error(m.error));
                if (m.result) resolve(m.result);
              },
            );
            child.once('error', reject);
            child.once('exit', () =>
              reject(new Error(stderr || 'SQLite child exited without result')),
            );
          }),
        );
      }
      const completed = Promise.all([...readiness]).then(() => {
        for (const child of children) child.send({ key, input });
      });
      const [, values] = await Promise.all([completed, Promise.all(results)]);
      expect(values.map((v) => v.replayed).sort()).toEqual([false, true]);
      expect(values[0]?.record).toEqual(values[1]?.record);
      await db.close();
      const reopened = openDatabase(path);
      try {
        expect(
          await new ManualOpportunityRepository(reopened).create(
            'a',
            key,
            input,
          ),
        ).toEqual({ record: values[0]?.record, replayed: true });
        expect(
          reopened
            .sqlite!.prepare(
              'SELECT count(*) AS count FROM opportunity_snapshots',
            )
            .get()?.count,
        ).toBe(1);
      } finally {
        await reopened.close();
      }
    } finally {
      for (const child of children) if (child.exitCode === null) child.kill();
      await db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);
});
