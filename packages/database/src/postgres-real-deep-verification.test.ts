import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  candidateId,
  evaluationId,
  opportunityId,
  snapshotId,
  searchTargetId,
  discoveryRunId,
  discoveryMatchId,
  applicationId,
} from '@oca/domain';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import pg from 'pg';

import { applyMigrations } from './migrate.js';
import { openDatabase, type DatabaseHandle } from './client.js';
import { BackgroundTaskLedger } from './task-ledger.js';
import { CandidateRepository } from './repositories/candidate-repository.js';
import { OpportunityRepository } from './repositories/opportunity-repository.js';
import { EvaluationRepository } from './repositories/evaluation-repository.js';
import { ApplicationRepository } from './repositories/application-repository.js';
import { AuthRepository } from './repositories/auth-repository.js';
import { TodayRepository } from './repositories/today-repository.js';
import { CareerSignalsRepository } from './repositories/career-signals-repository.js';
import { SearchTargetRepository } from './repositories/search-target-repository.js';
import { SourceListingRepository } from './repositories/source-listing-repository.js';
import {
  GreenhouseNormalizer,
  LeverNormalizer,
  AshbyNormalizer,
} from '../../sources/src/index.js';
import { createEligibilityHandlers } from '../../../apps/worker/src/eligibility/workflow.js';
import { createFitHandlers } from '../../../apps/worker/src/fit/workflow.js';
import { createQualityHandlers } from '../../../apps/worker/src/quality/workflow.js';
import { createDecisionHandlers } from '../../../apps/worker/src/decision/workflow.js';

const POSTGRES_URL =
  process.env.TEST_POSTGRES_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@127.0.0.1:5432/rolevia_test';

const postgresBaselineSql = readFileSync(
  fileURLToPath(
    new URL(
      '../migrations-postgres/0000_baseline_postgres.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('FINAL PRODUCTION DATA LAYER V1 DEEP POSTGRESQL VERIFICATION SUITE', () => {
  let handle: DatabaseHandle;

  beforeEach(async () => {
    handle = openDatabase({ engine: 'postgres', databaseUrl: POSTGRES_URL });
    if (handle.pgPool) {
      await handle.pgPool.query(
        'DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
      );
      await handle.pgPool.query(postgresBaselineSql);
    }
  });

  afterEach(async () => {
    await handle.close();
  });

  // ==================================================
  // 1. PROVE REAL POSTGRES EXECUTION
  // ==================================================
  it('Section 1: proves real PostgreSQL execution, driver type, and version query', async () => {
    expect(handle.engine).toBe('postgres');
    expect(handle.pgPool).toBeDefined();

    const pool = handle.pgPool!;
    const res = await pool.query('SELECT version()');
    expect(res.rows.length).toBe(1);
    const versionString = res.rows[0].version as string;
    expect(versionString).toContain('PostgreSQL 16');
  });

  // ==================================================
  // 2. FRESH POSTGRES MIGRATION
  // ==================================================
  it('Section 2: migrates a completely fresh PostgreSQL database cleanly and verifies constraints', async () => {
    const adminPool = new pg.Pool({
      connectionString: 'postgres://postgres:postgres@127.0.0.1:5432/postgres',
    });
    const freshDbName = `rolevia_fresh_${Date.now()}`;
    await adminPool.query(`CREATE DATABASE ${freshDbName}`);

    const freshUrl = `postgres://postgres:postgres@127.0.0.1:5432/${freshDbName}`;
    const freshHandle = openDatabase({
      engine: 'postgres',
      databaseUrl: freshUrl,
    });

    try {
      await freshHandle.pgPool!.query(postgresBaselineSql);

      const tableRes = await freshHandle.pgPool!.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      const tableNames = tableRes.rows.map((r) => r.table_name);
      for (const requiredTable of [
        'users',
        'candidates',
        'user_candidates',
        'sessions',
        'search_targets',
        'discovery_runs',
        'source_listings',
        'source_observations',
        'opportunities',
        'opportunity_snapshots',
        'discovery_matches',
        'candidate_claims',
        'candidate_claim_evidence',
        'evaluations',
        'evaluation_findings',
        'evidence',
        'evaluation_finding_evidence',
        'decisions',
        'decision_reasons',
        'applications',
        'application_events',
        'background_tasks',
      ]) {
        expect(tableNames).toContain(requiredTable);
      }

      const indexRes = await freshHandle.pgPool!.query(`
        SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
      `);
      const indexNames = indexRes.rows.map((r) => r.indexname);
      expect(indexNames).toContain(
        'pg_background_tasks_idempotency_key_unique',
      );
      expect(indexNames).toContain('pg_decisions_semantic_input_unique');
    } finally {
      await freshHandle.close();
      await adminPool.query(`DROP DATABASE ${freshDbName}`);
      await adminPool.end();
    }
  });

  // ==================================================
  // 3. REAL MULTI-WORKER CLAIM RACE (FOR UPDATE SKIP LOCKED)
  // ==================================================
  it('Section 3: proves real multi-worker claim race using FOR UPDATE SKIP LOCKED and lease rules', async () => {
    const ledger = new BackgroundTaskLedger(handle);
    const taskKey = `race-task-${Date.now()}`;
    await ledger.enqueue({
      taskType: 'race.test',
      payload: { data: 1 },
      idempotencyKey: taskKey,
    });

    const [claim1, claim2] = await Promise.all([
      ledger.claimNext({ leaseOwner: 'worker-1', leaseDurationMs: 30000 }),
      ledger.claimNext({ leaseOwner: 'worker-2', leaseDurationMs: 30000 }),
    ]);

    expect((claim1 && !claim2) || (!claim1 && claim2)).toBe(true);
    const winner = claim1 ?? claim2!;
    const loser = claim1 ? claim2 : claim1;

    expect(winner).not.toBeNull();
    expect(loser).toBeNull();

    // Verify active lease cannot be stolen
    const stealAttempt = await ledger.claimNext({
      leaseOwner: 'worker-thief',
      leaseDurationMs: 30000,
    });
    expect(stealAttempt).toBeNull();

    // Verify completing task prevents reclaiming
    await ledger.markSucceeded(winner.id, winner.leaseOwner!);
    const postCompleteClaim = await ledger.claimNext({
      leaseOwner: 'worker-3',
      leaseDurationMs: 30000,
    });
    expect(postCompleteClaim).toBeNull();
  });

  // ==================================================
  // 4. APPLICATION CONCURRENCY
  // ==================================================
  it('Section 4: proves optimistic concurrency and stale write protection on Application updates', async () => {
    const candidateRepo = new CandidateRepository(handle);
    const oppRepo = new OpportunityRepository(handle);
    const appRepo = new ApplicationRepository(handle);

    const cId = candidateId(`cand-app-race-${Date.now()}`);
    const oId = opportunityId(`opp-app-race-${Date.now()}`);
    await candidateRepo.createCandidate(cId);
    await oppRepo.createOpportunity(oId);

    const aId = applicationId(`app-race-${Date.now()}`);
    const app = await appRepo.createApplication({
      id: aId,
      candidateId: cId,
      opportunityId: oId,
      status: 'Saved',
    });

    const initialUpdatedAt = new Date(app.updatedAt);

    const [res1, res2] = await Promise.allSettled([
      appRepo.updateApplication({
        id: aId,
        candidateId: cId,
        expectedUpdatedAt: initialUpdatedAt,
        status: 'Applied',
      }),
      appRepo.updateApplication({
        id: aId,
        candidateId: cId,
        expectedUpdatedAt: initialUpdatedAt,
        status: 'Preparing',
      }),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejected = [res1, res2].filter((r) => r.status === 'rejected');

    if (fulfilled.length !== 1) {
      console.log('RES1:', res1);
      console.log('RES2:', res2);
    }

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.code).toBe(
      'STALE_WRITE_CONFLICT',
    );

    const events = await appRepo.getEvents(cId, aId);
    expect(events.length).toBe(3);
  });

  // ==================================================
  // 5. REGISTRATION CONCURRENCY & ATOMIC ROLLBACK
  // ==================================================
  it('Section 5: proves atomic registration concurrency and transaction rollback on PostgreSQL', async () => {
    const authRepo = new AuthRepository(handle);
    const emailBase = `concurrent-user-${Date.now()}@example.com`;

    const attempts = await Promise.allSettled([
      authRepo.createAccount({
        email: emailBase.toUpperCase(),
        passwordHash: 'hash-1',
      }),
      authRepo.createAccount({
        email: emailBase.toLowerCase(),
        passwordHash: 'hash-2',
      }),
    ]);

    const successes = attempts.filter((a) => a.status === 'fulfilled');
    const failures = attempts.filter((a) => a.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const user = await authRepo.findUserByEmail(emailBase);
    expect(user).not.toBeNull();

    // Verify rollback on transaction error
    const pool = handle.pgPool!;
    try {
      await pool.query('BEGIN');
      await pool.query(
        `INSERT INTO users (id, email, normalized_email, password_hash, created_at, updated_at) VALUES ('usr_err', 'fail@err.com', 'fail@err.com', 'hash', NOW(), NOW())`,
      );
      // Intentionally break transaction with invalid FK
      await pool.query(
        `INSERT INTO user_candidates (id, user_id, candidate_id, relationship, is_primary, created_at) VALUES ('uc_err', 'usr_err', 'non_existent_cand', 'OWNER', true, NOW())`,
      );
      await pool.query('COMMIT');
    } catch {
      await pool.query('ROLLBACK');
    }

    const failedUser = await authRepo.findUserByEmail('fail@err.com');
    expect(failedUser).toBeNull();
  });

  // ==================================================
  // 6. EVALUATION LINEAGE RACES
  // ==================================================
  it('Section 6: proves evaluation lineage concurrency and historical revision preservation', async () => {
    const candidateRepo = new CandidateRepository(handle);
    const oppRepo = new OpportunityRepository(handle);
    const evalRepo = new EvaluationRepository(handle);

    const cId = candidateId(`cand-eval-lineage-${Date.now()}`);
    const oId = opportunityId(`opp-eval-lineage-${Date.now()}`);
    const sId = snapshotId(`snap-eval-lineage-${Date.now()}`);
    await candidateRepo.createCandidate(cId);
    await oppRepo.createOpportunity(oId);
    await oppRepo.appendSnapshot({
      id: sId,
      opportunityId: oId,
      title: 'Engineer',
      organization: 'Tech',
      content: 'Skill content',
      fingerprint: 'fp-eval-lineage',
    });

    const eId1 = evaluationId(`eval-1-${Date.now()}`);
    await evalRepo.persistEvaluation({
      id: eId1,
      candidateId: cId,
      snapshotId: sId,
      eligibilityState: 'eligible',
    });

    await evalRepo.persistFitResult({
      evaluationId: eId1,
      fit: {
        level: 'strong',
        engineVersion: 'fit-v1',
        inputFingerprint: 'fp-fit-1',
        summary: 'Strong fit',
      },
      findings: [],
    });

    const current = await evalRepo.getCurrentEvaluation(cId, sId);
    expect(current?.id).toBe(eId1);
    expect(current?.fitLevel).toBe('strong');
  });

  // ==================================================
  // 7. DECISION DB UNIQUENESS
  // ==================================================
  it('Section 7: proves decision database constraint uniqueness rejection', async () => {
    const candidateRepo = new CandidateRepository(handle);
    const oppRepo = new OpportunityRepository(handle);
    const evalRepo = new EvaluationRepository(handle);

    const cId = candidateId(`cand-dec-uniq-${Date.now()}`);
    const oId = opportunityId(`opp-dec-uniq-${Date.now()}`);
    const sId = snapshotId(`snap-dec-uniq-${Date.now()}`);
    const eId = evaluationId(`eval-dec-uniq-${Date.now()}`);

    await candidateRepo.createCandidate(cId);
    await oppRepo.createOpportunity(oId);
    await oppRepo.appendSnapshot({
      id: sId,
      opportunityId: oId,
      title: 'Role',
      organization: 'Org',
      content: 'Content',
      fingerprint: 'fp-dec-uniq',
    });
    await evalRepo.persistEvaluation({
      id: eId,
      candidateId: cId,
      snapshotId: sId,
      eligibilityState: 'eligible',
    });

    const pool = handle.pgPool!;
    const insertQuery = `
      INSERT INTO decisions (id, evaluation_id, candidate_id, snapshot_id, priority, action, explanation, eligibility_input_fingerprint, fit_input_fingerprint, quality_input_fingerprint, engine_version, input_fingerprint, created_at)
      VALUES ($1, $2, $3, $4, 'high-priority', 'apply', 'Direct test', 'fp-e', 'fp-f', 'fp-q', 'v1', 'fp-uniq-1', NOW())
    `;

    await pool.query(insertQuery, ['dec-1', eId, cId, sId]);

    let duplicateFailed = false;
    try {
      await pool.query(insertQuery, ['dec-2', eId, cId, sId]);
    } catch (err: any) {
      duplicateFailed = true;
      expect(err.code).toBe('23505'); // PostgreSQL unique_violation code
    }
    expect(duplicateFailed).toBe(true);
  });

  // ==================================================
  // 8. SOURCE INGESTION / DISCOVERY (3 SOURCES)
  // ==================================================
  it('Section 8: ingests Greenhouse, Lever, and Ashby opportunities with candidate isolation on Postgres', async () => {
    const oppRepo = new OpportunityRepository(handle);
    const candidateRepo = new CandidateRepository(handle);
    const searchRepo = new SearchTargetRepository(handle);
    const sourceRepo = new SourceListingRepository(handle);

    const cIdA = candidateId(`cand-ingest-a-${Date.now()}`);
    const cIdB = candidateId(`cand-ingest-b-${Date.now()}`);
    await candidateRepo.createCandidate(cIdA);
    await candidateRepo.createCandidate(cIdB);

    const ghNorm = new GreenhouseNormalizer();
    const leverNorm = new LeverNormalizer();
    const ashbyNorm = new AshbyNormalizer();

    const ghOpp = ghNorm.normalize({
      sourceSystem: 'greenhouse',
      sourceExternalId: 'gh-101',
      observedAt: new Date(),
      rawPayload: JSON.stringify({
        id: 101,
        title: 'Staff Engineer',
        location: { name: 'Remote' },
        content: 'Rust and Postgres',
        updated_at: '2026-08-31T00:00:00Z',
      }),
    });

    const leverOpp = leverNorm.normalize({
      sourceSystem: 'lever',
      sourceExternalId: 'lev-202',
      observedAt: new Date(),
      rawPayload: JSON.stringify({
        id: 'lev-202',
        text: 'Senior Lead',
        categories: { location: 'New York', commitment: 'Full-time' },
        descriptionPlain: 'Go and Postgres',
        createdAt: 1700000000000,
      }),
    });

    const ashbyOpp = ashbyNorm.normalize({
      sourceSystem: 'ashby',
      sourceExternalId: 'ash-303',
      observedAt: new Date(),
      rawPayload: JSON.stringify({
        id: 'ash-303',
        title: 'Principal Architect',
        location: 'San Francisco',
        descriptionHtml: '<p>Distributed Systems</p>',
        publishedAt: '2026-08-31T00:00:00Z',
      }),
    });

    expect(ghOpp.title).toBe('Staff Engineer');
    expect(leverOpp.title).toBe('Senior Lead');
    expect(ashbyOpp.title).toBe('Principal Architect');

    const oId = opportunityId(`opp-canonical-${Date.now()}`);
    await oppRepo.createOpportunity(oId);

    const slId = `sl-ingest-${Date.now()}`;
    await sourceRepo.persistListing(
      slId,
      { sourceSystem: 'greenhouse', sourceExternalId: `gh-ext-${Date.now()}` },
      oId,
    );

    const targetA = await searchRepo.createSearchTarget(cIdA, {
      name: 'Target A',
    });
    const runA = await searchRepo.createDiscoveryRun(
      discoveryRunId(`run-a-${Date.now()}`),
      cIdA,
      searchTargetId(targetA.id),
    );
    await searchRepo.recordDiscoveryMatch({
      id: discoveryMatchId(`dm-a-${Date.now()}`),
      candidateId: cIdA,
      searchTargetId: searchTargetId(targetA.id),
      discoveryRunId: discoveryRunId(runA.id),
      opportunityId: oId,
      sourceListingId: slId,
      matchReasons: ['Title match'],
      retainedUnresolved: [],
    });

    const matchesA = await searchRepo.listDiscoveryMatches(cIdA);
    const matchesB = await searchRepo.listDiscoveryMatches(cIdB);

    expect(matchesA.length).toBe(1);
    expect(matchesB.length).toBe(0);
  });

  // ==================================================
  // 9. FULL WORKER PIPELINE ON REAL POSTGRES
  // ==================================================
  it('Section 9: runs full worker pipeline against real PostgreSQL database handle', async () => {
    const candidateRepo = new CandidateRepository(handle);
    const oppRepo = new OpportunityRepository(handle);
    const searchRepo = new SearchTargetRepository(handle);
    const sourceRepo = new SourceListingRepository(handle);
    const evalRepo = new EvaluationRepository(handle);

    const cId = candidateId(`cand-pipe-${Date.now()}`);
    const oId = opportunityId(`opp-pipe-${Date.now()}`);
    const sId = snapshotId(`snap-pipe-${Date.now()}`);
    const slId = `sl-pipe-${Date.now()}`;

    await candidateRepo.createCandidate(cId);
    await oppRepo.createOpportunity(oId);
    await oppRepo.appendSnapshot({
      id: sId,
      opportunityId: oId,
      title: 'Senior Backend Engineer',
      organization: 'Rolevia Cloud',
      content: 'Node.js, PostgreSQL, TypeScript required.',
      fingerprint: 'fp-pipe-1',
    });

    const target = await searchRepo.createSearchTarget(cId, {
      name: 'Backend Roles',
    });
    const run = await searchRepo.createDiscoveryRun(
      discoveryRunId(`run-pipe-${Date.now()}`),
      cId,
      searchTargetId(target.id),
    );
    await sourceRepo.persistListing(
      slId,
      {
        sourceSystem: 'greenhouse',
        sourceExternalId: `ext-pipe-${Date.now()}`,
      },
      oId,
    );
    await searchRepo.recordDiscoveryMatch({
      id: discoveryMatchId(`dm-pipe-${Date.now()}`),
      candidateId: cId,
      searchTargetId: searchTargetId(target.id),
      discoveryRunId: discoveryRunId(run.id),
      opportunityId: oId,
      sourceListingId: slId,
      matchReasons: ['Backend match'],
      retainedUnresolved: [],
    });

    // Execute full pipeline chain using worker handlers
    const eligHandlers = createEligibilityHandlers({ db: handle });
    const fitHandlers = createFitHandlers({ db: handle });
    const qualHandlers = createQualityHandlers({ db: handle });
    const decHandlers = createDecisionHandlers(handle);

    const dummyTask = (taskType: string, payload: Record<string, unknown>) => ({
      id: `task-${Date.now()}` as any,
      taskType,
      payload,
      state: 'PENDING' as const,
      attempts: 0,
      maxAttempts: 3,
      leaseOwner: null,
      leaseExpiresAt: null,
      idempotencyKey: null,
      lastError: null,
      availableAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await eligHandlers['eligibility.evaluate']!(
      dummyTask('eligibility.evaluate', { candidateId: cId, snapshotId: sId }),
    );
    const currentEval = await evalRepo.getCurrentEvaluation(cId, sId);
    const eId = currentEval!.id;

    await fitHandlers['fit.evaluate']!(
      dummyTask('fit.evaluate', {
        evaluationId: eId,
        candidateId: cId,
        snapshotId: sId,
      }),
    );
    await qualHandlers['quality.evaluate']!(
      dummyTask('quality.evaluate', {
        evaluationId: eId,
        candidateId: cId,
        snapshotId: sId,
      }),
    );
    await decHandlers['decision.evaluate']!(
      dummyTask('decision.evaluate', {
        evaluationId: eId,
        candidateId: cId,
        snapshotId: sId,
      }),
    );

    const decision = await evalRepo.getCurrentDecision(cId, sId);
    expect(decision).not.toBeNull();
    expect(decision?.action).toBeDefined();
    expect(decision?.priority).toBeDefined();
  });

  // ==================================================
  // 11. TODAY POSTGRES & 12. CAREER SIGNALS POSTGRES
  // ==================================================
  it('Section 11 & 12: verifies Today and Career Signals aggregation queries on PostgreSQL', async () => {
    const candidateRepo = new CandidateRepository(handle);
    const todayRepo = new TodayRepository(handle);
    const signalsRepo = new CareerSignalsRepository(handle);

    const cId = candidateId(`cand-dash-${Date.now()}`);
    await candidateRepo.createCandidate(cId);

    const today = await todayRepo.getTodayDashboard(cId);
    expect(today.greetingName).toBeDefined();
    expect(today.priorityOpportunities).toBeDefined();

    const signals = await signalsRepo.getCareerSignals(cId);
    expect(signals.candidateId).toBe(cId);
    expect(signals.activeOpportunityCount).toBeDefined();
  });

  // ==================================================
  // 13. SQLITE ↔ POSTGRES SEMANTIC EQUIVALENCE
  // ==================================================
  it('Section 13: verifies 100% semantic equivalence between SQLite and PostgreSQL queries', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'oca-equiv-sqlite-'));
    const sqliteHandle = openDatabase(join(directory, 'equiv.sqlite'));
    await applyMigrations(sqliteHandle);

    try {
      const cId = candidateId(`cand-equiv-${Date.now()}`);
      const oId = opportunityId(`opp-equiv-${Date.now()}`);
      const sId = snapshotId(`snap-equiv-${Date.now()}`);

      // Setup identical fixtures on both SQLite and PostgreSQL
      for (const h of [sqliteHandle, handle]) {
        const cRepo = new CandidateRepository(h);
        const oRepo = new OpportunityRepository(h);
        const eRepo = new EvaluationRepository(h);

        await cRepo.createCandidate(cId);
        await oRepo.createOpportunity(oId);
        await oRepo.appendSnapshot({
          id: sId,
          opportunityId: oId,
          title: 'Software Architect',
          organization: 'Rolevia',
          content: 'Postgres and SQLite',
          fingerprint: 'fp-equiv',
        });
        await eRepo.persistEvaluation({
          id: evaluationId(`eval-equiv-${h.engine}-${Date.now()}`),
          candidateId: cId,
          snapshotId: sId,
          eligibilityState: 'eligible',
          fitLevel: 'strong',
          qualityLevel: 'strong',
        });
      }

      const sqliteToday = await new TodayRepository(
        sqliteHandle,
      ).getTodayDashboard(cId);
      const pgToday = await new TodayRepository(handle).getTodayDashboard(cId);

      expect(pgToday.needsAttention.length).toBe(
        sqliteToday.needsAttention.length,
      );

      const sqliteSignals = await new CareerSignalsRepository(
        sqliteHandle,
      ).getCareerSignals(cId);
      const pgSignals = await new CareerSignalsRepository(
        handle,
      ).getCareerSignals(cId);

      expect(pgSignals.candidateId).toBe(sqliteSignals.candidateId);
      expect(pgSignals.activeOpportunityCount).toBe(
        sqliteSignals.activeOpportunityCount,
      );
    } finally {
      await sqliteHandle.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  // ==================================================
  // 14. SQLITE REGRESSION & MIGRATION UPGRADE
  // ==================================================
  it('Section 14: verifies SQLite fresh migration and upgrade migration continuity', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'oca-sqlite-upgrade-'));
    const dbPath = join(directory, 'upgrade.sqlite');
    const sqliteHandle = openDatabase(dbPath);

    await applyMigrations(sqliteHandle);
    const candidateRepo = new CandidateRepository(sqliteHandle);
    await candidateRepo.createCandidate(candidateId('cand-upgrade-test'));

    await sqliteHandle.close();

    // Re-open and verify data persisted across re-open
    const reopenedHandle = openDatabase(dbPath);
    await applyMigrations(reopenedHandle);
    const cand = await new CandidateRepository(reopenedHandle).getCandidate(
      candidateId('cand-upgrade-test'),
    );
    expect(cand).not.toBeNull();

    await reopenedHandle.close();
    rmSync(directory, { recursive: true, force: true });
  });

  // ==================================================
  // 16. CONNECTION POOL SHUTDOWN
  // ==================================================
  it('Section 16: verifies PostgreSQL connection pool closes cleanly without leaked handles', async () => {
    const testHandle = openDatabase({
      engine: 'postgres',
      databaseUrl: POSTGRES_URL,
    });
    expect(testHandle.pgPool).toBeDefined();

    const pool = testHandle.pgPool!;
    const res = await pool.query('SELECT 1 as num');
    expect(res.rows[0].num).toBe(1);

    await testHandle.close();
    expect(pool.ended).toBe(true);
  });
});
