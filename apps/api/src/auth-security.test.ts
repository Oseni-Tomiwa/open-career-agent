import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyMigrations,
  EvaluationRepository,
  openDatabase,
  OpportunityRepository,
  SearchTargetRepository,
  SourceListingRepository,
  type DatabaseHandle,
} from '@oca/database';
import {
  candidateId,
  decisionId,
  discoveryMatchId,
  discoveryRunId,
  evaluationId,
  evidenceId,
  findingId,
  opportunityId,
  searchTargetId,
  snapshotId,
} from '@oca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { API_LOG_REDACTION_PATHS, createApiApp } from './app.js';

interface RegisteredAccount {
  readonly token: string;
  readonly session: {
    readonly user: { readonly id: string; readonly email: string };
    readonly primaryCandidateId: string;
  };
}

describe('Cloud authentication adversarial security', () => {
  let directory: string;
  let database: DatabaseHandle;
  let app: Awaited<ReturnType<typeof createApiApp>>;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-auth-security-'));
    database = openDatabase(join(directory, 'cloud.sqlite'));
    applyMigrations(database);
    app = await createApiApp({
      config: {
        environment: 'production',
        databasePath: database.path,
        migrationMode: 'manual',
        host: '127.0.0.1',
        port: 3000,
        webOrigin: 'https://app.rolevia.test',
        identityMode: 'cloud',
        sessionTtlHours: 24,
      },
      database,
      logger: false,
    });
  });

  afterEach(async () => {
    await app.close();
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function register(
    email: string,
    transport: 'bearer' | 'cookie' = 'bearer',
  ) {
    return app.inject({
      method: 'POST',
      url: '/auth/register',
      ...(transport === 'cookie'
        ? { headers: { origin: 'https://app.rolevia.test' } }
        : {}),
      payload: {
        email,
        password: 'correct horse battery staple',
        transport,
      },
    });
  }

  async function registerBearer(email: string): Promise<RegisteredAccount> {
    const response = await register(email);
    expect(response.statusCode).toBe(201);
    return response.json<RegisteredAccount>();
  }

  function tableCount(table: string): number {
    const result = database.sqlite
      .prepare(`select count(*) as count from ${table}`)
      .get() as { count: number };
    return result.count;
  }

  it('rolls back User, Candidate, grant, and session when any registration step fails', async () => {
    for (const [table, label] of [
      ['candidates', 'candidate'],
      ['user_candidates', 'grant'],
      ['sessions', 'session'],
    ] as const) {
      database.sqlite.exec(`
        create trigger force_${label}_failure
        before insert on ${table}
        begin
          select raise(abort, 'forced ${label} failure');
        end;
      `);
      const response = await register(`${label}@example.com`);
      expect(response.statusCode).toBe(409);
      for (const identityTable of [
        'users',
        'candidates',
        'user_candidates',
        'sessions',
      ]) {
        expect(tableCount(identityTable), identityTable).toBe(0);
      }
      database.sqlite.exec(`drop trigger force_${label}_failure`);
    }
  });

  it('uses database uniqueness to serialize normalized duplicate registrations', async () => {
    const attempts = await Promise.all(
      [
        'User@Example.com',
        'user@example.com',
        ' user@example.com ',
        'USER@example.com',
        'user@EXAMPLE.com',
        '  User@Example.com  ',
      ].map((email) => register(email)),
    );
    expect(
      attempts.filter((response) => response.statusCode === 201),
    ).toHaveLength(1);
    expect(
      attempts.filter((response) => response.statusCode === 409),
    ).toHaveLength(5);
    expect(tableCount('users')).toBe(1);
    expect(tableCount('candidates')).toBe(1);
    expect(tableCount('user_candidates')).toBe(1);
    expect(tableCount('sessions')).toBe(1);
    const stored = database.sqlite
      .prepare('select email, normalized_email, password_hash from users')
      .get() as {
      email: string;
      normalized_email: string;
      password_hash: string;
    };
    expect(stored.email.trim().toLowerCase()).toBe('user@example.com');
    expect(stored.normalized_email).toBe('user@example.com');
    expect(stored.password_hash).toMatch(
      /^scrypt\$v=1\$N=16384,r=8,p=1,l=64\$[^$]+\$[^$]+$/,
    );
    expect(stored.password_hash).not.toContain('correct horse');
    for (const response of attempts) {
      expect(response.body).not.toContain('correct horse');
      expect(response.body).not.toContain(stored.password_hash);
    }
  });

  it('fails malformed password hashes safely and bounds password input', async () => {
    const account = await registerBearer('hash@example.com');
    for (const malformed of [
      'not-a-password-hash',
      'scrypt$v=999$N=1,r=1,p=1,l=999999$bad$bad',
      `scrypt$v=1$N=16384,r=8,p=1,l=64$${'a'.repeat(10000)}$${'b'.repeat(10000)}`,
    ]) {
      database.sqlite
        .prepare('update users set password_hash = ? where id = ?')
        .run(malformed, account.session.user.id);
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'hash@example.com',
          password: 'correct horse battery staple',
          transport: 'bearer',
        },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: { code: 'INVALID_CREDENTIALS' },
      });
    }

    const oversized = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'hash@example.com',
        password: 'x'.repeat(10_000),
        transport: 'bearer',
      },
    });
    expect(oversized.statusCode).toBe(400);
  });

  it('keeps invalid-login responses identical and creates fresh sessions on every login', async () => {
    await registerBearer('login@example.com');
    const failures = [];
    const durations = [];
    for (const email of ['login@example.com', 'missing@example.com']) {
      const startedAt = performance.now();
      failures.push(
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email,
            password: 'incorrect password',
            transport: 'bearer',
          },
        }),
      );
      durations.push(performance.now() - startedAt);
    }
    expect(failures[0]!.statusCode).toBe(401);
    expect(failures[1]!.statusCode).toBe(401);
    expect(
      failures[0]!.json<{ error: { code: string; message: string } }>().error,
    ).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'The email or password is invalid.',
    });
    expect(
      failures[1]!.json<{ error: { code: string; message: string } }>().error,
    ).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'The email or password is invalid.',
    });
    expect(Math.min(...durations)).toBeGreaterThan(5);
    expect(Math.max(...durations) / Math.min(...durations)).toBeLessThan(5);

    const logins = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        app.inject({
          method: 'POST',
          url: '/auth/login',
          ...(index === 0
            ? { headers: { cookie: 'rolevia_session=attacker-fixed-token' } }
            : {}),
          payload: {
            email: 'login@example.com',
            password: 'correct horse battery staple',
            transport: 'bearer',
          },
        }),
      ),
    );
    const tokens = logins.map(
      (response) => response.json<{ token: string }>().token,
    );
    expect(logins.every((response) => response.statusCode === 200)).toBe(true);
    expect(new Set(tokens).size).toBe(tokens.length);
    expect(tokens).not.toContain('attacker-fixed-token');
    expect(tableCount('sessions')).toBe(6);
  });

  it('uses explicit bearer precedence when bearer and cookie identify different users', async () => {
    const accountA = await registerBearer('precedence-a@example.com');
    const accountB = await registerBearer('precedence-b@example.com');
    const headers = {
      authorization: `Bearer ${accountB.token}`,
      cookie: `rolevia_session=${accountA.token}`,
    };
    expect(Buffer.from(accountA.token, 'base64url')).toHaveLength(32);
    expect(Buffer.from(accountB.token, 'base64url')).toHaveLength(32);

    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/candidates/${accountB.session.primaryCandidateId}/profile`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/candidates/${accountA.session.primaryCandidateId}/profile`,
          headers,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/auth/session',
          headers: { authorization: 'Bearer unknown-session-token' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/auth/session',
          headers: { cookie: 'rolevia_session=%E0%A4%A' },
        })
      ).statusCode,
    ).toBe(401);

    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/logout',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/auth/session',
          headers: { authorization: `Bearer ${accountB.token}` },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/auth/session',
          headers: { cookie: `rolevia_session=${accountA.token}` },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('issues secure production cookies and applies exact-Origin CSRF checks', async () => {
    const registration = await register('cookie@example.com', 'cookie');
    const cookie = registration.headers['set-cookie'];
    expect(registration.statusCode).toBe(201);
    expect(registration.json<{ token?: string }>().token).toBeUndefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=86400');
    const candidate =
      registration.json<RegisteredAccount>().session.primaryCandidateId;

    for (const origin of [
      undefined,
      'https://attacker.example',
      'https://app.rolevia.test.attacker.example',
      'https://sub.app.rolevia.test',
      'http://app.rolevia.test',
      'https://app.rolevia.test:444',
      'not an origin',
      'https://app.rolevia.test, https://attacker.example',
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: `/candidates/${candidate}/claims`,
        headers: {
          cookie,
          ...(origin ? { origin } : {}),
        },
        payload: { kind: 'skill', value: 'Denied', state: 'UNKNOWN' },
      });
      expect(response.statusCode, origin ?? 'missing origin').toBe(403);
    }
    const allowed = await app.inject({
      method: 'POST',
      url: `/candidates/${candidate}/claims`,
      headers: { cookie, origin: 'https://app.rolevia.test' },
      payload: { kind: 'skill', value: 'Allowed', state: 'UNKNOWN' },
    });
    expect(allowed.statusCode).toBe(201);

    const native = await registerBearer('native@example.com');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/candidates/${native.session.primaryCandidateId}/claims`,
          headers: { authorization: `Bearer ${native.token}` },
          payload: { kind: 'skill', value: 'Native', state: 'UNKNOWN' },
        })
      ).statusCode,
    ).toBe(201);
  });

  it('emits CORS headers only for the exact configured credentialed origin', async () => {
    const allowed = await app.inject({
      method: 'OPTIONS',
      url: '/auth/session',
      headers: {
        origin: 'https://app.rolevia.test',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://app.rolevia.test',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(allowed.headers['access-control-allow-methods']).toContain('PATCH');
    expect(allowed.headers['access-control-allow-headers']).toContain(
      'authorization',
    );
    expect(allowed.headers['access-control-allow-origin']).not.toBe('*');

    for (const origin of [undefined, 'https://attacker.example']) {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/auth/session',
        headers: {
          ...(origin ? { origin } : {}),
          'access-control-request-method': 'GET',
        },
      });
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('keeps the complete HTTP route inventory explicit at the authorization boundary', async () => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(response.statusCode).toBe(200);
    const document = response.json<{
      paths: Record<string, Record<string, unknown>>;
    }>();
    const actual = Object.fromEntries(
      Object.entries(document.paths).map(([path, operations]) => [
        path,
        Object.keys(operations).sort(),
      ]),
    );
    expect(actual).toEqual({
      '/health': ['get'],
      '/ready': ['get'],
      '/auth/register': ['post'],
      '/auth/login': ['post'],
      '/auth/session': ['get'],
      '/auth/logout': ['post'],
      '/candidates/{candidateId}/profile': ['get'],
      '/candidates/{candidateId}/claims': ['post'],
      '/candidates/{candidateId}/claims/{claimId}': ['patch'],
      '/candidates/{candidateId}/claims/{claimId}/evidence': ['post'],
      '/candidates/{candidateId}/search-targets': ['get', 'post'],
      '/candidates/{candidateId}/search-targets/{targetId}': [
        'delete',
        'get',
        'patch',
      ],
      '/candidates/{candidateId}/search-targets/{targetId}/run': ['post'],
      '/candidates/{candidateId}/discovery-runs': ['get'],
      '/candidates/{candidateId}/today': ['get'],
      '/candidates/{candidateId}/career-signals': ['get'],
      '/candidates/{candidateId}/applications': ['get', 'post'],
      '/candidates/{candidateId}/applications/{applicationId}': [
        'get',
        'patch',
      ],
      '/candidates/{candidateId}/applications/{applicationId}/events': [
        'get',
        'post',
      ],
      '/opportunities': ['get'],
      '/opportunities/{id}': ['get'],
    });
  });

  it('denies Candidate substitution across every read and mutation category', async () => {
    const accountA = await registerBearer('routes-a@example.com');
    const accountB = await registerBearer('routes-b@example.com');
    const foreign = accountB.session.primaryCandidateId;
    const authorization = `Bearer ${accountA.token}`;
    const reads = [
      `/candidates/${foreign}/profile`,
      `/candidates/${foreign}/search-targets`,
      `/candidates/${foreign}/search-targets/target-x`,
      `/candidates/${foreign}/discovery-runs`,
      `/candidates/${foreign}/today`,
      `/candidates/${foreign}/career-signals`,
      `/candidates/${foreign}/applications`,
      `/candidates/${foreign}/applications/application-x`,
      `/candidates/${foreign}/applications/application-x/events`,
      `/opportunities?candidateId=${foreign}`,
      `/opportunities/opportunity-x?candidateId=${foreign}`,
    ];
    for (const url of reads) {
      expect(
        (
          await app.inject({
            method: 'GET',
            url,
            headers: { authorization },
          })
        ).statusCode,
        url,
      ).toBe(403);
    }

    const mutations = [
      {
        method: 'POST',
        url: `/candidates/${foreign}/claims`,
        payload: { kind: 'skill', value: 'x', state: 'UNKNOWN' },
      },
      {
        method: 'PATCH',
        url: `/candidates/${foreign}/claims/claim-x`,
        payload: { value: 'x' },
      },
      {
        method: 'POST',
        url: `/candidates/${foreign}/claims/claim-x/evidence`,
        payload: {
          evidence: {
            evidenceType: 'manual',
            excerpt: 'x',
            state: 'unreviewed',
          },
        },
      },
      {
        method: 'POST',
        url: `/candidates/${foreign}/search-targets`,
        payload: { name: 'x' },
      },
      {
        method: 'PATCH',
        url: `/candidates/${foreign}/search-targets/target-x`,
        payload: { name: 'x' },
      },
      {
        method: 'DELETE',
        url: `/candidates/${foreign}/search-targets/target-x`,
      },
      {
        method: 'POST',
        url: `/candidates/${foreign}/search-targets/target-x/run`,
      },
      {
        method: 'POST',
        url: `/candidates/${foreign}/applications`,
        payload: { opportunityId: 'opportunity-x' },
      },
      {
        method: 'PATCH',
        url: `/candidates/${foreign}/applications/application-x`,
        payload: {
          status: 'Applied',
          expectedUpdatedAt: '2026-08-31T00:00:00.000Z',
        },
      },
      {
        method: 'POST',
        url: `/candidates/${foreign}/applications/application-x/events`,
        payload: { eventType: 'candidate_activity', detail: 'x' },
      },
    ] as const;
    for (const mutation of mutations) {
      expect(
        (
          await app.inject({
            method: mutation.method,
            url: mutation.url,
            headers: { authorization },
            ...('payload' in mutation ? { payload: mutation.payload } : {}),
          })
        ).statusCode,
        mutation.url,
      ).toBe(403);
    }

    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/candidates/${accountA.session.primaryCandidateId}/applications/missing`,
          headers: { authorization },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('exposes only the fixed candidate-owned discovery enqueue operation', async () => {
    const account = await registerBearer('worker-boundary@example.com');
    const authorization = `Bearer ${account.token}`;
    const created = await app.inject({
      method: 'POST',
      url: `/candidates/${account.session.primaryCandidateId}/search-targets`,
      headers: { authorization },
      payload: { name: 'Authorized target' },
    });
    expect(created.statusCode).toBe(201);
    const target = created.json<{ id: string }>();
    const triggered = await app.inject({
      method: 'POST',
      url: `/candidates/${account.session.primaryCandidateId}/search-targets/${target.id}/run`,
      headers: { authorization },
      payload: {
        taskType: 'arbitrary.admin.task',
        candidateId: 'foreign-candidate',
        snapshotId: 'attacker-snapshot',
      },
    });
    expect(triggered.statusCode).toBe(202);
    const task = database.sqlite
      .prepare('select task_type, payload from background_tasks')
      .get() as { task_type: string; payload: string };
    expect(task.task_type).toBe('discovery.run');
    expect(JSON.parse(task.payload)).toMatchObject({
      candidateId: account.session.primaryCandidateId,
      searchTargetId: target.id,
    });
    expect(task.payload).not.toContain('foreign-candidate');
    expect(task.payload).not.toContain('attacker-snapshot');
  });

  it('keeps per-Candidate intelligence out of shared Opportunity responses', async () => {
    const accountA = await registerBearer('privacy-a@example.com');
    const accountB = await registerBearer('privacy-b@example.com');
    const candidateA = candidateId(accountA.session.primaryCandidateId);
    const candidateB = candidateId(accountB.session.primaryCandidateId);
    const opportunity = opportunityId('opportunity-shared-privacy');
    const snapshot = snapshotId('snapshot-shared-privacy');
    const opportunities = new OpportunityRepository(database);
    opportunities.createOpportunity(opportunity);
    opportunities.appendSnapshot({
      id: snapshot,
      opportunityId: opportunity,
      title: 'Shared role',
      organization: 'Shared company',
      content: 'Shared canonical content',
      fingerprint: 'shared-fingerprint',
    });
    recordMatch(database, candidateA, opportunity, 'a');
    recordMatch(database, candidateB, opportunity, 'b');
    const evaluations = new EvaluationRepository(database);
    for (const [suffix, candidate, level, privateText] of [
      ['a', candidateA, 'strong', 'private-A-evidence'],
      ['b', candidateB, 'weak', 'private-B-evidence'],
    ] as const) {
      const evaluation = evaluationId(`evaluation-privacy-${suffix}`);
      evaluations.persistEvaluation({
        id: evaluation,
        candidateId: candidate,
        snapshotId: snapshot,
        eligibilityState: suffix === 'a' ? 'eligible' : 'ineligible',
        eligibilityInputFingerprint: `eligibility-${suffix}`,
      });
      evaluations.persistFitResult({
        evaluationId: evaluation,
        fit: {
          level,
          engineVersion: 'fit-v1',
          inputFingerprint: `input-${suffix}`,
          summary: privateText,
        },
        findings: [
          {
            id: findingId(`finding-privacy-${suffix}`),
            dimensionKey: `skill:${suffix}`,
            label: `private-${suffix}`,
            state: suffix === 'a' ? 'STRONG_MATCH' : 'GAP',
            summary: privateText,
            confidence: 'high',
            modality: 'required',
            requirementText: privateText,
            explanation: privateText,
            opportunityEvidence: {
              id: evidenceId(`evidence-privacy-${suffix}`),
              evidenceType: 'opportunity-requirement',
              sourceReference: `private-source-${suffix}`,
              excerpt: privateText,
              state: 'source-verified',
            },
            candidateEvidenceIds: [],
          },
        ],
      });
      evaluations.persistQualityResult({
        evaluationId: evaluation,
        quality: {
          level: suffix === 'a' ? 'strong' : 'risk',
          engineVersion: 'quality-v1',
          inputFingerprint: `quality-${suffix}`,
          summary: `private-${suffix}-quality`,
          evaluatedAt: new Date('2026-08-31T00:00:00.000Z'),
          freshnessBucket: 'recent',
        },
        findings: [],
      });
      expect(
        evaluations.persistDecision({
          id: decisionId(`decision-privacy-${suffix}`),
          evaluationId: evaluation,
          candidateId: candidate,
          snapshotId: snapshot,
          priority: suffix === 'a' ? 'high-priority' : 'blocked',
          action: suffix === 'a' ? 'apply' : 'do_not_apply',
          explanation: `private-${suffix}-decision`,
          engineVersion: 'decision-v1',
          inputFingerprint: `decision-${suffix}`,
          eligibilityInputFingerprint: `eligibility-${suffix}`,
          fitInputFingerprint: `input-${suffix}`,
          qualityInputFingerprint: `quality-${suffix}`,
          reasonCodes: [],
          reasonFindingIds: [],
          evaluatedAt: new Date('2026-08-31T00:00:00.000Z'),
        }),
      ).toBe(true);
    }

    const canonical = await app.inject({
      method: 'GET',
      url: `/opportunities/${opportunity}`,
      headers: { authorization: `Bearer ${accountA.token}` },
    });
    expect(canonical.statusCode).toBe(200);
    expect(canonical.body).not.toContain('private-A');
    expect(canonical.body).not.toContain('private-B');

    const ownA = await app.inject({
      method: 'GET',
      url: `/opportunities/${opportunity}?candidateId=${candidateA}`,
      headers: { authorization: `Bearer ${accountA.token}` },
    });
    expect(ownA.statusCode).toBe(200);
    expect(ownA.body).toContain('private-A-evidence');
    expect(ownA.body).toContain('private-a-quality');
    expect(ownA.body).toContain('private-a-decision');
    expect(ownA.body).not.toContain('private-B-evidence');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/opportunities/${opportunity}?candidateId=${candidateB}`,
          headers: { authorization: `Bearer ${accountA.token}` },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('enforces ownership/session foreign keys and one primary Candidate per User', async () => {
    const account = await registerBearer('constraints@example.com');
    const userId = account.session.user.id;
    expect(() =>
      database.sqlite
        .prepare(
          `insert into user_candidates
           (id, user_id, candidate_id, relationship, is_primary, created_at)
           values ('missing-user', 'missing', ?, 'OWNER', 0, 1)`,
        )
        .run(account.session.primaryCandidateId),
    ).toThrow();
    expect(() =>
      database.sqlite
        .prepare(
          `insert into user_candidates
           (id, user_id, candidate_id, relationship, is_primary, created_at)
           values ('missing-candidate', ?, 'missing', 'OWNER', 0, 1)`,
        )
        .run(userId),
    ).toThrow();
    expect(() =>
      database.sqlite
        .prepare(
          `insert into user_candidates
           (id, user_id, candidate_id, relationship, is_primary, created_at)
           values ('duplicate', ?, ?, 'OWNER', 0, 1)`,
        )
        .run(userId, account.session.primaryCandidateId),
    ).toThrow();
    database.sqlite
      .prepare(
        'insert into candidates (id, created_at, updated_at) values (?, 1, 1)',
      )
      .run('second-candidate');
    expect(() =>
      database.sqlite
        .prepare(
          `insert into user_candidates
           (id, user_id, candidate_id, relationship, is_primary, created_at)
           values ('second-primary', ?, 'second-candidate', 'OWNER', 1, 1)`,
        )
        .run(userId),
    ).toThrow();
    expect(() =>
      database.sqlite
        .prepare(
          `insert into sessions
           (id, user_id, token_hash, expires_at, created_at, last_seen_at)
           values ('missing-session-user', 'missing', 'hash', 2, 1, 1)`,
        )
        .run(),
    ).toThrow();
    expect(() =>
      database.sqlite.prepare('delete from users where id = ?').run(userId),
    ).toThrow();
  });

  it('sanitizes readiness, auth failures, and configures sensitive log redaction', async () => {
    const account = await registerBearer('sanitize@example.com');
    const rawHash = createHash('sha256')
      .update(account.token, 'utf8')
      .digest('hex');
    expect(API_LOG_REDACTION_PATHS).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'res.headers["set-cookie"]',
        '*.passwordHash',
        '*.tokenHash',
      ]),
    );
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.body).not.toContain(directory);
    expect(health.body).not.toContain(account.token);
    database.sqlite.exec(`
      create trigger force_private_repository_error
      before insert on candidate_claims
      begin
        select raise(abort, '/private/cloud.sqlite SELECT password_hash token_hash');
      end;
    `);
    const repositoryFailure = await app.inject({
      method: 'POST',
      url: `/candidates/${account.session.primaryCandidateId}/claims`,
      headers: { authorization: `Bearer ${account.token}` },
      payload: { kind: 'skill', value: 'secret payload', state: 'UNKNOWN' },
    });
    expect(repositoryFailure.statusCode).toBe(500);
    for (const secret of [
      '/private/cloud.sqlite',
      'password_hash',
      'token_hash',
      'secret payload',
    ]) {
      expect(repositoryFailure.body).not.toContain(secret);
    }
    database.sqlite.exec('drop trigger force_private_repository_error');
    database.close();

    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({
      status: 'not_ready',
      service: { name: 'api', version: '0.0.0' },
      resources: { database: 'not_ready' },
    });
    const authFailure = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { authorization: `Bearer ${account.token}` },
    });
    expect(authFailure.statusCode).toBe(500);
    for (const secret of [directory, account.token, rawHash, 'select']) {
      expect(authFailure.body.toLowerCase()).not.toContain(
        secret.toLowerCase(),
      );
      expect(ready.body.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });
});

function recordMatch(
  database: DatabaseHandle,
  candidate: ReturnType<typeof candidateId>,
  opportunity: ReturnType<typeof opportunityId>,
  suffix: string,
) {
  const source = new SourceListingRepository(database);
  source.persistListing(
    `listing-privacy-${suffix}`,
    { sourceSystem: 'greenhouse', sourceExternalId: `external-${suffix}` },
    opportunity,
  );
  const search = new SearchTargetRepository(database);
  const target = search.createSearchTarget(candidate, {
    name: `Privacy target ${suffix}`,
  });
  const run = search.createDiscoveryRun(
    discoveryRunId(`run-privacy-${suffix}`),
    candidate,
    searchTargetId(target.id),
  );
  search.recordDiscoveryMatch({
    id: discoveryMatchId(`match-privacy-${suffix}`),
    candidateId: candidate,
    searchTargetId: searchTargetId(target.id),
    discoveryRunId: discoveryRunId(run.id),
    opportunityId: opportunity,
    sourceListingId: `listing-privacy-${suffix}`,
    matchReasons: [`private-match-${suffix}`],
    retainedUnresolved: [`private-unresolved-${suffix}`],
  });
}
