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
  AuthSessionSchema,
  LoginInputSchema,
  LogoutResponseSchema,
  RegisterInputSchema,
} from '@oca/schemas';
import type { FastifyInstance, FastifyRequest } from 'fastify';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const PASSWORD_HASH_PREFIX = `scrypt$v=1$N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P},l=${SCRYPT_KEY_LENGTH}`;
const DUMMY_PASSWORD_HASH = `${PASSWORD_HASH_PREFIX}$cm9sZXZpYS1kdW1teS12MQ$NG2Pv-rGQJ84snEf9VaxeXoPrwfsV8WO3w7i7X4V6njpYN27tOAS23PLqRGrXCF3MzeCCmbrxfgSEVERlWSqQA`;
const COOKIE_NAME = 'rolevia_session';
const PUBLIC_ROUTES = new Set([
  '/health',
  '/ready',
  '/openapi.json',
  '/auth/login',
  '/auth/register',
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
    return { token: token || null, source: token ? 'bearer' : null };
  }
  const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
  return { token: token ?? null, source: token ? 'cookie' : null };
}

function serializeSession(principal: AuthenticatedPrincipalRecord) {
  return {
    user: { id: principal.userId, email: principal.email },
    candidateIds: [...principal.candidateIds],
    primaryCandidateId: principal.primaryCandidateId,
    expiresAt: principal.expiresAt.toISOString(),
  };
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
  return typeof query?.candidateId === 'string' ? query.candidateId : null;
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
): void {
  const typedApp = app.withTypeProvider<TypeBoxTypeProvider>();
  const repository = new AuthRepository(database);

  typedApp.addHook('preHandler', async (request, reply) => {
    const route = request.routeOptions.url;
    if (route && PUBLIC_ROUTES.has(route)) return;

    if (config.identityMode !== 'cloud' && route?.startsWith('/auth/')) {
      const error = authError(request, 403, 'FORBIDDEN');
      await reply.status(error.statusCode).send(error.body);
      return;
    }

    if (config.identityMode === 'cloud') {
      const credential = readSessionToken(request);
      const principal = credential.token
        ? repository.findActiveSession(hashToken(credential.token))
        : null;
      if (!principal) {
        const error = authError(request, 401, 'UNAUTHORIZED');
        await reply.status(error.statusCode).send(error.body);
        return;
      }
      principals.set(request, principal);

      if (
        credential.source === 'cookie' &&
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
        request.headers.origin !== config.webOrigin
      ) {
        const error = authError(request, 403, 'FORBIDDEN');
        await reply.status(error.statusCode).send(error.body);
        return;
      }

      const requestedCandidate = requestCandidateId(request);
      if (
        requestedCandidate &&
        !repository.userCanAccessCandidate(principal.userId, requestedCandidate)
      ) {
        const error = authError(request, 403, 'FORBIDDEN');
        await reply.status(error.statusCode).send(error.body);
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

  function newSessionMaterial() {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + config.sessionTtlHours * 60 * 60 * 1000,
    );
    return { token, tokenHash: hashToken(token), expiresAt };
  }

  function createSession(userId: string) {
    const material = newSessionMaterial();
    repository.createSession({
      userId,
      tokenHash: material.tokenHash,
      expiresAt: material.expiresAt,
    });
    const principal = repository.findActiveSession(material.tokenHash);
    if (!principal) throw new Error('Newly created session could not be read');
    return { token: material.token, principal };
  }

  function assertAllowedOrigin(
    request: FastifyRequest,
    transport: 'cookie' | 'bearer' | undefined,
  ): boolean {
    if (transport === 'bearer') return true;
    return request.headers.origin === config.webOrigin;
  }

  typedApp.post(
    '/auth/register',
    {
      schema: {
        tags: ['auth'],
        body: RegisterInputSchema,
        response: {
          201: AuthResponseSchema,
          403: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
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
      try {
        const passwordHash = await hashPassword(request.body.password);
        const material = newSessionMaterial();
        const account = repository.createAccount({
          email: request.body.email,
          passwordHash,
          session: {
            tokenHash: material.tokenHash,
            expiresAt: material.expiresAt,
          },
        });
        const principal = repository.findActiveSession(material.tokenHash);
        if (!principal || !account.sessionId) {
          throw new Error('Newly registered session could not be read');
        }
        const session = { token: material.token, principal };
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
        return reply.status(201).send({
          session: serializeSession(session.principal),
          ...(request.body.transport === 'bearer'
            ? { token: session.token }
            : {}),
        });
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
      schema: {
        tags: ['auth'],
        body: LoginInputSchema,
        response: {
          200: AuthResponseSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
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
      const user = repository.findUserByEmail(request.body.email);
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
      const session = createSession(user.id);
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
    (request, reply) => {
      const principal = getAuthenticatedPrincipal(request)!;
      const revoked = repository.revokeSession(principal.sessionId);
      reply.header(
        'set-cookie',
        cookieValue('', 0, config.environment === 'production'),
      );
      return { revoked };
    },
  );
}
