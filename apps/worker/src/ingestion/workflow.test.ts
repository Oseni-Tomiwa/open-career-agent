import { opportunityId } from '@oca/domain';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  databaseIsReady,
  openDatabase,
  type DatabaseHandle,
  OpportunityRepository,
  applyMigrations,
} from '@oca/database';

import { GreenhouseAdapter, GreenhouseNormalizer } from '@oca/sources';
import { createTaskHandlers } from './workflow.js';
import { unlinkSync } from 'node:fs';

const TEST_DB_PATH = 'ingestion-test.sqlite';

const mockGreenhousePayload = {
  jobs: [
    {
      id: 12345,
      absolute_url: 'https://boards.greenhouse.io/test/jobs/12345',
      updated_at: '2026-08-25T17:40:40-04:00',
      title: 'Software Engineer',
      company_name: 'Acme',
      location: { name: 'Remote' },
      content: '<h2>Job</h2><p>Great job</p>',
    },
  ],
};

describe('Greenhouse Ingestion Flow', () => {
  let db: DatabaseHandle;

  beforeEach(async () => {
    try {
      unlinkSync(TEST_DB_PATH);
    } catch {
      /* ignore */
    }
    db = openDatabase(TEST_DB_PATH);
    await applyMigrations(db);
    expect(await databaseIsReady(db)).toBe(true);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(async () => {
    await db.close();
    try {
      unlinkSync(TEST_DB_PATH);
    } catch {
      /* ignore */
    }
    vi.restoreAllMocks();
  });

  describe('ADAPTER', () => {
    it('parses representative payload', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGreenhousePayload),
      } as unknown as Response);

      const adapter = new GreenhouseAdapter();
      const records = [];
      for await (const r of adapter.discover('test')) {
        records.push(r);
      }
      expect(records).toHaveLength(1);
      expect(records[0]?.sourceSystem).toBe('greenhouse');
      expect(records[0]?.sourceExternalId).toBe('12345');
    });

    it('handles HTTP failure', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as unknown as Response);

      const adapter = new GreenhouseAdapter();
      await expect(async () => {
        for await (const _r of adapter.discover('test')) {
          /* empty */
        }
      }).rejects.toThrow(/Greenhouse API returned 500/);
    });

    it('handles malformed response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      } as unknown as Response);

      const adapter = new GreenhouseAdapter();
      await expect(async () => {
        for await (const _r of adapter.discover('test')) {
          /* empty */
        }
      }).rejects.toThrow(/Malformed Greenhouse response/);
    });
  });

  describe('NORMALIZATION', () => {
    it('maps correctly and preserves unknown fields', () => {
      const normalizer = new GreenhouseNormalizer();
      const normalized = normalizer.normalize({
        sourceSystem: 'greenhouse',
        sourceExternalId: '123',
        rawPayload: JSON.stringify(mockGreenhousePayload.jobs[0]),
        observedAt: new Date(),
      });

      expect(normalized.title).toBe('Software Engineer');
      expect(normalized.organization).toBe('Acme');
      expect(normalized.location).toBe('Remote');
      expect(normalized.workModel).toBeUndefined(); // preserves unknown
      expect(normalized.employmentType).toBeUndefined();
    });
  });

  describe('BACKGROUND FLOW & DB PERSISTENCE', () => {
    it('executes adapter, persists SourceRecord, deduplicates, and creates Snapshots', async () => {
      const config = {
        environment: 'test' as const,
        databaseEngine: 'sqlite' as const,
        databasePath: TEST_DB_PATH,
        migrationMode: 'auto' as const,
        pollIntervalMs: 1000,
        leaseDurationMs: 30000,
        greenhouseBoards: ['acme'],
      };
      const handlers = createTaskHandlers({ db, config });
      const handler = handlers['source.greenhouse.discover']!;

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGreenhousePayload),
      } as unknown as Response);

      await handler({
        id: 't_1',
        taskType: 'source.greenhouse.discover',
        payload: {},
        state: 'RUNNING',
        attempts: 1,
        maxAttempts: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
        availableAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        idempotencyKey: null,
        lastError: null,
      });

      const oppRepo = new OpportunityRepository(db);
      const opps = await oppRepo.getOpportunities();
      expect(opps).toHaveLength(1);
      const oppId = opps[0]!.id;

      const snaps = await oppRepo.getSnapshots(opportunityId(oppId));
      expect(snaps).toHaveLength(1);
      expect(snaps[0]!.title).toBe('Software Engineer');

      // Second run with identical payload - no new snapshot
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGreenhousePayload),
      } as unknown as Response);

      await handler({
        id: 't_1',
        taskType: 'source.greenhouse.discover',
        payload: {},
        state: 'RUNNING',
        attempts: 1,
        maxAttempts: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
        availableAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        idempotencyKey: null,
        lastError: null,
      });

      const oppsAfter = await oppRepo.getOpportunities();
      expect(oppsAfter).toHaveLength(1); // Deduplicated Opportunity
      const snapsAfter = await oppRepo.getSnapshots(opportunityId(oppId));
      expect(snapsAfter).toHaveLength(1); // Deduplicated Snapshot

      // Third run with changed payload - new snapshot
      const changedPayload = JSON.parse(
        JSON.stringify(mockGreenhousePayload),
      ) as typeof mockGreenhousePayload;
      changedPayload.jobs[0]!.title = 'Senior Software Engineer';

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(changedPayload),
      } as unknown as Response);

      await handler({
        id: 't_1',
        taskType: 'source.greenhouse.discover',
        payload: {},
        state: 'RUNNING',
        attempts: 1,
        maxAttempts: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
        availableAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        idempotencyKey: null,
        lastError: null,
      });

      const snapsFinal = await oppRepo.getSnapshots(opportunityId(oppId));
      expect(snapsFinal).toHaveLength(2); // New snapshot appended
      expect(snapsFinal[1]!.title).toBe('Senior Software Engineer');
      expect(snapsFinal[0]!.title).toBe('Software Engineer'); // Previous intact
    });
  });
});
