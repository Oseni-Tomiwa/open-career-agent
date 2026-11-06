import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DatabaseHandle } from '@oca/database';
import {
  AuthRepository,
  ManualOpportunityError,
  ManualOpportunityRepository,
} from '@oca/database';
import {
  normalizeManualOpportunityInput,
  type ManualOpportunityInput,
} from '@oca/domain';
import {
  ManualOpportunityDetailSchema,
  ManualOpportunityDuplicateSchema,
  ManualOpportunityListSchema,
  ManualOpportunityRecordSchema,
  ManualOpportunityRequestSchema,
} from '@oca/schemas';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { getAuthenticatedPrincipal } from './auth.js';

const base = '/candidates/:candidateId/manual-opportunities';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const params = Type.Object({
  candidateId: Type.String({ minLength: 1, maxLength: 200 }),
});
const detailParams = Type.Object({
  ...params.properties,
  opportunityId: Type.String({ minLength: 1, maxLength: 200 }),
});
const listQuery = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    after: Type.Optional(Type.String({ pattern: uuid.source })),
  },
  { additionalProperties: false },
);

function fail(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  extra = {},
) {
  return reply
    .code(status)
    .send({ error: { code, message, requestId: request.id, ...extra } });
}

function parse(
  body: unknown,
): { input: ManualOpportunityInput; acknowledgement?: string } | null {
  if (!Value.Check(ManualOpportunityRequestSchema, body)) return null;
  const input = normalizeManualOpportunityInput({
    category: body.category,
    title: body.title,
    organization: body.organization,
    sourceUrl: body.sourceUrl ?? null,
    sourceContext: body.sourceContext ?? null,
    deadline: body.deadline ?? null,
  });
  if (!input) return null;
  return {
    input,
    ...(body.acknowledgement ? { acknowledgement: body.acknowledgement } : {}),
  };
}

export function registerManualOpportunities(
  app: FastifyInstance,
  config: { identityMode?: string; trustedCandidateId?: string },
  database: DatabaseHandle,
) {
  const repo = new ManualOpportunityRepository(database);
  const auth = new AuthRepository(database);
  const guard = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');
    const { candidateId } = request.params as { candidateId: string };
    if (config.identityMode === 'cloud') {
      const principal = getAuthenticatedPrincipal(request);
      if (!principal)
        return fail(
          request,
          reply,
          401,
          'UNAUTHORIZED',
          'Authentication is required.',
        );
      if (await auth.userCanAccessCandidate(principal.userId, candidateId))
        return;
    } else if (
      config.trustedCandidateId &&
      config.trustedCandidateId === candidateId
    )
      return;
    return fail(
      request,
      reply,
      403,
      'FORBIDDEN',
      'Access to this candidate is forbidden.',
    );
  };
  const response = Type.Object({
    record: ManualOpportunityRecordSchema,
    replayed: Type.Boolean(),
  });
  app.get<{
    Params: { candidateId: string };
    Querystring: { limit?: number; after?: string };
  }>(
    base,
    {
      onRequest: guard,
      schema: {
        params,
        querystring: listQuery,
        response: { 200: ManualOpportunityListSchema },
      },
    },
    async (request) =>
      repo.list(
        request.params.candidateId,
        request.query.limit,
        request.query.after,
      ),
  );
  app.get<{ Params: { candidateId: string; opportunityId: string } }>(
    base + '/:opportunityId',
    {
      onRequest: guard,
      schema: {
        params: detailParams,
        response: { 200: ManualOpportunityDetailSchema },
      },
    },
    async (request, reply) => {
      const record = await repo.detail(
        request.params.candidateId,
        request.params.opportunityId,
      );
      if (!record)
        return fail(request, reply, 404, 'NOT_FOUND', 'Opportunity not found.');
      return reply.header('ETag', `"v${record.version}"`).send(record);
    },
  );
  const mutationOptions = {
    onRequest: guard,
    bodyLimit: 16_384,
    // Fastify's default compiler removes unknown fields. Check the untouched
    // body in the handler instead so spoofed fields fail validation.
    validatorCompiler: () => () => true,
  };
  app.post<{ Params: { candidateId: string } }>(
    base + '/duplicate-check',
    {
      ...mutationOptions,
      schema: {
        params,
        body: ManualOpportunityRequestSchema,
        response: { 200: ManualOpportunityDuplicateSchema },
      },
    },
    async (request, reply) => {
      const body = parse(request.body);
      if (!body)
        return fail(
          request,
          reply,
          422,
          'INVALID_FIELDS',
          'Check the opportunity fields and source.',
        );
      return repo.duplicateCheck(request.params.candidateId, body.input);
    },
  );
  app.post<{ Params: { candidateId: string } }>(
    base,
    {
      ...mutationOptions,
      schema: {
        params,
        body: ManualOpportunityRequestSchema,
        response: { 200: response, 201: response },
      },
    },
    async (request, reply) => {
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || !uuid.test(key))
        return fail(
          request,
          reply,
          400,
          'INVALID_IDEMPOTENCY_KEY',
          'A UUID Idempotency-Key is required.',
        );
      const body = parse(request.body);
      if (!body)
        return fail(
          request,
          reply,
          422,
          'INVALID_FIELDS',
          'Check the opportunity fields and source.',
        );
      try {
        const result = await repo.create(
          request.params.candidateId,
          key.toLowerCase(),
          body.input,
          body.acknowledgement,
        );
        return reply
          .header('ETag', `"v${result.record.version}"`)
          .code(result.replayed ? 200 : 201)
          .send(result);
      } catch (error) {
        return mutationError(request, reply, error);
      }
    },
  );
  app.patch<{ Params: { candidateId: string; opportunityId: string } }>(
    base + '/:opportunityId',
    {
      ...mutationOptions,
      schema: {
        params: detailParams,
        body: ManualOpportunityRequestSchema,
        response: { 200: ManualOpportunityRecordSchema },
      },
    },
    async (request, reply) => {
      const token = request.headers['if-match'];
      if (token === undefined)
        return fail(
          request,
          reply,
          428,
          'VERSION_REQUIRED',
          'If-Match is required.',
        );
      const match =
        typeof token === 'string' ? /^"v([1-9][0-9]{0,9})"$/.exec(token) : null;
      if (!match || Number(match[1]) > 2147483647)
        return fail(
          request,
          reply,
          400,
          'INVALID_VERSION',
          'If-Match must contain one version.',
        );
      const body = parse(request.body);
      if (!body)
        return fail(
          request,
          reply,
          422,
          'INVALID_FIELDS',
          'Check the opportunity fields and source.',
        );
      try {
        const record = await repo.edit(
          request.params.candidateId,
          request.params.opportunityId,
          Number(match[1]),
          body.input,
          body.acknowledgement,
        );
        return reply.header('ETag', `"v${record.version}"`).send(record);
      } catch (error) {
        return mutationError(request, reply, error);
      }
    },
  );
}

function mutationError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
) {
  if (error instanceof ManualOpportunityError) {
    switch (error.code) {
      case 'INVALID_FIELDS':
        return fail(
          request,
          reply,
          422,
          error.code,
          'Check the opportunity fields and source.',
        );
      case 'NOT_FOUND':
        return fail(request, reply, 404, error.code, 'Opportunity not found.');
      case 'STALE_VERSION':
        return fail(
          request,
          reply,
          412,
          error.code,
          'The opportunity has changed.',
        );
      case 'DUPLICATE':
        return fail(
          request,
          reply,
          409,
          error.code,
          'Review possible duplicates.',
          error.duplicate,
        );
      case 'IDEMPOTENCY_KEY_REUSED':
        return fail(
          request,
          reply,
          409,
          error.code,
          'This key already belongs to a different request.',
        );
    }
  }
  const cause = (error as { cause?: unknown })?.cause ?? error;
  const code = (cause as { code?: string })?.code;
  if (
    code === '55P03' ||
    code === '57014' ||
    (cause as { errcode?: number })?.errcode === 5
  ) {
    return fail(
      request,
      reply,
      503,
      'TEMPORARILY_UNAVAILABLE',
      'Retry with the same request.',
    );
  }
  request.log.error({ code }, 'Manual opportunity mutation failed');
  return fail(
    request,
    reply,
    500,
    'INTERNAL_ERROR',
    'Could not save the opportunity.',
  );
}
