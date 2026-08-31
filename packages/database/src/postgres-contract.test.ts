import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  candidateId,
  evaluationId,
  opportunityId,
  snapshotId,
} from '@oca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations } from './migrate.js';
import { openDatabase, type DatabaseHandle } from './client.js';

import { BackgroundTaskLedger } from './task-ledger.js';
import { CandidateRepository } from './repositories/candidate-repository.js';
import { OpportunityRepository } from './repositories/opportunity-repository.js';
import { EvaluationRepository } from './repositories/evaluation-repository.js';
import { CareerSignalsRepository } from './repositories/career-signals-repository.js';

describe('Production Data Layer V1 Dual-Engine Contract & Parity Suite', () => {
  describe('Schema Parity Invariant', () => {
    it('maintains 1:1 table and column parity between SQLite and PostgreSQL schemas', async () => {
      const sqliteTables = await import('./schema.js');
      const postgresTables = await import('./schema-pg.js');

      const sqliteKeys = Object.keys(sqliteTables).filter(
        (k) =>
          typeof (sqliteTables as any)[k] === 'object' &&
          'dbName' in (sqliteTables as any)[k],
      );
      const postgresKeys = Object.keys(postgresTables).filter(
        (k) =>
          typeof (postgresTables as any)[k] === 'object' &&
          'dbName' in (postgresTables as any)[k],
      );

      expect(postgresKeys.sort()).toEqual(sqliteKeys.sort());

      for (const key of sqliteKeys) {
        const sqliteTable = (sqliteTables as any)[key];
        const postgresTable = (postgresTables as any)[key];

        const sqliteCols = Object.keys(sqliteTable).filter(
          (colKey) =>
            typeof sqliteTable[colKey] === 'object' &&
            sqliteTable[colKey] !== null &&
            'name' in sqliteTable[colKey],
        );
        const postgresCols = Object.keys(postgresTable).filter(
          (colKey) =>
            typeof postgresTable[colKey] === 'object' &&
            postgresTable[colKey] !== null &&
            'name' in postgresTable[colKey],
        );

        expect(postgresCols.sort()).toEqual(sqliteCols.sort());
      }
    });
  });

  describe('Engine Abstraction & Portable Repositories (SQLite)', () => {
    let directory: string;
    let handle: DatabaseHandle;

    beforeEach(async () => {
      directory = mkdtempSync(join(tmpdir(), 'oca-pg-contract-sqlite-'));
      handle = openDatabase(join(directory, 'test.sqlite'));
      await applyMigrations(handle);
    });

    afterEach(async () => {
      await handle.close();
      rmSync(directory, { recursive: true, force: true });
    });

    it('executes atomic task claiming and ledger operations correctly on SQLite handle', async () => {
      const ledger = new BackgroundTaskLedger(handle);
      await ledger.enqueue({
        taskType: 'test.task',
        payload: { message: 'hello' },
        idempotencyKey: 'idem-contract-1',
      });

      const claimed = await ledger.claimNext({
        leaseOwner: 'worker-a',
        leaseDurationMs: 30000,
      });

      expect(claimed).not.toBeNull();
      expect(claimed?.taskType).toBe('test.task');
      expect(claimed?.leaseOwner).toBe('worker-a');

      await ledger.markSucceeded(claimed!.id, 'worker-a');

      const next = await ledger.claimNext({
        leaseOwner: 'worker-b',
        leaseDurationMs: 30000,
      });
      expect(next).toBeNull();
    });

    it('executes candidate and evaluation persistence across repositories seamlessly on SQLite', async () => {
      const candidateRepo = new CandidateRepository(handle);
      const oppRepo = new OpportunityRepository(handle);
      const evalRepo = new EvaluationRepository(handle);

      const candId = candidateId('cand-contract-sqlite');
      const oppId = opportunityId('opp-contract-sqlite');
      const snapId = snapshotId('snap-contract-sqlite');

      await candidateRepo.createCandidate(candId);
      await oppRepo.createOpportunity(oppId);
      await oppRepo.appendSnapshot({
        id: snapId,
        opportunityId: oppId,
        title: 'Backend Engineer',
        organization: 'Acme',
        content: 'TypeScript and Node.js',
        fingerprint: 'fp-contract-sqlite',
      });

      const cand = await candidateRepo.getCandidate(candId);
      expect(cand).not.toBeNull();

      await evalRepo.persistEvaluation({
        id: evaluationId('eval-contract-sqlite'),
        candidateId: candId,
        snapshotId: snapId,
        eligibilityState: 'eligible',
        fitLevel: 'strong',
        qualityLevel: 'strong',
      });

      const evaluation = await evalRepo.getEvaluation(
        'eval-contract-sqlite' as any,
      );
      expect(evaluation?.fitLevel).toBe('strong');
      expect(evaluation?.qualityLevel).toBe('strong');
    });

    it('executes Career Signals repository queries on SQLite handle', async () => {
      const signalsRepo = new CareerSignalsRepository(handle);
      const candId = candidateId('cand-signals-sqlite');
      const summary = await signalsRepo.getCareerSignals(candId);
      expect(summary.candidateId).toBe(candId);
    });
  });

  const postgresUrl = process.env.TEST_POSTGRES_URL;

  if (postgresUrl) {
    const url = new URL(postgresUrl);
    const databaseName = url.pathname.slice(1);
    const isLocal =
      url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (!isLocal || !databaseName.startsWith('rolevia_test')) {
      throw new Error(
        'TEST_POSTGRES_URL must identify a local disposable database whose name starts with rolevia_test',
      );
    }
  }

  if (postgresUrl && postgresUrl.startsWith('postgres')) {
    describe('Engine Abstraction & Portable Repositories (PostgreSQL Integration)', () => {
      let handle: DatabaseHandle;

      beforeEach(async () => {
        handle = openDatabase({
          engine: 'postgres',
          databaseUrl: postgresUrl,
        });
        await handle.pgPool!.query(
          'DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
        );
        await applyMigrations(handle);
      });

      afterEach(async () => {
        await handle.close();
      });

      it('executes FOR UPDATE SKIP LOCKED task claiming on PostgreSQL handle', async () => {
        const ledger = new BackgroundTaskLedger(handle);
        const taskKey = `pg-idem-${Date.now()}`;
        await ledger.enqueue({
          taskType: 'pg.test.task',
          payload: { engine: 'postgres' },
          idempotencyKey: taskKey,
        });

        const claimed = await ledger.claimNext({
          leaseOwner: 'pg-worker-1',
          leaseDurationMs: 30000,
        });

        expect(claimed).not.toBeNull();
        expect(claimed?.taskType).toBe('pg.test.task');
        expect(claimed?.leaseOwner).toBe('pg-worker-1');

        await ledger.markSucceeded(claimed!.id, 'pg-worker-1');
      });

      it('executes repository operations seamlessly on PostgreSQL handle', async () => {
        const candidateRepo = new CandidateRepository(handle);
        const oppRepo = new OpportunityRepository(handle);
        const evalRepo = new EvaluationRepository(handle);

        const candId = candidateId(`cand-pg-${Date.now()}`);
        const oppId = opportunityId(`opp-pg-${Date.now()}`);
        const snapId = snapshotId(`snap-pg-${Date.now()}`);

        await candidateRepo.createCandidate(candId);
        await oppRepo.createOpportunity(oppId);
        await oppRepo.appendSnapshot({
          id: snapId,
          opportunityId: oppId,
          title: 'Staff Engineer',
          organization: 'Rolevia',
          content: 'PostgreSQL dual-engine test.',
          fingerprint: `fp-pg-${Date.now()}`,
        });

        await evalRepo.persistEvaluation({
          id: evaluationId(`eval-pg-${Date.now()}`),
          candidateId: candId,
          snapshotId: snapId,
          eligibilityState: 'eligible',
          fitLevel: 'strong',
          qualityLevel: 'strong',
        });

        const currentEval = await evalRepo.getCurrentEvaluation(candId, snapId);
        expect(currentEval?.fitLevel).toBe('strong');
      });
    });
  }
});
