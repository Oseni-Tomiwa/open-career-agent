/** Disposable E2E API only: never loads .env or accepts a database path. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApiApp } from '../apps/api/src/app.js';
import {
  applyMigrations,
  CandidateRepository,
  OpportunityRepository,
  ApplicationRepository,
  SearchTargetRepository,
  SourceListingRepository,
  openDatabase,
  type DatabaseHandle,
} from '../packages/database/src/index.js';
import {
  candidateId,
  claimId,
  opportunityId,
  snapshotId,
  searchTargetId,
  discoveryRunId,
  discoveryMatchId,
} from '../packages/domain/src/index.js';
const directory = mkdtempSync(join(tmpdir(), 'rolevia-workspace-e2e-'));
const path = join(directory, 'workspace.sqlite');
let database: DatabaseHandle;
let app: Awaited<ReturnType<typeof createApiApp>> | undefined;
async function start(mode = 'normal') {
  database = openDatabase(
    mode === 'broken' ? join(directory, 'unmigrated.sqlite') : path,
  );
  if (mode !== 'broken') await applyMigrations(database);
  app = await createApiApp({
    database,
    closeDatabaseOnClose: false,
    logger: false,
    config: {
      environment: 'development',
      identityMode: 'development',
      localWorkspaceSetupEnabled: mode !== 'disabled',
      host: '127.0.0.1',
      port: 4311,
      webOrigin: 'http://127.0.0.1:4310',
      trustedCandidateId: 'e2e-personal',
      databaseEngine: 'sqlite',
      databasePath: path,
      migrationMode: 'manual',
      sessionTtlHours: 24,
    },
  });
  await app.listen({ host: '127.0.0.1', port: 4311 });
}
async function stop() {
  await app?.close();
  app = undefined;
  await database?.close();
}
async function inspect() {
  // Independent handle represents the worker's configured database, without starting scans/tasks.
  const worker = openDatabase(path);
  try {
    return {
      candidate: await new CandidateRepository(worker).getCandidate(
        candidateId('e2e-personal'),
      ),
      records: Object.fromEntries(
        ['candidate_claims', 'opportunities', 'applications'].map((table) => [
          table,
          worker
            .sqlite!.prepare(`select count(*) as total from ${table}`)
            .get()!.total,
        ]),
      ),
      count: worker
        .sqlite!.prepare('select count(*) as total from candidates')
        .get()!.total,
    };
  } finally {
    await worker.close();
  }
}
let handling = Promise.resolve();
process.on(
  'message',
  (message: { command: string; mode?: string; id: number }) => {
    handling = handling
      .then(async () => {
        let result: unknown;
        if (message.command === 'restart') {
          await stop();
          await start(message.mode);
        } else if (message.command === 'inspect') result = await inspect();
        else if (message.command === 'populate') {
          const id = candidateId('e2e-personal');
          const opportunity = opportunityId('existing-workspace-opportunity');
          result = await new CandidateRepository(database).ensureCandidate(
            id,
            1000,
          );
          await new CandidateRepository(database).addClaim({
            id: claimId('existing-workspace-claim'),
            candidateId: id,
            kind: 'skill',
            value: 'Existing profile skill',
            state: 'UNKNOWN',
          });
          const opportunities = new OpportunityRepository(database);
          await opportunities.createOpportunity(opportunity);
          await opportunities.appendSnapshot({
            id: snapshotId('existing-workspace-snapshot'),
            opportunityId: opportunity,
            title: 'Existing workspace role',
            organization: 'Existing workspace organization',
            content: 'An existing retained opportunity.',
            fingerprint: 'existing-workspace',
          });
          const source = new SourceListingRepository(database);
          await source.persistListing(
            'existing-listing',
            { sourceSystem: 'greenhouse', sourceExternalId: 'existing-role' },
            opportunity,
            Date.now(),
          );
          const search = new SearchTargetRepository(database);
          const target = await search.createSearchTarget(id, {
            name: 'Existing workspace target',
          });
          const run = await search.createDiscoveryRun(
            discoveryRunId('existing-run'),
            id,
            searchTargetId(target.id),
          );
          await search.recordDiscoveryMatch({
            id: discoveryMatchId('existing-match'),
            candidateId: id,
            searchTargetId: searchTargetId(target.id),
            discoveryRunId: discoveryRunId(run.id),
            opportunityId: opportunity,
            sourceListingId: 'existing-listing',
            matchReasons: ['Existing retained match'],
            retainedUnresolved: [],
          });
          await new ApplicationRepository(database).createApplication({
            candidateId: id,
            opportunityId: opportunity,
            status: 'Saved',
          });
        } else throw new Error('Unknown fixture operation');
        process.send?.({ id: message.id, result });
      })
      .catch((error: unknown) => {
        process.send?.({
          id: message.id,
          error: error instanceof Error ? error.message : 'Fixture failed',
        });
      });
  },
);
let cleaning = false;
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  await handling;
  await stop();
  rmSync(directory, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGTERM', () => {
  void cleanup();
});
process.on('disconnect', () => {
  void cleanup();
});
try {
  await start();
  process.send?.({ ready: true });
} catch (error) {
  await stop();
  rmSync(directory, { recursive: true, force: true });
  throw error;
}
