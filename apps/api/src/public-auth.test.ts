import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyMigrations,
  openDatabase,
  type DatabaseHandle,
} from '@oca/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApiApp } from './app.js';
import type { EmailService } from './email-service.js';
import type { OAuthIdentity, OAuthProviderAdapter } from './oauth-provider.js';

describe('Public identity and account recovery', () => {
  let directory: string;
  let database: DatabaseHandle;
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let verificationUrl: string | undefined;
  let resetUrl: string | undefined;
  const identities = new Map<string, OAuthIdentity>();

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'rolevia-public-auth-'));
    database = openDatabase(join(directory, 'auth.sqlite'));
    await applyMigrations(database);
    verificationUrl = undefined;
    resetUrl = undefined;
    identities.clear();
    const emailService: EmailService = {
      sendVerificationEmail: ({ actionUrl }) => {
        verificationUrl = actionUrl;
        return Promise.resolve();
      },
      sendPasswordResetEmail: ({ actionUrl }) => {
        resetUrl = actionUrl;
        return Promise.resolve();
      },
    };
    const provider: OAuthProviderAdapter = {
      authorizationUrl: ({ state, nonce, redirectUri }) => {
        const url = new URL('https://provider.test/authorize');
        url.searchParams.set('state', state);
        url.searchParams.set('nonce', nonce);
        url.searchParams.set('redirect_uri', redirectUri);
        return url.toString();
      },
      exchange: ({ code }) => {
        const identity = identities.get(code);
        if (!identity) throw new Error('Unknown deterministic OAuth code.');
        return Promise.resolve(identity);
      },
    };
    app = await createApiApp({
      config: {
        environment: 'test',
        databaseEngine: 'sqlite',
        databasePath: database.path!,
        migrationMode: 'manual',
        host: '127.0.0.1',
        port: 3000,
        webOrigin: 'https://app.rolevia.test',
        identityMode: 'cloud',
        sessionTtlHours: 24,
      },
      database,
      closeDatabaseOnClose: false,
      logger: false,
      authServices: {
        emailService,
        oauthProviders: { google: provider, apple: provider },
      },
    });
  });

  afterEach(async () => {
    await app.close();
    await database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('requires single-use email verification before password sign-in', async () => {
    const registered = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { origin: 'https://app.rolevia.test' },
      payload: {
        email: 'Person@Example.com',
        password: 'correct horse battery staple',
        transport: 'cookie',
      },
    });
    expect(registered.statusCode).toBe(202);
    expect(registered.headers['set-cookie']).toBeUndefined();
    expect(verificationUrl).toContain('/verify-email?token=');
    const stored = database
      .sqlite!.prepare(
        'select email_verified_at from users where normalized_email = ?',
      )
      .get('person@example.com') as { email_verified_at: number | null };
    expect(stored.email_verified_at).toBeNull();
    const tokenRow = database
      .sqlite!.prepare('select token_hash from auth_action_tokens')
      .get() as { token_hash: string };
    expect(verificationUrl).not.toContain(tokenRow.token_hash);

    const blocked = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'person@example.com',
        password: 'correct horse battery staple',
        transport: 'bearer',
      },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({
      error: { code: 'EMAIL_NOT_VERIFIED' },
    });

    const token = new URL(verificationUrl!).searchParams.get('token');
    const verified = await app.inject({
      method: 'POST',
      url: '/auth/verification/complete',
      headers: { origin: 'https://app.rolevia.test' },
      payload: { token, transport: 'cookie' },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.headers['set-cookie']).toContain('HttpOnly');
    const replay = await app.inject({
      method: 'POST',
      url: '/auth/verification/complete',
      payload: { token, transport: 'bearer' },
    });
    expect(replay.statusCode).toBe(400);
  });

  it('does not create an account when production email delivery is unavailable', async () => {
    await app.close();
    app = await createApiApp({
      config: {
        environment: 'production',
        databaseEngine: 'sqlite',
        databasePath: database.path!,
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

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { origin: 'https://app.rolevia.test' },
      payload: {
        email: 'undeliverable@example.com',
        password: 'correct horse battery staple',
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'EMAIL_DELIVERY_UNAVAILABLE' },
    });
    expect(tableCount('users')).toBe(0);
  });

  it('rejects expired verification and reset tokens and supports verification resend', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'expiry@example.com',
        password: 'correct horse battery staple',
        transport: 'bearer',
      },
    });
    const expiredVerification = new URL(verificationUrl!).searchParams.get(
      'token',
    );
    database.sqlite!.exec(
      "update auth_action_tokens set expires_at = 0, created_at = 0 where purpose = 'EMAIL_VERIFICATION'",
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/verification/complete',
          payload: { token: expiredVerification, transport: 'bearer' },
        })
      ).statusCode,
    ).toBe(400);
    const resent = await app.inject({
      method: 'POST',
      url: '/auth/verification/resend',
      headers: { origin: 'https://app.rolevia.test' },
      payload: { email: 'expiry@example.com' },
    });
    expect(resent.statusCode).toBe(202);
    expect(new URL(verificationUrl!).searchParams.get('token')).not.toBe(
      expiredVerification,
    );
    await registerAndVerifyBearer('reset-expiry@example.com');
    await app.inject({
      method: 'POST',
      url: '/auth/password/forgot',
      headers: { origin: 'https://app.rolevia.test' },
      payload: { email: 'reset-expiry@example.com' },
    });
    const expiredReset = new URL(resetUrl!).searchParams.get('token');
    database.sqlite!.exec(
      "update auth_action_tokens set expires_at = 0 where purpose = 'PASSWORD_RESET'",
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/password/reset',
          headers: { origin: 'https://app.rolevia.test' },
          payload: {
            token: expiredReset,
            password: 'a different durable password',
          },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('keeps recovery enumeration-safe, expires token authority, and revokes sessions', async () => {
    const bearer = await registerAndVerifyBearer('reset@example.com');
    for (const email of ['missing@example.com', 'reset@example.com']) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/password/forgot',
        headers: { origin: 'https://app.rolevia.test' },
        payload: { email },
      });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({
        accepted: true,
        message:
          'If that account can reset its password, an email is on its way.',
      });
    }
    expect(resetUrl).toContain('/reset-password?token=');
    const token = new URL(resetUrl!).searchParams.get('token');
    const changed = await app.inject({
      method: 'POST',
      url: '/auth/password/reset',
      headers: { origin: 'https://app.rolevia.test' },
      payload: { token, password: 'a different durable password' },
    });
    expect(changed.statusCode).toBe(202);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/auth/session',
          headers: { authorization: `Bearer ${bearer}` },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/password/reset',
          headers: { origin: 'https://app.rolevia.test' },
          payload: { token, password: 'yet another durable password' },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('links only verified provider email and treats provider subject as canonical', async () => {
    await registerAndVerifyBearer('linked@example.com');
    identities.set('verified', {
      provider: 'google',
      subject: 'subject-verified',
      email: 'LINKED@example.com',
      emailVerified: true,
    });
    const linked = await completeOAuth('google', 'verified', '/today');
    expect(linked.location).toContain('status=success');
    expect(linked.location).toContain('redirect=%2Ftoday');
    expect(tableCount('users')).toBe(1);
    expect(tableCount('candidates')).toBe(1);
    expect(tableCount('user_identities')).toBe(1);

    identities.set('unverified', {
      provider: 'google',
      subject: 'subject-unverified',
      email: 'linked@example.com',
      emailVerified: false,
    });
    const separate = await completeOAuth(
      'google',
      'unverified',
      '//attacker.test',
    );
    expect(separate.location).toContain('redirect=%2Foverview');
    expect(tableCount('users')).toBe(2);
    expect(tableCount('candidates')).toBe(2);

    identities.set('verified-again', {
      provider: 'google',
      subject: 'subject-verified',
      email: 'changed@example.com',
      emailVerified: true,
    });
    await completeOAuth('google', 'verified-again', '/overview');
    expect(tableCount('users')).toBe(2);
    expect(tableCount('user_identities')).toBe(2);
  });

  it('serializes concurrent first login and rejects mismatched OAuth state/nonce', async () => {
    identities.set('race-a', {
      provider: 'apple',
      subject: 'apple-race-subject',
      email: 'relay@example.com',
      emailVerified: true,
    });
    identities.set('race-b', {
      provider: 'apple',
      subject: 'apple-race-subject',
      email: 'relay@example.com',
      emailVerified: true,
    });
    const results = await Promise.all([
      completeOAuth('apple', 'race-a', '/overview'),
      completeOAuth('apple', 'race-b', '/overview'),
    ]);
    expect(
      results.every((result) => result.location.includes('status=success')),
    ).toBe(true);
    expect(tableCount('users')).toBe(1);
    expect(tableCount('candidates')).toBe(1);
    expect(tableCount('user_identities')).toBe(1);
    expect(tableCount('sessions')).toBe(2);

    const started = await app.inject({
      method: 'GET',
      url: '/auth/oauth/google/start',
    });
    const providerUrl = new URL(started.headers.location!);
    const badState = await app.inject({
      method: 'GET',
      url: `/auth/oauth/google/callback?state=attacker-state&code=race-a`,
      headers: { cookie: String(started.headers['set-cookie']).split(';')[0] },
    });
    expect(badState.headers.location).toContain('status=invalid_request');
    expect(providerUrl.searchParams.get('nonce')).toBeTruthy();
  });

  it('links Google and Apple to the same user when both return the same verified email', async () => {
    const email = 'dual-provider@example.com';
    identities.set('google-dual', {
      provider: 'google',
      subject: 'sub-g-dual',
      email,
      emailVerified: true,
    });
    identities.set('apple-dual', {
      provider: 'apple',
      subject: 'sub-a-dual',
      email: email.toUpperCase(),
      emailVerified: true,
    });

    const gLinked = await completeOAuth('google', 'google-dual', '/overview');
    expect(gLinked.location).toContain('status=success');
    expect(tableCount('users')).toBe(1);
    expect(tableCount('candidates')).toBe(1);
    expect(tableCount('user_identities')).toBe(1);

    const aLinked = await completeOAuth('apple', 'apple-dual', '/overview');
    expect(aLinked.location).toContain('status=success');
    expect(tableCount('users')).toBe(1);
    expect(tableCount('candidates')).toBe(1);
    expect(tableCount('user_identities')).toBe(2);

    // Later password registration attempt for that same email is rejected with 409
    const dupRegister = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `  ${email.toUpperCase()}  `,
        password: 'Password12345!',
      },
    });
    expect(dupRegister.statusCode).toBe(409);
  });

  it('creates distinct identity and candidate when provider provides no email', async () => {
    identities.set('no-email-code', {
      provider: 'google',
      subject: 'sub-no-email',
      emailVerified: false,
    });

    const linked = await completeOAuth('google', 'no-email-code', '/overview');
    expect(linked.location).toContain('status=success');
    expect(tableCount('users')).toBe(1);
    expect(tableCount('candidates')).toBe(1);
    expect(tableCount('user_identities')).toBe(1);
  });

  async function registerAndVerifyBearer(email: string): Promise<string> {
    const registered = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email,
        password: 'correct horse battery staple',
        transport: 'bearer',
      },
    });
    expect(registered.statusCode).toBe(202);
    const token = new URL(verificationUrl!).searchParams.get('token');
    const verified = await app.inject({
      method: 'POST',
      url: '/auth/verification/complete',
      payload: { token, transport: 'bearer' },
    });
    expect(verified.statusCode).toBe(200);
    return verified.json<{ token: string }>().token;
  }

  async function completeOAuth(
    provider: 'google' | 'apple',
    code: string,
    redirect: string,
  ): Promise<{ location: string }> {
    const started = await app.inject({
      method: 'GET',
      url: `/auth/oauth/${provider}/start?redirect=${encodeURIComponent(redirect)}`,
    });
    expect(started.statusCode).toBe(302);
    const providerUrl = new URL(started.headers.location!);
    const cookie = String(started.headers['set-cookie']).split(';')[0];
    const callback = await app.inject({
      method: 'GET',
      url: `/auth/oauth/${provider}/callback?state=${encodeURIComponent(providerUrl.searchParams.get('state')!)}&code=${encodeURIComponent(code)}`,
      headers: { cookie },
    });
    expect(callback.statusCode).toBe(302);
    return { location: callback.headers.location! };
  }

  function tableCount(table: string): number {
    return (
      database
        .sqlite!.prepare(`select count(*) as count from ${table}`)
        .get() as { count: number }
    ).count;
  }
});
