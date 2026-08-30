import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { ApiConfig } from '@oca/config/server';
import {
  databaseIsReady,
  EvaluationRepository,
  EvidenceRepository,
  type DatabaseHandle,
} from '@oca/database';
import { Type, type Static } from '@sinclair/typebox';
import { OpportunityRepository } from '@oca/database';
import {
  evaluationId,
  findingId,
  opportunityId,
  snapshotId,
} from '@oca/domain';
import {
  ApiErrorEnvelopeSchema,
  HealthResponseSchema,
  ReadinessResponseSchema,
  OpportunityListResponseSchema,
  OpportunityDetailResponseSchema,
} from '@oca/schemas';
import Fastify, { type FastifyInstance } from 'fastify';

const SERVICE = { name: 'api', version: '0.0.0' } as const;

function publicStatusCode(error: unknown): number {
  if (error instanceof Error && 'statusCode' in error) {
    const statusCode = error.statusCode;
    if (
      typeof statusCode === 'number' &&
      statusCode >= 400 &&
      statusCode < 500
    ) {
      return statusCode;
    }
  }

  return 500;
}

export interface CreateApiAppOptions {
  readonly config: ApiConfig;
  readonly database: DatabaseHandle;
  readonly closeDatabaseOnClose?: boolean;
  readonly logger?: boolean;
}

export async function createApiApp(
  options: CreateApiAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    requestIdHeader: 'x-request-id',
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    origin: options.config.webOrigin,
    methods: ['GET'],
  });
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Open Career Agent API',
        version: SERVICE.version,
        description: 'Programmatic API contract for the application.',
      },
    },
  });

  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Process liveness',
        response: { 200: HealthResponseSchema },
      },
    },
    () => ({ status: 'ok' as const, service: SERVICE }),
  );

  app.get(
    '/ready',
    {
      schema: {
        tags: ['system'],
        summary: 'Service readiness',
        response: {
          200: ReadinessResponseSchema,
          503: ReadinessResponseSchema,
        },
      },
    },
    (_request, reply) => {
      try {
        if (databaseIsReady(options.database)) {
          return {
            status: 'ready' as const,
            service: SERVICE,
            resources: { database: 'ready' as const },
          };
        }
      } catch (error) {
        app.log.warn({ err: error }, 'Database readiness check failed');
      }

      reply.status(503);
      return {
        status: 'not_ready' as const,
        service: SERVICE,
        resources: { database: 'not_ready' as const },
      };
    },
  );

  app.get(
    '/openapi.json',
    {
      schema: {
        hide: true,
        summary: 'Generated OpenAPI document',
      },
    },
    () => app.swagger(),
  );

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
        requestId: request.id,
      },
    }),
  );

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Request failed');
    const statusCode = publicStatusCode(error);
    const code = statusCode === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST';
    const message =
      statusCode === 500
        ? 'An internal error occurred.'
        : 'The request could not be processed.';

    return reply.status(statusCode).send({
      error: { code, message, requestId: request.id },
    });
  });

  app.addSchema(ApiErrorEnvelopeSchema);

  app.get(
    '/opportunities',
    {
      schema: {
        tags: ['opportunities'],
        summary: 'List opportunities',
        response: { 200: OpportunityListResponseSchema },
      },
    },
    () => {
      const repo = new OpportunityRepository(options.database);
      const evaluationRepository = new EvaluationRepository(options.database);
      const data = repo.getOpportunitySummaries().map((item) => {
        if (!item.latestSnapshotId) return item;
        const fit = evaluationRepository.getLatestFitForSnapshot(
          snapshotId(item.latestSnapshotId),
        );
        return fit?.fitLevel ? { ...item, fitLevel: fit.fitLevel } : item;
      });
      return {
        data: data as unknown as Static<
          typeof OpportunityListResponseSchema
        >['data'],
      };
    },
  );

  app.get(
    '/opportunities/:id',
    {
      schema: {
        tags: ['opportunities'],
        summary: 'Get opportunity detail',
        params: Type.Object({ id: Type.String() }),
        response: {
          200: OpportunityDetailResponseSchema,
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const repo = new OpportunityRepository(options.database);
      const { id: idRaw } = request.params;
      const id = opportunityId(idRaw);
      const opportunity = repo.getOpportunity(id);

      if (!opportunity) {
        await reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Opportunity not found',
            requestId: request.id,
          },
        });
        return;
      }

      const snapshots = repo.getSnapshots(id);
      const evaluationRepository = new EvaluationRepository(options.database);
      const evidenceRepository = new EvidenceRepository(options.database);

      const snapshotsWithFit = snapshots.map((snapshot) => {
        const fit = evaluationRepository.getLatestFitForSnapshot(
          snapshotId(snapshot.id),
        );
        if (!fit?.fitLevel || !fit.fitEngineVersion || !fit.fitSummary) {
          return snapshot;
        }
        const findings = evaluationRepository
          .getFitFindings(evaluationId(fit.id))
          .map((item) => ({
            id: item.id,
            dimension: item.dimensionKey.split(':')[0] ?? item.dimensionKey,
            label: item.label ?? item.dimensionKey,
            state: item.state,
            modality: item.modality,
            requirement: item.requirementText,
            explanation: item.explanation ?? item.summary,
            confidence: item.confidence,
            evidence: evidenceRepository
              .getFindingEvidence(findingId(item.id))
              .map((evidence) => ({
                id: evidence.id,
                evidenceType: evidence.evidenceType,
                sourceReference: evidence.sourceReference,
                excerpt: evidence.excerpt,
                state: evidence.state,
              })),
          }));
        return {
          ...snapshot,
          fit: {
            level: fit.fitLevel,
            summary: fit.fitSummary,
            engineVersion: fit.fitEngineVersion,
            findings,
          },
        };
      });

      return {
        opportunity: {
          id: opportunity.id,
          createdAt: new Date(opportunity.createdAt).toISOString(),
        },
        snapshots: snapshotsWithFit as unknown as Static<
          typeof OpportunityDetailResponseSchema
        >['snapshots'],
      };
    },
  );

  if (options.closeDatabaseOnClose ?? true) {
    app.addHook('onClose', () => {
      options.database.close();
    });
  }

  return app;
}
