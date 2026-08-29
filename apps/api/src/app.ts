import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { ApiConfig } from '@oca/config/server';
import { databaseIsReady, type DatabaseHandle } from '@oca/database';
import {
  ApiErrorEnvelopeSchema,
  HealthResponseSchema,
  ReadinessResponseSchema,
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

  if (options.closeDatabaseOnClose ?? true) {
    app.addHook('onClose', () => {
      options.database.close();
    });
  }

  return app;
}
