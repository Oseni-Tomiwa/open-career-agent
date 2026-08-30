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
  candidateId,
  decisionId,
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
        querystring: Type.Object({ candidateId: Type.Optional(Type.String()) }),
      },
    },
    (request) => {
      const repo = new OpportunityRepository(options.database);
      const evaluationRepository = new EvaluationRepository(options.database);
      const data = repo.getOpportunitySummaries().map((item) => {
        if (!item.latestSnapshotId) return item;
        const sId = snapshotId(item.latestSnapshotId);
        const evaluation = request.query.candidateId
          ? evaluationRepository.getCurrentEvaluation(
              candidateId(request.query.candidateId),
              sId,
            )
          : null;
        const decision = evaluation
          ? evaluationRepository.getCurrentDecisionForEvaluation(
              evaluationId(evaluation.id),
            )
          : null;
        return {
          ...item,
          ...(evaluation?.eligibilityState
            ? { eligibilityState: evaluation.eligibilityState }
            : {}),
          ...(evaluation?.fitLevel ? { fitLevel: evaluation.fitLevel } : {}),
          ...(evaluation?.qualityLevel
            ? { qualityLevel: evaluation.qualityLevel }
            : {}),
          ...(decision?.priority ? { decisionState: decision.priority } : {}),
        };
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
        querystring: Type.Object({ candidateId: Type.Optional(Type.String()) }),
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

      const snapshotsWithEvaluations = snapshots.map((snapshot) => {
        const sId = snapshotId(snapshot.id);
        const evaluation = request.query.candidateId
          ? evaluationRepository.getCurrentEvaluation(
              candidateId(request.query.candidateId),
              sId,
            )
          : null;
        const fit = evaluation;
        const quality = evaluation;
        const decision = evaluation
          ? evaluationRepository.getCurrentDecisionForEvaluation(
              evaluationId(evaluation.id),
            )
          : null;

        let fitResult = undefined;
        let eligibilityResult = undefined;
        if (
          evaluation?.eligibilityState &&
          evaluation.eligibilityEngineVersion
        ) {
          eligibilityResult = {
            state: evaluation.eligibilityState,
            engineVersion: evaluation.eligibilityEngineVersion,
            findings: evaluationRepository
              .getEligibilityFindings(evaluationId(evaluation.id))
              .map((item) => ({
                id: item.id,
                dimension: item.dimensionKey,
                state: item.state,
                summary: item.summary,
                confidence: item.confidence ?? undefined,
                evidence: evidenceRepository
                  .getFindingEvidence(findingId(item.id))
                  .map((evidence) => ({
                    id: evidence.id,
                    evidenceType: evidence.evidenceType,
                    sourceReference: evidence.sourceReference,
                    excerpt: evidence.excerpt,
                    state: evidence.state,
                  })),
              })),
          };
        }
        if (fit?.fitLevel && fit.fitEngineVersion && fit.fitSummary) {
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
          fitResult = {
            level: fit.fitLevel,
            summary: fit.fitSummary,
            engineVersion: fit.fitEngineVersion,
            findings,
          };
        }

        let qualityResult = undefined;
        if (
          quality?.qualityLevel &&
          quality.qualityEngineVersion &&
          quality.qualitySummary
        ) {
          const findings = evaluationRepository
            .getQualityFindings(evaluationId(quality.id))
            .map((item) => ({
              id: item.id,
              dimension: item.dimensionKey,
              label: item.label ?? item.dimensionKey,
              state: item.state,
              importance: item.confidence ?? 'important',
              explanation: item.explanation ?? item.summary,
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
          qualityResult = {
            level: quality.qualityLevel,
            summary: quality.qualitySummary,
            engineVersion: quality.qualityEngineVersion,
            freshnessBucket: quality.qualityFreshnessBucket ?? 'recent',
            evaluatedAt: quality.qualityEvaluatedAt
              ? new Date(quality.qualityEvaluatedAt).toISOString()
              : undefined,
            findings,
          };
        }

        let decisionResult = undefined;
        if (decision?.priority && decision.explanation) {
          const reasonCodes = JSON.parse(
            decision.reasonCodes ?? '[]',
          ) as string[];
          const reasons = evaluationRepository.getDecisionReasons(
            decisionId(decision.id),
          );
          const reasonGroups = new Map<string, string[]>();
          for (const reason of reasons) {
            const ids = reasonGroups.get(reason.reasonCode) ?? [];
            ids.push(reason.findingId);
            reasonGroups.set(reason.reasonCode, ids);
          }
          decisionResult = {
            id: decision.id,
            state: decision.priority,
            action: decision.action,
            explanation: decision.explanation,
            engineVersion: decision.engineVersion!,
            inputFingerprint: decision.inputFingerprint!,
            reasonCodes,
            reasons: reasonCodes.map((code) => ({
              code,
              findingIds: reasonGroups.get(code) ?? [],
            })),
            evaluatedAt: new Date(decision.evaluatedAt!).toISOString(),
          };
        }

        return {
          ...snapshot,
          ...(eligibilityResult ? { eligibility: eligibilityResult } : {}),
          ...(fitResult ? { fit: fitResult } : {}),
          ...(qualityResult ? { quality: qualityResult } : {}),
          ...(decisionResult ? { decision: decisionResult } : {}),
        };
      });

      return {
        opportunity: {
          id: opportunity.id,
          createdAt: new Date(opportunity.createdAt).toISOString(),
        },
        snapshots: snapshotsWithEvaluations as unknown as Static<
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
