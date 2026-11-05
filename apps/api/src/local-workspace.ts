import type { ApiConfig } from '@oca/config/server';
import { CandidateRepository, type DatabaseHandle } from '@oca/database';
import { candidateId } from '@oca/domain';
import {
  ApiErrorEnvelopeSchema,
  InitializeLocalWorkspaceInputSchema,
  LocalWorkspaceReadySchema,
  LocalWorkspaceStatusSchema,
} from '@oca/schemas';
import { Value } from '@sinclair/typebox/value';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const loopbackHost = (host: string) =>
  ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
const loopbackSocket = (address?: string) =>
  !!address &&
  (address === '::1' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address) ||
    /^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i.test(address));
function enabled(config: ApiConfig): boolean {
  try {
    const origin = new URL(config.webOrigin);
    return (
      config.localWorkspaceSetupEnabled === true &&
      config.environment === 'development' &&
      (config.identityMode === 'development' ||
        config.identityMode === 'self-hosted') &&
      loopbackHost(config.host) &&
      loopbackHost(origin.hostname) &&
      ['http:', 'https:'].includes(origin.protocol) &&
      origin.origin === config.webOrigin &&
      !!config.trustedCandidateId?.trim()
    );
  } catch {
    return false;
  }
}
function fail(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
) {
  return reply
    .header('Cache-Control', 'no-store')
    .status(status)
    .send({ error: { code, message, requestId: request.id } });
}
function validHost(request: FastifyRequest, port: number): boolean {
  const host = request.headers.host;
  const raw = request.raw.rawHeaders;
  if (
    raw.filter(
      (_, index) => index % 2 === 0 && raw[index]?.toLowerCase() === 'host',
    ).length !== 1 ||
    !host ||
    /[\s,/@?#\\]/.test(host)
  )
    return false;
  try {
    const parsed = new URL(`http://${host}`);
    return (
      loopbackHost(parsed.hostname) &&
      Number(parsed.port || 80) === port &&
      parsed.host === host.toLowerCase()
    );
  } catch {
    return false;
  }
}
/** Guard runs in the auth boundary before any cloud credentials or candidate storage. */
export async function guardLocalWorkspace(
  request: FastifyRequest,
  reply: FastifyReply,
  config: ApiConfig,
): Promise<void> {
  reply.header('Cache-Control', 'no-store');
  if (!enabled(config)) {
    await fail(
      request,
      reply,
      404,
      'NOT_FOUND',
      'The requested resource was not found.',
    );
    return;
  }
  const forwarded = Object.keys(request.headers).some(
    (key) =>
      key === 'forwarded' || key === 'via' || key.startsWith('x-forwarded-'),
  );
  const origin = request.headers.origin;
  if (
    !['GET', 'POST'].includes(request.method) ||
    forwarded ||
    !loopbackSocket(request.raw.socket.remoteAddress) ||
    !validHost(request, config.port) ||
    (request.method === 'POST'
      ? origin !== config.webOrigin
      : origin !== undefined && origin !== config.webOrigin)
  ) {
    await fail(
      request,
      reply,
      403,
      'LOCAL_WORKSPACE_FORBIDDEN',
      'Local workspace initialization is not authorized.',
    );
  }
}
export function registerLocalWorkspace(
  app: FastifyInstance,
  config: ApiConfig,
  database: DatabaseHandle,
): void {
  const repository = new CandidateRepository(database);
  const errors = {
    400: ApiErrorEnvelopeSchema,
    403: ApiErrorEnvelopeSchema,
    404: ApiErrorEnvelopeSchema,
    503: ApiErrorEnvelopeSchema,
  };
  const preValidation = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    if (
      request.raw.url?.includes('?') ||
      (request.method === 'POST' &&
        !Value.Check(InitializeLocalWorkspaceInputSchema, request.body))
    ) {
      await fail(
        request,
        reply,
        400,
        'INVALID_REQUEST',
        'The workspace request must not contain identity or other input.',
      );
    }
  };
  const ready = (row: { id: string; createdAt: Date; updatedAt: Date }) => ({
    mode: 'local' as const,
    state: 'READY' as const,
    candidate: {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  });
  app.get(
    '/local-workspace',
    {
      schema: { response: { 200: LocalWorkspaceStatusSchema, ...errors } },
      preValidation,
    },
    async (request, reply) => {
      try {
        const row = await repository.getCandidate(
          candidateId(config.trustedCandidateId!),
        );
        return row ? ready(row) : { mode: 'local', state: 'SETUP_REQUIRED' };
      } catch {
        return fail(
          request,
          reply,
          503,
          'LOCAL_WORKSPACE_UNAVAILABLE',
          'The personal workspace could not be read. Retry when storage is available.',
        );
      }
    },
  );
  app.post(
    '/local-workspace',
    {
      schema: {
        body: InitializeLocalWorkspaceInputSchema,
        response: { 200: LocalWorkspaceReadySchema, ...errors },
      },
      preValidation,
    },
    async (request, reply) => {
      try {
        return ready(
          await repository.ensureCandidate(
            candidateId(config.trustedCandidateId!),
          ),
        );
      } catch {
        return fail(
          request,
          reply,
          503,
          'LOCAL_WORKSPACE_UNAVAILABLE',
          'Workspace initialization could not be confirmed. It is safe to retry.',
        );
      }
    },
  );
}
