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
    await applyMigrations(database);
    app = await createApiApp({
      config: {
        environment: 'production',
        databaseEngine: 'sqlite',
        databasePath: database.path ?? join(directory, 'cloud.sqlite'),
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
    await database.close();
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
    const result = database
      .sqlite!.prepare(`select count(*) as count from ${table}`)
      .get() as { count: number };
    return result.count;
  }

  it('rolls back User, Candidate, grant, and session when any registration step fails', async () => {
    for (const [table, label] of [
      ['candidates', 'candidate'],
      ['user_candidates', 'grant'],
      ['sessions', 'session'],
    ] as const) {
      database.sqlite!.exec(`
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
      database.sqlite!.exec(`drop trigger force_${label}_failure`);
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
    const stored = database
      .sqlite!.prepare(
        'select email, normalized_email, password_hash from users',
      )
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
      database
        .sqlite!.prepare('update users set password_hash = ? where id = ?')
        .run(malformed, account.session.user.id);
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'hash@example.com',
          password: 'correct horse battery staple',
        },
      });
      expect(response.statusCode).toBe(401);
    }

    const hugePassword = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'huge@example.com',
        password: 'a'.repeat(10000),
      },
    });
    expect(hugePassword.statusCode).toBe(400);
  });

  it('binds session security strictly per authentication transport', async () => {
    const bearerAccount = await registerBearer('bearer-transport@example.com');
    const cookieRegistration = await register(
      'cookie-transport@example.com',
      'cookie',
    );
    expect(cookieRegistration.statusCode).toBe(201);
    const cookieHeader = cookieRegistration.headers['set-cookie'];
    expect(cookieHeader).toBeDefined();

    const bearerWithCookieHeader = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { cookie: cookieHeader as string },
    });
    expect(bearerWithCookieHeader.statusCode).toBe(401);

    const cookieSession = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: {
        cookie: cookieHeader as string,
        origin: 'https://app.rolevia.test',
      },
    });
    expect(cookieSession.statusCode).toBe(200);

    const stolenCookieViaBearer = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: {
        authorization: `Bearer ${cookieRegistration.json<RegisteredAccount>().token}`,
      },
    });
    expect(stolenCookieViaBearer.statusCode).toBe(401);

    const stolenBearerViaCookie = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: {
        cookie: `rolevia_session=${bearerAccount.token}`,
        origin: 'https://app.rolevia.test',
      },
    });
    expect(stolenBearerViaCookie.statusCode).toBe(401);
  });

  it('rejects state-changing cookie requests without expected origin', async () => {
    const registration = await register('csrf@example.com', 'cookie');
    const cookie = registration.headers['set-cookie'] as string;

    for (const badOrigin of [
      undefined,
      'https://evil.example.com',
      'http://app.rolevia.test',
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          cookie,
          ...(badOrigin ? { origin: badOrigin } : {}),
        },
      });
      expect(response.statusCode).toBe(403);
    }
  });

  it('revokes sessions across transports and handles expired leases deterministically', async () => {
    const bearerAccount = await registerBearer('revoke-bearer@example.com');
    const cookieReg = await register('revoke-cookie@example.com', 'cookie');
    const cookie = cookieReg.headers['set-cookie'] as string;

    const bearerLogout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${bearerAccount.token}` },
    });
    expect(bearerLogout.statusCode).toBe(200);

    const revokedBearerSession = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { authorization: `Bearer ${bearerAccount.token}` },
    });
    expect(revokedBearerSession.statusCode).toBe(401);

    const cookieLogout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie, origin: 'https://app.rolevia.test' },
    });
    expect(cookieLogout.statusCode).toBe(200);

    const revokedCookieSession = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { cookie, origin: 'https://app.rolevia.test' },
    });
    expect(revokedCookieSession.statusCode).toBe(401);

    const expiredAccount = await registerBearer('expired@example.com');
    database
      .sqlite!.prepare('update sessions set expires_at = ? where user_id = ?')
      .run(0, expiredAccount.session.user.id);

    const expiredSession = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { authorization: `Bearer ${expiredAccount.token}` },
    });
    expect(expiredSession.statusCode).toBe(401);
  });

  it('prevents authorization bypass across candidate routes', async () => {
    const owner = await registerBearer('owner@example.com');
    const attacker = await registerBearer('attacker@example.com');
    const ownerCandidateId = owner.session.primaryCandidateId;
    const attackerAuth = `Bearer ${attacker.token}`;

    for (const [method, path] of [
      ['GET', `/candidates/${ownerCandidateId}`],
      ['PUT', `/candidates/${ownerCandidateId}/profile`],
      ['GET', `/candidates/${ownerCandidateId}/claims`],
      ['POST', `/candidates/${ownerCandidateId}/claims`],
      ['GET', `/candidates/${ownerCandidateId}/search-targets`],
      ['POST', `/candidates/${ownerCandidateId}/search-targets`],
      ['GET', `/candidates/${ownerCandidateId}/today`],
      ['GET', `/candidates/${ownerCandidateId}/applications`],
      ['POST', `/candidates/${ownerCandidateId}/applications`],
    ] as const) {
      const response = await app.inject({
        method,
        url: path,
        headers: { authorization: attackerAuth },
      });
      expect(response.statusCode, `${method} ${path}`).toBe(403);
    }
  });

  it('rejects cross-candidate task payload injection on background task endpoints', async () => {
    const account = await registerBearer('task-injection@example.com');
    const authorization = `Bearer ${account.token}`;

    const created = await app.inject({
      method: 'POST',
      url: `/candidates/${account.session.primaryCandidateId}/search-targets`,
      headers: { authorization },
      payload: {
        name: 'Target',
        sources: [
          { sourceSystem: 'greenhouse', boardId: 'security-test-board' },
        ],
      },
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
    const task = database
      .sqlite!.prepare('select task_type, payload from background_tasks')
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
    await opportunities.createOpportunity(opportunity);
    await opportunities.appendSnapshot({
      id: snapshot,
      opportunityId: opportunity,
      title: 'Shared role',
      organization: 'Shared company',
      content: 'Shared canonical content',
      fingerprint: 'shared-fingerprint',
    });
    await recordMatch(database, candidateA, opportunity, 'a');
    await recordMatch(database, candidateB, opportunity, 'b');
    const evaluations = new EvaluationRepository(database);
    for (const [suffix, candidate, level, privateText] of [
      ['a', candidateA, 'strong', 'private-A-evidence'],
      ['b', candidateB, 'weak', 'private-B-evidence'],
    ] as const) {
      const evaluation = evaluationId(`evaluation-privacy-${suffix}`);
      await evaluations.persistEvaluation({
        id: evaluation,
        candidateId: candidate,
        snapshotId: snapshot,
        eligibilityState: suffix === 'a' ? 'eligible' : 'ineligible',
        eligibilityInputFingerprint: `eligibility-${suffix}`,
      });
      await evaluations.persistFitResult({
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
      await evaluations.persistQualityResult({
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
        await evaluations.persistDecision({
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
      database
        .sqlite!.prepare(
          `insert into user_candidates
           (id, user_id, candidate_id, relationship, is_primary, created_at)
           values ('missing-user', 'missing', ?, 'OWNER', 0, 1)`,
        )
        .run(account.session.primaryCandidateId),
    ).toThrow();
    expect(() =>
      database
        .sqlite!.prepare(
          `insert into user_candidates
           (id, user_id, candidate_id, relationship, is_primary, created_at)
           values ('missing-candidate', ?, 'missing', 'OWNER', 0, 1)`,
        )
        .run(userId),
    ).toThrow();
    expect(() =>
      database
        .sqlite!.prepare(
          `insert into user_candidates
           (id, user_id, candidate_id, relationship, is_primary, created_at)
           values ('duplicate', ?, ?, 'OWNER', 0, 1)`,
        )
        .run(userId, account.session.primaryCandidateId),
    ).toThrow();
    database
      .sqlite!.prepare(
        'insert into candidates (id, created_at, updated_at) values (?, 1, 1)',
      )
      .run('second-candidate');
    expect(() =>
      database
        .sqlite!.prepare(
          `insert into user_candidates
           (id, user_id, candidate_id, relationship, is_primary, created_at)
           values ('second-primary', ?, 'second-candidate', 'OWNER', 1, 1)`,
        )
        .run(userId),
    ).toThrow();
    expect(() =>
      database
        .sqlite!.prepare(
          `insert into sessions
           (id, user_id, token_hash, expires_at, created_at, last_seen_at)
           values ('missing-session-user', 'missing', 'hash', 2, 1, 1)`,
        )
        .run(),
    ).toThrow();
    expect(() =>
      database.sqlite!.prepare('delete from users where id = ?').run(userId),
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
    database.sqlite!.exec(`
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
    database.sqlite!.exec('drop trigger force_private_repository_error');
    await database.close();

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
    expect(authFailure.statusCode).toBe(401);
    expect(authFailure.body).not.toContain(rawHash);
  });
});

async function recordMatch(
  database: DatabaseHandle,
  candidate: ReturnType<typeof candidateId>,
  opportunity: ReturnType<typeof opportunityId>,
  suffix: string,
) {
  const source = new SourceListingRepository(database);
  await source.persistListing(
    `listing-privacy-${suffix}`,
    { sourceSystem: 'greenhouse', sourceExternalId: `external-${suffix}` },
    opportunity,
  );
  const search = new SearchTargetRepository(database);
  const target = await search.createSearchTarget(candidate, {
    name: `Privacy target ${suffix}`,
  });
  const run = await search.createDiscoveryRun(
    discoveryRunId(`run-privacy-${suffix}`),
    candidate,
    searchTargetId(target.id),
  );
  await search.recordDiscoveryMatch({
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
