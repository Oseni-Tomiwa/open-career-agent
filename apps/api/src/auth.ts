import {
  createHash,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from 'node:crypto';

import type { ApiConfig } from '@oca/config/server';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  AuthRepository,
  type AuthenticatedPrincipalRecord,
  type DatabaseHandle,
} from '@oca/database';
import {
  ApiErrorEnvelopeSchema,
  AuthResponseSchema,
  AuthCapabilitiesSchema,
  AuthSessionSchema,
  LoginInputSchema,
  LogoutResponseSchema,
  OAuthProviderSchema,
  PasswordResetCompleteInputSchema,
  PasswordResetRequestInputSchema,
  PublicAuthAcceptedSchema,
  RegisterInputSchema,
  ResendVerificationInputSchema,
  VerificationCompleteInputSchema,
} from '@oca/schemas';
import { Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { createAuthRateLimiter } from './rate-limit.js';
import { DevelopmentEmailService, type EmailService } from './email-service.js';
import {
  configuredOAuthProviders,
  type OAuthProviderAdapter,
  type OAuthProviderName,
} from './oauth-provider.js';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const PASSWORD_HASH_PREFIX = `scrypt$v=1$N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P},l=${SCRYPT_KEY_LENGTH}`;
const DUMMY_PASSWORD_HASH = `${PASSWORD_HASH_PREFIX}$cm9sZXZpYS1kdW1teS12MQ$NG2Pv-rGQJ84snEf9VaxeXoPrwfsV8WO3w7i7X4V6njpYN27tOAS23PLqRGrXCF3MzeCCmbrxfgSEVERlWSqQA`;
const COOKIE_NAME = 'rolevia_session';
const OAUTH_COOKIE_NAME = 'rolevia_oauth_attempt';
const SOCIAL_ONLY_PASSWORD_HASH = 'social-only$v=1';
const ACTION_TOKEN_TTL_MS = 30 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const PUBLIC_ROUTES = new Set([
  '/health',
  '/ready',
  '/openapi.json',
  '/auth/login',
  '/auth/register',
  '/auth/capabilities',
  '/auth/verification/resend',
  '/auth/verification/complete',
  '/auth/password/forgot',
  '/auth/password/reset',
  '/auth/oauth/:provider/start',
  '/auth/oauth/:provider/callback',
]);
const principals = new WeakMap<FastifyRequest, AuthenticatedPrincipalRecord>();

function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePasswordKey(password, salt);
  return `${PASSWORD_HASH_PREFIX}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algorithm, version, parameters, saltEncoded, hashEncoded, extra] =
    stored.split('$');
  if (
    algorithm !== 'scrypt' ||
    version !== 'v=1' ||
    parameters !==
      `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P},l=${SCRYPT_KEY_LENGTH}` ||
    !saltEncoded ||
    !hashEncoded ||
    extra
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltEncoded, 'base64url');
    const expected = Buffer.from(hashEncoded, 'base64url');
    if (
      salt.length !== 16 ||
      expected.length !== SCRYPT_KEY_LENGTH ||
      salt.toString('base64url') !== saltEncoded ||
      expected.toString('base64url') !== hashEncoded
    ) {
      return false;
    }
    const actual = await derivePasswordKey(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function parseCookies(
  header: string | undefined,
): Readonly<Record<string, string>> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const separator = part.indexOf('=');
      if (separator < 1) return [];
      try {
        return [
          [
            decodeURIComponent(part.slice(0, separator).trim()),
            decodeURIComponent(part.slice(separator + 1).trim()),
          ],
        ];
      } catch {
        return [];
      }
    }),
  );
}

function readSessionToken(request: FastifyRequest): {
  readonly token: string | null;
  readonly source: 'bearer' | 'cookie' | null;
} {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    if (token.startsWith('ck_')) return { token: null, source: null };
    return { token: token || null, source: token ? 'bearer' : null };
  }
  const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
  if (token?.startsWith('br_')) return { token: null, source: null };
  return { token: token ?? null, source: token ? 'cookie' : null };
}

function serializeSession(principal: AuthenticatedPrincipalRecord) {
  return {
    user: {
      id: principal.userId,
      email: principal.email,
      emailVerified: principal.emailVerified,
    },
    candidateIds: [...principal.candidateIds],
    primaryCandidateId: principal.primaryCandidateId,
    expiresAt: principal.expiresAt.toISOString(),
  };
}

function safeInternalRedirect(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    return '/overview';
  }
  return value;
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}${local.length > 1 ? '***' : ''}@${domain}`;
}

function oauthCookie(state: string, nonce: string, secure: boolean): string {
  return [
    `${OAUTH_COOKIE_NAME}=${encodeURIComponent(`${state}.${nonce}`)}`,
    'Path=/auth/oauth',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=600',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

function clearOAuthCookie(secure: boolean): string {
  return [
    `${OAUTH_COOKIE_NAME}=`,
    'Path=/auth/oauth',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export interface AuthBoundaryServices {
  readonly emailService?: EmailService;
  readonly oauthProviders?: Readonly<
    Partial<Record<OAuthProviderName, OAuthProviderAdapter>>
  >;
}

function cookieValue(
  token: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

function requestCandidateId(request: FastifyRequest): string | null {
  const params = request.params as { candidateId?: unknown } | undefined;
  if (typeof params?.candidateId === 'string') return params.candidateId;
  const query = request.query as { candidateId?: unknown } | undefined;
  if (typeof query?.candidateId === 'string') return query.candidateId;
  const match = request.raw.url?.match(
    /\/candidates\/(candidate_[a-zA-Z0-9_-]+)/,
  );
  return match?.[1] ?? null;
}

function authError(
  request: FastifyRequest,
  statusCode: 401 | 403,
  code: 'UNAUTHORIZED' | 'FORBIDDEN',
) {
  return {
    statusCode,
    body: {
      error: {
        code,
        message:
          code === 'UNAUTHORIZED'
            ? 'Authentication is required.'
            : 'Access to this candidate is forbidden.',
        requestId: request.id,
      },
    },
  };
}

export function getAuthenticatedPrincipal(
  request: FastifyRequest,
): AuthenticatedPrincipalRecord | null {
  return principals.get(request) ?? null;
}

export function registerAuthBoundary(
  app: FastifyInstance,
  config: ApiConfig,
  database: DatabaseHandle,
  services: AuthBoundaryServices = {},
): void {
  const typedApp = app.withTypeProvider<TypeBoxTypeProvider>();
  const repository = new AuthRepository(database);
  const emailService =
    services.emailService ??
    (config.environment === 'development' || config.environment === 'test'
      ? new DevelopmentEmailService()
      : undefined);
  const oauthProviders =
    services.oauthProviders ?? configuredOAuthProviders(config);
  const oauthCallbackBaseUrl =
    config.oauthCallbackBaseUrl ?? `http://${config.host}:${config.port}`;

  app.addHook('onRequest', async (request, reply) => {
    const route = request.routeOptions.url;
    if (route && PUBLIC_ROUTES.has(route)) return;

    if (config.identityMode !== 'cloud' && route?.startsWith('/auth/')) {
      const error = authError(request, 403, 'FORBIDDEN');
      await reply.status(error.statusCode).send(error.body);
      return;
    }

    if (config.identityMode === 'cloud') {
      const credential = readSessionToken(request);
      let principal: AuthenticatedPrincipalRecord | null = null;
      try {
        principal = credential.token
          ? await repository.findActiveSession(hashToken(credential.token))
          : null;
      } catch {
        // Session lookup error
      }
      if (!principal) {
        const error = authError(request, 401, 'UNAUTHORIZED');
        await reply.status(error.statusCode).send(error.body);
        return;
      }
      principals.set(request, principal);

      if (
        credential.source === 'cookie' &&
        request.headers.origin !== config.webOrigin
      ) {
        const isStateChanging = !['GET', 'HEAD', 'OPTIONS'].includes(
          request.method,
        );
        const error = authError(
          request,
          isStateChanging ? 403 : 401,
          isStateChanging ? 'FORBIDDEN' : 'UNAUTHORIZED',
        );
        await reply.status(error.statusCode).send(error.body);
        return;
      }

      const requestedCandidate = requestCandidateId(request);
      if (
        requestedCandidate &&
        !(await repository.userCanAccessCandidate(
          principal.userId,
          requestedCandidate,
        ))
      ) {
        const error = authError(request, 403, 'FORBIDDEN');
        await reply.status(error.statusCode).send(error.body);
        return;
      }
      return;
    }

    if (config.environment === 'test') return;
    const requestedCandidate = requestCandidateId(request);
    if (
      requestedCandidate &&
      config.trustedCandidateId &&
      requestedCandidate !== config.trustedCandidateId
    ) {
      const error = authError(request, 403, 'FORBIDDEN');
      await reply.status(error.statusCode).send(error.body);
    }
  });

  function newSessionMaterial(transport: 'bearer' | 'cookie' = 'bearer') {
    const prefix = transport === 'cookie' ? 'ck_' : 'br_';
    const token = `${prefix}${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(
      Date.now() + config.sessionTtlHours * 60 * 60 * 1000,
    );
    return { token, tokenHash: hashToken(token), expiresAt };
  }

  async function createSession(
    userId: string,
    transport: 'bearer' | 'cookie' = 'bearer',
  ) {
    const material = newSessionMaterial(transport);
    await repository.createSession({
      userId,
      tokenHash: material.tokenHash,
      expiresAt: material.expiresAt,
    });
    const principal = await repository.findActiveSession(material.tokenHash);
    if (!principal) throw new Error('Newly created session could not be read');
    return { token: material.token, principal };
  }

  function assertAllowedOrigin(
    request: FastifyRequest,
    transport: 'cookie' | 'bearer' | undefined,
  ): boolean {
    if (transport === 'bearer' || transport === undefined) return true;
    return request.headers.origin === config.webOrigin;
  }

  const rateLimit =
    config.environment === 'test'
      ? async (_req: FastifyRequest, _reply: FastifyReply) => {}
      : createAuthRateLimiter({ maxRequests: 10, windowMs: 60_000 });

  function accepted(
    message: string,
    email?: string,
    developmentActionUrl?: string,
  ) {
    return {
      accepted: true as const,
      message,
      ...(email ? { emailHint: maskEmail(email) } : {}),
      ...(config.environment !== 'production' && developmentActionUrl
        ? { developmentActionUrl }
        : {}),
    };
  }

  async function deliverVerification(
    email: string,
    actionUrl: string,
    expiresAt: Date,
  ): Promise<boolean> {
    if (!emailService) return false;
    await emailService.sendVerificationEmail({ email, actionUrl, expiresAt });
    return true;
  }

  async function deliverReset(
    email: string,
    actionUrl: string,
    expiresAt: Date,
  ): Promise<boolean> {
    if (!emailService) return false;
    await emailService.sendPasswordResetEmail({ email, actionUrl, expiresAt });
    return true;
  }

  typedApp.get(
    '/auth/capabilities',
    {
      schema: {
        tags: ['auth'],
        response: { 200: AuthCapabilitiesSchema },
      },
    },
    () => ({
      providers: {
        google: Boolean(oauthProviders.google),
        apple: Boolean(oauthProviders.apple),
      },
      developmentEmailDelivery:
        config.environment === 'development' && Boolean(emailService),
    }),
  );

  typedApp.post(
    '/auth/register',
    {
      preHandler: rateLimit,
      schema: {
        tags: ['auth'],
        body: RegisterInputSchema,
        response: {
          202: PublicAuthAcceptedSchema,
          403: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
          503: ApiErrorEnvelopeSchema,
          429: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      if (
        config.identityMode !== 'cloud' ||
        !assertAllowedOrigin(request, request.body.transport)
      ) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Registration is not available for this request.',
            requestId: request.id,
          },
        });
      }
      if (!emailService) {
        return reply.status(503).send({
          error: {
            code: 'EMAIL_DELIVERY_UNAVAILABLE',
            message: 'Verification email delivery is not configured.',
            requestId: request.id,
          },
        });
      }
      try {
        const passwordHash = await hashPassword(request.body.password);
        const rawToken = randomBytes(32).toString('base64url');
        const expiresAt = new Date(Date.now() + ACTION_TOKEN_TTL_MS);
        await repository.createAccount({
          email: request.body.email,
          passwordHash,
          emailVerifiedAt: null,
          actionToken: {
            id: `aat_${randomBytes(16).toString('hex')}`,
            purpose: 'EMAIL_VERIFICATION',
            tokenHash: hashToken(rawToken),
            expiresAt,
          },
        });
        const actionUrl = `${config.webOrigin}/verify-email?token=${encodeURIComponent(rawToken)}`;
        if (
          !(await deliverVerification(request.body.email, actionUrl, expiresAt))
        ) {
          return reply.status(503).send({
            error: {
              code: 'EMAIL_DELIVERY_UNAVAILABLE',
              message: 'Verification email delivery is not configured.',
              requestId: request.id,
            },
          });
        }
        return reply
          .status(202)
          .send(
            accepted(
              'Check your email to verify your account.',
              request.body.email,
              actionUrl,
            ),
          );
      } catch {
        return reply.status(409).send({
          error: {
            code: 'ACCOUNT_NOT_CREATED',
            message: 'The account could not be created.',
            requestId: request.id,
          },
        });
      }
    },
  );

  typedApp.post(
    '/auth/login',
    {
      preHandler: rateLimit,
      schema: {
        tags: ['auth'],
        body: LoginInputSchema,
        response: {
          200: AuthResponseSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          429: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      if (
        config.identityMode !== 'cloud' ||
        !assertAllowedOrigin(request, request.body.transport)
      ) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Sign-in is not available for this request.',
            requestId: request.id,
          },
        });
      }
      const user = await repository.findUserByEmail(request.body.email);
      const valid = await verifyPassword(
        request.body.password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      );
      if (!user || !valid) {
        return reply.status(401).send({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'The email or password is invalid.',
            requestId: request.id,
          },
        });
      }
      if (!user.emailVerifiedAt) {
        return reply.status(403).send({
          error: {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Verify your email before signing in.',
            requestId: request.id,
          },
        });
      }
      const session = await createSession(
        user.id,
        request.body.transport ?? 'bearer',
      );
      if (request.body.transport !== 'bearer') {
        reply.header(
          'set-cookie',
          cookieValue(
            session.token,
            config.sessionTtlHours * 60 * 60,
            config.environment === 'production',
          ),
        );
      }
      return {
        session: serializeSession(session.principal),
        ...(request.body.transport === 'bearer'
          ? { token: session.token }
          : {}),
      };
    },
  );

  typedApp.post(
    '/auth/verification/resend',
    {
      preHandler: rateLimit,
      schema: {
        tags: ['auth'],
        body: ResendVerificationInputSchema,
        response: {
          202: PublicAuthAcceptedSchema,
          403: ApiErrorEnvelopeSchema,
          429: ApiErrorEnvelopeSchema,
          503: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      if (
        config.identityMode !== 'cloud' ||
        request.headers.origin !== config.webOrigin
      ) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Verification is not available for this request.',
            requestId: request.id,
          },
        });
      }
      const generic = accepted(
        'If that account needs verification, a new email is on its way.',
      );
      const user = await repository.findUserByEmail(request.body.email);
      if (
        !user ||
        user.emailVerifiedAt ||
        user.passwordHash === SOCIAL_ONLY_PASSWORD_HASH
      ) {
        return reply.status(202).send(generic);
      }
      const latest = await repository.latestActionTokenCreatedAt(
        user.id,
        'EMAIL_VERIFICATION',
      );
      if (latest && Date.now() - latest.getTime() < RESEND_COOLDOWN_MS) {
        return reply.status(202).send(generic);
      }
      const rawToken = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + ACTION_TOKEN_TTL_MS);
      await repository.issueActionToken({
        userId: user.id,
        purpose: 'EMAIL_VERIFICATION',
        tokenHash: hashToken(rawToken),
        expiresAt,
      });
      const actionUrl = `${config.webOrigin}/verify-email?token=${encodeURIComponent(rawToken)}`;
      if (!(await deliverVerification(user.email, actionUrl, expiresAt))) {
        return reply.status(503).send({
          error: {
            code: 'EMAIL_DELIVERY_UNAVAILABLE',
            message: 'Verification email delivery is not configured.',
            requestId: request.id,
          },
        });
      }
      return reply
        .status(202)
        .send(
          accepted(
            'If that account needs verification, a new email is on its way.',
            undefined,
            actionUrl,
          ),
        );
    },
  );

  typedApp.post(
    '/auth/verification/complete',
    {
      preHandler: rateLimit,
      schema: {
        tags: ['auth'],
        body: VerificationCompleteInputSchema,
        response: {
          200: AuthResponseSchema,
          400: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          429: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      if (
        config.identityMode !== 'cloud' ||
        !assertAllowedOrigin(request, request.body.transport)
      ) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Verification is not available for this request.',
            requestId: request.id,
          },
        });
      }
      const verified = await repository.consumeEmailVerification(
        hashToken(request.body.token),
      );
      if (!verified) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_OR_EXPIRED_TOKEN',
            message: 'This verification link is invalid or has expired.',
            requestId: request.id,
          },
        });
      }
      const transport = request.body.transport ?? 'bearer';
      const session = await createSession(verified.userId, transport);
      if (transport === 'cookie') {
        reply.header(
          'set-cookie',
          cookieValue(
            session.token,
            config.sessionTtlHours * 60 * 60,
            config.environment === 'production',
          ),
        );
      }
      return {
        session: serializeSession(session.principal),
        ...(transport === 'bearer' ? { token: session.token } : {}),
      };
    },
  );

  typedApp.post(
    '/auth/password/forgot',
    {
      preHandler: rateLimit,
      schema: {
        tags: ['auth'],
        body: PasswordResetRequestInputSchema,
        response: {
          202: PublicAuthAcceptedSchema,
          403: ApiErrorEnvelopeSchema,
          429: ApiErrorEnvelopeSchema,
          503: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      if (
        config.identityMode !== 'cloud' ||
        request.headers.origin !== config.webOrigin
      ) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Password recovery is not available for this request.',
            requestId: request.id,
          },
        });
      }
      const generic = accepted(
        'If that account can reset its password, an email is on its way.',
      );
      const user = await repository.findUserByEmail(request.body.email);
      if (
        !user ||
        !user.emailVerifiedAt ||
        user.passwordHash === SOCIAL_ONLY_PASSWORD_HASH
      ) {
        return reply.status(202).send(generic);
      }
      const latest = await repository.latestActionTokenCreatedAt(
        user.id,
        'PASSWORD_RESET',
      );
      if (latest && Date.now() - latest.getTime() < RESEND_COOLDOWN_MS) {
        return reply.status(202).send(generic);
      }
      const rawToken = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await repository.issueActionToken({
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        tokenHash: hashToken(rawToken),
        expiresAt,
      });
      const actionUrl = `${config.webOrigin}/reset-password?token=${encodeURIComponent(rawToken)}`;
      if (!(await deliverReset(user.email, actionUrl, expiresAt))) {
        return reply.status(503).send({
          error: {
            code: 'EMAIL_DELIVERY_UNAVAILABLE',
            message: 'Password reset email delivery is not configured.',
            requestId: request.id,
          },
        });
      }
      return reply
        .status(202)
        .send(
          accepted(
            'If that account can reset its password, an email is on its way.',
            undefined,
            actionUrl,
          ),
        );
    },
  );

  typedApp.post(
    '/auth/password/reset',
    {
      preHandler: rateLimit,
      schema: {
        tags: ['auth'],
        body: PasswordResetCompleteInputSchema,
        response: {
          202: PublicAuthAcceptedSchema,
          400: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          429: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      if (
        config.identityMode !== 'cloud' ||
        request.headers.origin !== config.webOrigin
      ) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Password recovery is not available for this request.',
            requestId: request.id,
          },
        });
      }
      const changed = await repository.consumePasswordReset({
        tokenHash: hashToken(request.body.token),
        passwordHash: await hashPassword(request.body.password),
      });
      if (!changed) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_OR_EXPIRED_TOKEN',
            message: 'This password reset link is invalid or has expired.',
            requestId: request.id,
          },
        });
      }
      return reply
        .status(202)
        .send(accepted('Your password has been changed. Sign in to continue.'));
    },
  );

  const oauthParams = Type.Object({ provider: OAuthProviderSchema });
  const oauthStartQuery = Type.Object({
    redirect: Type.Optional(Type.String({ maxLength: 1024 })),
  });
  const oauthCallbackQuery = Type.Object({
    state: Type.Optional(Type.String({ maxLength: 256 })),
    code: Type.Optional(Type.String({ maxLength: 4096 })),
    error: Type.Optional(Type.String({ maxLength: 256 })),
  });

  typedApp.get(
    '/auth/oauth/:provider/start',
    {
      preHandler: rateLimit,
      schema: {
        tags: ['auth'],
        params: oauthParams,
        querystring: oauthStartQuery,
      },
    },
    async (request, reply) => {
      if (config.identityMode !== 'cloud') {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Social sign-in is not available.',
            requestId: request.id,
          },
        });
      }
      const adapter = oauthProviders[request.params.provider];
      if (!adapter) {
        return reply.redirect(
          `${config.webOrigin}/auth/callback?status=provider_unavailable&provider=${request.params.provider}`,
        );
      }
      const state = randomBytes(32).toString('base64url');
      const nonce = randomBytes(32).toString('base64url');
      await repository.createOAuthAttempt({
        provider: request.params.provider,
        stateHash: hashToken(state),
        nonceHash: hashToken(nonce),
        redirectPath: safeInternalRedirect(request.query.redirect),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      const redirectUri = `${oauthCallbackBaseUrl}/auth/oauth/${request.params.provider}/callback`;
      reply.header(
        'set-cookie',
        oauthCookie(state, nonce, config.environment === 'production'),
      );
      return reply.redirect(
        adapter.authorizationUrl({ state, nonce, redirectUri }),
      );
    },
  );

  typedApp.get(
    '/auth/oauth/:provider/callback',
    {
      preHandler: rateLimit,
      schema: {
        tags: ['auth'],
        params: oauthParams,
        querystring: oauthCallbackQuery,
      },
    },
    async (request, reply) => {
      const secure = config.environment === 'production';
      const fail = (status: string) => {
        reply.header('set-cookie', clearOAuthCookie(secure));
        return reply.redirect(
          `${config.webOrigin}/auth/callback?status=${encodeURIComponent(status)}&provider=${request.params.provider}`,
        );
      };
      if (request.query.error) return fail('cancelled');
      const adapter = oauthProviders[request.params.provider];
      const stored = parseCookies(request.headers.cookie)[OAUTH_COOKIE_NAME];
      const separator = stored?.indexOf('.') ?? -1;
      const cookieState = separator > 0 ? stored!.slice(0, separator) : '';
      const nonce = separator > 0 ? stored!.slice(separator + 1) : '';
      if (
        !adapter ||
        !request.query.state ||
        !request.query.code ||
        !cookieState ||
        !nonce ||
        request.query.state !== cookieState
      ) {
        return fail('invalid_request');
      }
      const attempt = await repository.consumeOAuthAttempt({
        provider: request.params.provider,
        stateHash: hashToken(request.query.state),
      });
      if (!attempt || attempt.nonceHash !== hashToken(nonce)) {
        return fail('invalid_state');
      }
      try {
        const identity = await adapter.exchange({
          code: request.query.code,
          nonce,
          redirectUri: `${oauthCallbackBaseUrl}/auth/oauth/${request.params.provider}/callback`,
        });
        const material = newSessionMaterial('cookie');
        const authenticate = () =>
          repository.authenticateOAuthIdentity({
            provider: request.params.provider,
            providerSubject: identity.subject,
            ...(identity.email ? { providerEmail: identity.email } : {}),
            providerEmailVerified: identity.emailVerified,
            passwordHash: SOCIAL_ONLY_PASSWORD_HASH,
            session: {
              tokenHash: material.tokenHash,
              expiresAt: material.expiresAt,
            },
          });
        try {
          await authenticate();
        } catch {
          // A concurrent first callback may have won the provider-subject key.
          await authenticate();
        }
        reply.header('set-cookie', [
          cookieValue(material.token, config.sessionTtlHours * 60 * 60, secure),
          clearOAuthCookie(secure),
        ]);
        return reply.redirect(
          `${config.webOrigin}/auth/callback?status=success&redirect=${encodeURIComponent(attempt.redirectPath)}`,
        );
      } catch {
        return fail('provider_error');
      }
    },
  );

  typedApp.get(
    '/auth/session',
    {
      schema: {
        tags: ['auth'],
        response: {
          200: AuthSessionSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
        },
      },
    },
    (request) => serializeSession(getAuthenticatedPrincipal(request)!),
  );

  typedApp.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        response: {
          200: LogoutResponseSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const principal = getAuthenticatedPrincipal(request)!;
      const revoked = await repository.revokeSession(principal.sessionId);
      reply.header(
        'set-cookie',
        cookieValue('', 0, config.environment === 'production'),
      );
      return { revoked };
    },
  );
}
