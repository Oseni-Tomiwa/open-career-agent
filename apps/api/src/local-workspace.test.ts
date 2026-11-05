import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CandidateRepository,
  openDatabase,
  applyMigrations,
  type DatabaseHandle,
} from '@oca/database';
import { candidateId, claimId } from '@oca/domain';
import { parseApiConfig, type ApiConfig } from '@oca/config/server';
import { guardLocalWorkspace } from './local-workspace.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createApiApp } from './app.js';

const headers = { host: '127.0.0.1:3000', origin: 'http://localhost:5173' };
const base: ApiConfig = {
  environment: 'development',
  databaseEngine: 'sqlite',
  databasePath: ':memory:',
  migrationMode: 'manual',
  identityMode: 'development',
  host: '127.0.0.1',
  port: 3000,
  webOrigin: headers.origin,
  trustedCandidateId: 'personal',
  sessionTtlHours: 168,
  localWorkspaceSetupEnabled: true,
};
describe('guarded local workspace', () => {
  let db: DatabaseHandle;
  const apps: Awaited<ReturnType<typeof createApiApp>>[] = [];
  beforeEach(async () => {
    db = openDatabase(':memory:');
    await applyMigrations(db);
  });
  afterEach(async () => {
    for (const app of apps.splice(0)) await app.close();
    await db.close();
  });
  async function app(config: Partial<ApiConfig> = {}) {
    const value = await createApiApp({
      config: { ...base, ...config },
      database: db,
      closeDatabaseOnClose: false,
    });
    apps.push(value);
    return value;
  }
  afterEach(() => vi.restoreAllMocks());
  const count = () =>
    db.sqlite!.prepare('select count(*) as total from candidates').get()!.total;
  it('requires explicit strict server opt-in', () => {
    expect(parseApiConfig({}).localWorkspaceSetupEnabled).toBe(false);
    expect(
      parseApiConfig({ LOCAL_WORKSPACE_SETUP_ENABLED: 'true' })
        .localWorkspaceSetupEnabled,
    ).toBe(true);
    expect(() =>
      parseApiConfig({ LOCAL_WORKSPACE_SETUP_ENABLED: 'yes' }),
    ).toThrow();
  });
  it('reads without creating; creates only the server candidate and replays unchanged', async () => {
    const api = await app();
    const status = await api.inject({
      method: 'GET',
      url: '/local-workspace',
      headers,
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({ mode: 'local', state: 'SETUP_REQUIRED' });
    expect(count()).toBe(0);
    const replies = await Promise.all(
      Array.from({ length: 5 }, () =>
        api.inject({
          method: 'POST',
          url: '/local-workspace',
          headers,
          payload: {},
        }),
      ),
    );
    for (const result of replies) {
      expect(result.statusCode).toBe(200);
      expect(result.json()).toEqual(replies[0]!.json());
      expect(result.headers['cache-control']).toBe('no-store');
    }
    expect(replies[0]!.json().candidate.id).toBe('personal');
    expect(count()).toBe(1);
    expect(
      (
        await api.inject({ method: 'GET', url: '/local-workspace', headers })
      ).json(),
    ).toEqual(replies[0]!.json());
    for (const table of [
      'candidate_claims',
      'users',
      'sessions',
      'user_candidates',
      'background_tasks',
    ])
      expect(
        db.sqlite!.prepare(`select count(*) as total from ${table}`).get()!
          .total,
      ).toBe(0);
  });
  it.each([
    { localWorkspaceSetupEnabled: false },
    { localWorkspaceSetupEnabled: undefined },
    { environment: 'production' },
    { identityMode: 'cloud' },
    { host: '0.0.0.0' },
    { webOrigin: 'https://remote.test' },
  ] as Partial<ApiConfig>[])(
    'disables local storage access for deployment %j',
    async (config) => {
      const read = vi.spyOn(CandidateRepository.prototype, 'getCandidate');
      const write = vi.spyOn(CandidateRepository.prototype, 'ensureCandidate');
      const api = await app(config);
      for (const method of ['GET', 'POST'] as const)
        expect(
          (
            await api.inject({
              method,
              url: '/local-workspace',
              headers,
              ...(method === 'POST' ? { payload: {} } : {}),
            })
          ).statusCode,
        ).toBe(404);
      expect(count()).toBe(0);
      expect(read).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    },
  );
  it.each([
    { origin: 'http://evil.test' },
    { origin: 'null' },
    { origin: undefined },
    { host: 'evil.test:3000' },
    { host: '127.0.0.1:3001' },
    { forwarded: 'for=127.0.0.1' },
    { via: 'proxy' },
    { 'x-forwarded-for': '127.0.0.1' },
    { 'x-forwarded-host': 'localhost:3000' },
  ])(
    'rejects forged or missing headers %j before creating identity',
    async (changed) => {
      const api = await app();
      const result = await api.inject({
        method: 'POST',
        url: '/local-workspace',
        headers: Object.fromEntries(
          Object.entries({ ...headers, ...changed }).filter(
            ([, value]) => value !== undefined,
          ),
        ),
        payload: {},
      });
      expect(result.statusCode).toBe(403);
      expect(count()).toBe(0);
    },
  );
  it('rejects remote sockets regardless of forwarded loopback claims', async () => {
    const api = await app();
    expect(
      (
        await api.inject({
          method: 'POST',
          url: '/local-workspace',
          headers,
          remoteAddress: '203.0.113.4',
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(count()).toBe(0);
  });
  it('rejects identity injection before default schema stripping', async () => {
    const api = await app();
    for (const payload of [{ candidateId: 'another' }, { name: 'x' }, [], null])
      expect(
        (
          await api.inject({
            method: 'POST',
            url: '/local-workspace',
            headers: { ...headers, 'content-type': 'application/json' },
            payload: JSON.stringify(payload),
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await api.inject({
          method: 'GET',
          url: '/local-workspace?candidateId=another',
          headers,
        })
      ).statusCode,
    ).toBe(400);
    expect(count()).toBe(0);
  });
  it('supports IPv6 loopback, rejects wrong read origin, and does not mutate on preflight or HEAD', async () => {
    const api = await app({ host: '::1' });
    expect(
      (
        await api.inject({
          method: 'GET',
          url: '/local-workspace',
          headers: { host: '[::1]:3000' },
          remoteAddress: '::1',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await api.inject({
          method: 'GET',
          url: '/local-workspace',
          headers: { ...headers, origin: 'http://evil.test' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await api.inject({
          method: 'OPTIONS',
          url: '/local-workspace',
          headers: {
            ...headers,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'content-type',
          },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await api.inject({ method: 'HEAD', url: '/local-workspace', headers }))
        .statusCode,
    ).toBe(403);
    expect(count()).toBe(0);
  });
  it('replays after a committed insert whose read confirmation failed', async () => {
    const api = await app();
    vi.spyOn(
      CandidateRepository.prototype,
      'getCandidate',
    ).mockRejectedValueOnce(new Error('private storage detail'));
    const first = await api.inject({
      method: 'POST',
      url: '/local-workspace',
      headers,
      payload: {},
    });
    expect(first.statusCode).toBe(503);
    expect(first.body).not.toContain('private storage');
    expect(count()).toBe(1);
    const persisted = db.sqlite!.prepare('select * from candidates').get();
    expect(
      (
        await api.inject({
          method: 'POST',
          url: '/local-workspace',
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(db.sqlite!.prepare('select * from candidates').get()).toEqual(
      persisted,
    );
  });
  it('reopens populated and unrelated candidates without changing their records', async () => {
    const repository = new CandidateRepository(db);
    await repository.createCandidate(candidateId('personal'), 1000);
    await repository.createCandidate(candidateId('unrelated'), 2000);
    await repository.addClaim(
      {
        id: claimId('existing'),
        candidateId: candidateId('personal'),
        kind: 'skill',
        value: 'Retained skill',
        state: 'UNKNOWN',
      },
      3000,
    );
    const records = db.sqlite!.prepare('select * from candidate_claims').all();
    const candidates = db
      .sqlite!.prepare('select * from candidates order by id')
      .all();
    const api = await app();
    expect(
      (
        await api.inject({ method: 'GET', url: '/local-workspace', headers })
      ).json(),
    ).toMatchObject({
      state: 'READY',
      candidate: { id: 'personal', createdAt: '1970-01-01T00:00:01.000Z' },
    });
    expect(
      (
        await api.inject({
          method: 'POST',
          url: '/local-workspace',
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(db.sqlite!.prepare('select * from candidate_claims').all()).toEqual(
      records,
    );
    expect(
      db.sqlite!.prepare('select * from candidates order by id').all(),
    ).toEqual(candidates);
  });
  it('keeps ordinary candidate ownership enforcement in development', async () => {
    const api = await app();
    expect(
      (
        await api.inject({
          method: 'GET',
          url: '/candidates/another/profile',
          headers,
        })
      ).statusCode,
    ).toBe(403);
  });
  it('reports unavailable storage as failure rather than first run', async () => {
    const broken = openDatabase(':memory:');
    try {
      const api = await createApiApp({
        config: base,
        database: broken,
        closeDatabaseOnClose: false,
      });
      apps.push(api);
      const result = await api.inject({
        method: 'GET',
        url: '/local-workspace',
        headers,
      });
      expect(result.statusCode).toBe(503);
      expect(result.json().error.code).toBe('LOCAL_WORKSPACE_UNAVAILABLE');
      expect(result.body).not.toContain('sqlite');
    } finally {
      await broken.close();
    }
  });
});

describe('raw local transport guard', () => {
  it.each(
    [
      ['Host', '127.0.0.1:3000', 'Host', 'localhost:3000'],
      ['Host', '127.0.0.1:3000,evil.test:3000'],
      ['Host', '127.0.0.1:3000/'],
      ['Host', 'user@localhost:3000'],
    ].map((rawHeaders) => ({ rawHeaders })),
  )(
    'rejects duplicate or malformed Host before any handler: %j',
    async ({ rawHeaders }) => {
      const request = {
        method: 'POST',
        id: 'r',
        headers: { host: rawHeaders[1], origin: base.webOrigin },
        raw: { rawHeaders, socket: { remoteAddress: '127.0.0.1' } },
      } as unknown as FastifyRequest;
      const status = vi.fn().mockReturnThis();
      const reply = {
        header: vi.fn().mockReturnThis(),
        status,
        send: vi.fn().mockReturnThis(),
      } as unknown as FastifyReply;
      await guardLocalWorkspace(request, reply, base);
      expect(status).toHaveBeenCalledWith(403);
    },
  );
});
