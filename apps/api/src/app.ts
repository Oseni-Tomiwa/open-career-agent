import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { ApiConfig } from '@oca/config/server';
import {
  CareerMemoryError,
  CareerMemoryRepository,
  SearchTargetRepository,
  TodayRepository,
  ApplicationRepository,
  SourceListingRepository,
  CareerSignalsRepository,
  databaseIsReady,
  EvaluationRepository,
  EvidenceRepository,
  BackgroundTaskLedger,
  type DatabaseHandle,
} from '@oca/database';
import { Type, type Static } from '@sinclair/typebox';
import { OpportunityRepository } from '@oca/database';
import {
  evaluationId,
  findingId,
  candidateId,
  claimId,
  decisionId,
  opportunityId,
  snapshotId,
  searchTargetId,
  discoveryRunId,
  applicationId,
} from '@oca/domain';
import {
  ApiErrorEnvelopeSchema,
  HealthResponseSchema,
  ReadinessResponseSchema,
  OpportunityListResponseSchema,
  OpportunityDetailResponseSchema,
  CandidateProfileResponseSchema,
  CreateCandidateClaimInputSchema,
  UpdateCandidateClaimInputSchema,
  AttachClaimEvidenceInputSchema,
  CareerMemoryMutationResponseSchema,
  SearchTargetSchema,
  CreateSearchTargetInputSchema,
  UpdateSearchTargetInputSchema,
  SearchTargetListResponseSchema,
  DiscoveryRunListResponseSchema,
  TriggerDiscoveryRunResponseSchema,
  TodayDashboardResponseSchema,
  CareerSignalsResponseSchema,
  ApplicationListResponseSchema,
  ApplicationDetailResponseSchema,
  CreateApplicationInputSchema,
  UpdateApplicationInputSchema,
  AddApplicationEventInputSchema,
  ApplicationEventSchema,
} from '@oca/schemas';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';

import { registerAuthBoundary } from './auth.js';

const SERVICE = { name: 'api', version: '0.0.0' } as const;

export const API_LOG_REDACTION_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'res.headers["set-cookie"]',
  '*.passwordHash',
  '*.tokenHash',
] as const;

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
  const loggerOptions =
    options.logger && typeof options.logger === 'object'
      ? { redact: [...API_LOG_REDACTION_PATHS], ...(options.logger as object) }
      : options.logger
        ? { redact: [...API_LOG_REDACTION_PATHS] }
        : false;

  const isCloudOrProd =
    options.config.environment === 'production' ||
    options.config.identityMode === 'cloud';

  const app = Fastify({
    logger: loggerOptions,
    bodyLimit: 1_048_576, // 1MB payload limit
    trustProxy: isCloudOrProd,
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-Frame-Options', 'DENY');
  });

  await app.register(cors, {
    origin: [options.config.webOrigin],
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Open Career Agent API',
        description: 'REST API for Open Career Agent monorepo',
        version: '0.0.0',
      },
    },
  });

  app.get('/openapi.json', () => app.swagger());

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
        requestId: request.id,
      },
    });
  });

  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Service Liveness Check',
        response: {
          200: HealthResponseSchema,
        },
      },
    },
    () => {
      return {
        status: 'ok' as const,
        service: SERVICE,
      };
    },
  );

  app.get(
    '/ready',
    {
      schema: {
        tags: ['system'],
        summary: 'Service Readiness Check',
        response: {
          200: ReadinessResponseSchema,
          503: ReadinessResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      let isReady = false;
      try {
        isReady = await databaseIsReady(options.database);
      } catch {
        // Database unavailable
      }
      const payload = {
        status: isReady ? ('ready' as const) : ('not_ready' as const),
        service: SERVICE,
        resources: {
          database: isReady ? ('ready' as const) : ('not_ready' as const),
        },
      };

      if (!isReady) {
        return reply.status(503).send(payload);
      }

      return payload;
    },
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
  registerAuthBoundary(app, options.config, options.database);

  const profileParams = Type.Object({ candidateId: Type.String() });
  const claimParams = Type.Object({
    candidateId: Type.String(),
    claimId: Type.String(),
  });

  app.get(
    '/candidates/:candidateId/profile',
    {
      schema: {
        tags: ['career-memory'],
        summary: 'Read candidate Career Memory',
        params: profileParams,
        response: {
          200: CandidateProfileResponseSchema,
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const repository = new CareerMemoryRepository(options.database);
      const profile = await repository.getProfile(
        candidateId(request.params.candidateId),
      );
      if (!profile) {
        await sendCareerMemoryError(
          reply,
          request.id,
          404,
          'CANDIDATE_NOT_FOUND',
        );
        return;
      }
      return serializeProfile(profile);
    },
  );

  app.post(
    '/candidates/:candidateId/claims',
    {
      schema: {
        tags: ['career-memory'],
        summary: 'Create a candidate claim',
        params: profileParams,
        body: CreateCandidateClaimInputSchema,
        response: {
          201: CareerMemoryMutationResponseSchema,
          404: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const repository = new CareerMemoryRepository(options.database);
      const cId = candidateId(request.params.candidateId);
      try {
        await repository.createClaim({ candidateId: cId, ...request.body });
        const profile = (await repository.getProfile(cId))!;
        return await reply.status(201).send({
          ...serializeProfile(profile),
          reevaluationRequested: true,
        });
      } catch (error) {
        if (error instanceof CareerMemoryError) {
          await sendRepositoryError(reply, request.id, error);
          return;
        }
        throw error;
      }
    },
  );

  app.patch(
    '/candidates/:candidateId/claims/:claimId',
    {
      schema: {
        tags: ['career-memory'],
        summary: 'Update mutable claim fields or transition claim state',
        params: claimParams,
        body: UpdateCandidateClaimInputSchema,
        response: {
          200: CareerMemoryMutationResponseSchema,
          404: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      if (Object.keys(request.body).length === 0) {
        await sendCareerMemoryError(reply, request.id, 400, 'EMPTY_MUTATION');
        return;
      }
      const repository = new CareerMemoryRepository(options.database);
      const cId = candidateId(request.params.candidateId);
      try {
        await repository.updateClaim({
          candidateId: cId,
          claimId: claimId(request.params.claimId),
          ...request.body,
        });
        const profile = (await repository.getProfile(cId))!;
        return {
          ...serializeProfile(profile),
          reevaluationRequested: true,
        };
      } catch (error) {
        if (error instanceof CareerMemoryError) {
          await sendRepositoryError(reply, request.id, error);
          return;
        }
        throw error;
      }
    },
  );

  app.post(
    '/candidates/:candidateId/claims/:claimId/evidence',
    {
      schema: {
        tags: ['career-memory'],
        summary: 'Attach manual Evidence to a candidate claim',
        params: claimParams,
        body: AttachClaimEvidenceInputSchema,
        response: {
          201: CareerMemoryMutationResponseSchema,
          404: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const repository = new CareerMemoryRepository(options.database);
      const cId = candidateId(request.params.candidateId);
      try {
        await repository.attachEvidence({
          candidateId: cId,
          claimId: claimId(request.params.claimId),
          ...request.body,
        });
        const profile = (await repository.getProfile(cId))!;
        return await reply.status(201).send({
          ...serializeProfile(profile),
          reevaluationRequested: true,
        });
      } catch (error) {
        if (error instanceof CareerMemoryError) {
          await sendRepositoryError(reply, request.id, error);
          return;
        }
        throw error;
      }
    },
  );

  // SEARCH & DISCOVERY ENDPOINTS

  const targetParams = Type.Object({
    candidateId: Type.String(),
    targetId: Type.String(),
  });

  function sourceConfigurationError(
    sources: readonly { sourceSystem: string; boardId: string }[] | undefined,
  ): string | null {
    if (!sources) return null;
    const keys = sources.map(
      (source) =>
        `${source.sourceSystem}:${source.boardId.trim().toLowerCase()}`,
    );
    return new Set(keys).size === keys.length
      ? null
      : 'Duplicate source configurations are not allowed.';
  }

  app.get(
    '/candidates/:candidateId/search-targets',
    {
      schema: {
        tags: ['discovery'],
        summary: 'List candidate search targets',
        params: profileParams,
        response: {
          200: SearchTargetListResponseSchema,
        },
      },
    },
    async (request: any) => {
      const repo = new SearchTargetRepository(options.database);
      const targets = await repo.listSearchTargets(
        candidateId(request.params.candidateId),
      );
      return { data: targets };
    },
  );

  app.post(
    '/candidates/:candidateId/search-targets',
    {
      schema: {
        tags: ['discovery'],
        summary: 'Create a candidate search target',
        params: profileParams,
        body: CreateSearchTargetInputSchema,
        response: {
          201: SearchTargetSchema,
          400: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request: any, reply: any) => {
      const sourceError = sourceConfigurationError(request.body.sources);
      if (sourceError) {
        return await reply.status(400).send({
          error: {
            code: 'INVALID_SOURCE_CONFIGURATION',
            message: sourceError,
            requestId: request.id,
          },
        });
      }
      const repo = new SearchTargetRepository(options.database);
      const created = await repo.createSearchTarget(
        candidateId(request.params.candidateId),
        request.body,
      );
      return await reply.status(201).send(created);
    },
  );

  app.get(
    '/candidates/:candidateId/search-targets/:targetId',
    {
      schema: {
        tags: ['discovery'],
        summary: 'Get a candidate search target',
        params: targetParams,
        response: {
          200: SearchTargetSchema,
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request: any, reply: any) => {
      const repo = new SearchTargetRepository(options.database);
      const target = await repo.getSearchTarget(
        candidateId(request.params.candidateId),
        searchTargetId(request.params.targetId),
      );
      if (!target) {
        await reply.status(404).send({
          error: {
            code: 'TARGET_NOT_FOUND',
            message: 'Search target not found',
            requestId: request.id,
          },
        });
        return;
      }
      return target;
    },
  );

  app.patch(
    '/candidates/:candidateId/search-targets/:targetId',
    {
      schema: {
        tags: ['discovery'],
        summary: 'Update a candidate search target',
        params: targetParams,
        body: UpdateSearchTargetInputSchema,
        response: {
          200: SearchTargetSchema,
          400: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request: any, reply: any) => {
      const sourceError = sourceConfigurationError(request.body.sources);
      if (sourceError) {
        return await reply.status(400).send({
          error: {
            code: 'INVALID_SOURCE_CONFIGURATION',
            message: sourceError,
            requestId: request.id,
          },
        });
      }
      const repo = new SearchTargetRepository(options.database);
      const updated = await repo.updateSearchTarget(
        candidateId(request.params.candidateId),
        searchTargetId(request.params.targetId),
        request.body,
      );
      if (!updated) {
        await reply.status(404).send({
          error: {
            code: 'TARGET_NOT_FOUND',
            message: 'Search target not found',
            requestId: request.id,
          },
        });
        return;
      }
      return updated;
    },
  );

  app.delete(
    '/candidates/:candidateId/search-targets/:targetId',
    {
      schema: {
        tags: ['discovery'],
        summary: 'Delete a candidate search target',
        params: targetParams,
        response: {
          204: Type.Null(),
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request: any, reply: any) => {
      const repo = new SearchTargetRepository(options.database);
      const deleted = await repo.deleteSearchTarget(
        candidateId(request.params.candidateId),
        searchTargetId(request.params.targetId),
      );
      if (!deleted) {
        await reply.status(404).send({
          error: {
            code: 'TARGET_NOT_FOUND',
            message: 'Search target not found',
            requestId: request.id,
          },
        });
        return;
      }
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/candidates/:candidateId/search-targets/:targetId/run',
    {
      schema: {
        tags: ['discovery'],
        summary: 'Trigger a manual discovery run for a search target',
        params: targetParams,
        response: {
          202: TriggerDiscoveryRunResponseSchema,
          400: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request: any, reply: any) => {
      const repo = new SearchTargetRepository(options.database);
      const cId = candidateId(request.params.candidateId);
      const tId = searchTargetId(request.params.targetId);

      const target = await repo.getSearchTarget(cId, tId);
      if (!target) {
        await reply.status(404).send({
          error: {
            code: 'TARGET_NOT_FOUND',
            message: 'Search target not found',
            requestId: request.id,
          },
        });
        return;
      }

      const sourceKeys = target.sources.map(
        (source) =>
          `${source.sourceSystem}:${source.boardId.trim().toLowerCase()}`,
      );
      if (
        target.sources.length === 0 ||
        target.sources.some((source) => !source.boardId.trim()) ||
        new Set(sourceKeys).size !== sourceKeys.length
      ) {
        await reply.status(400).send({
          error: {
            code: 'INVALID_SOURCE_CONFIGURATION',
            message:
              'Configure at least one valid, non-duplicate job source before discovery.',
            requestId: request.id,
          },
        });
        return;
      }

      const runId = discoveryRunId(`dr_${crypto.randomUUID()}`);
      const runRecord = await repo.createDiscoveryRun(
        runId,
        cId,
        tId,
        [...new Set(target.sources.map((source) => source.sourceSystem))].join(
          ', ',
        ) || 'unconfigured',
      );

      const taskLedger = new BackgroundTaskLedger(options.database);
      await taskLedger.enqueue({
        taskType: 'discovery.run',
        payload: {
          candidateId: cId,
          searchTargetId: tId,
          discoveryRunId: runId,
        },
        idempotencyKey: `discovery-run-${tId}-${Date.now()}`,
      });

      return await reply.status(202).send({
        run: {
          ...runRecord,
          rejectedByReason: runRecord.rejectedByReason ?? null,
        },
        taskEnqueued: true,
      });
    },
  );

  app.get(
    '/candidates/:candidateId/discovery-runs',
    {
      schema: {
        tags: ['discovery'],
        summary: 'List candidate discovery runs',
        params: profileParams,
        response: {
          200: DiscoveryRunListResponseSchema,
        },
      },
    },
    async (request: any) => {
      const repo = new SearchTargetRepository(options.database);
      const runs = await repo.listDiscoveryRuns(
        candidateId(request.params.candidateId),
      );
      return {
        data: runs.map((r) => ({
          ...r,
          rejectedByReason: r.rejectedByReason ?? null,
        })),
      };
    },
  );

  app.get(
    '/candidates/:candidateId/today',
    {
      schema: {
        tags: ['today'],
        summary: 'Get candidate Today attention dashboard',
        params: profileParams,
        querystring: Type.Object({
          timeWindowDays: Type.Optional(Type.Number()),
        }),
        response: {
          200: TodayDashboardResponseSchema,
        },
      },
    },
    async (request: any) => {
      const repo = new TodayRepository(options.database);
      const dashboard = await repo.getTodayDashboard(
        candidateId(request.params.candidateId),
        {
          ...(request.query.timeWindowDays
            ? { timeWindowDays: request.query.timeWindowDays }
            : {}),
        },
      );
      return dashboard;
    },
  );

  app.get(
    '/candidates/:candidateId/career-signals',
    {
      schema: {
        tags: ['signals'],
        summary: 'Get candidate aggregated career market signals',
        params: profileParams,
        response: {
          200: CareerSignalsResponseSchema,
        },
      },
    },
    async (request: any) => {
      const repo = new CareerSignalsRepository(options.database);
      const signals = await repo.getCareerSignals(
        candidateId(request.params.candidateId),
      );
      return signals;
    },
  );

  async function buildApplicationDetail(
    app: any,
    appRepo: ApplicationRepository,
    oppRepo: OpportunityRepository,
    evalRepo: EvaluationRepository,
  ) {
    const oppId = opportunityId(app.opportunityId);
    const snapshot = await oppRepo.getLatestSnapshot(oppId);
    const sourceRepo = new SourceListingRepository(options.database);
    const sourceListing = await sourceRepo.findListingByOpportunityId(
      app.opportunityId,
    );

    let currentDecision: {
      state: string;
      action: string | null;
      explanation: string;
    } | null = null;
    if (snapshot) {
      const dec = await evalRepo.getCurrentDecision(
        candidateId(app.candidateId),
        snapshotId(snapshot.id),
      );
      if (dec) {
        currentDecision = {
          state: dec.priority,
          action: dec.action ?? null,
          explanation: dec.explanation,
        };
      }
    }

    const events = await appRepo.getEvents(
      candidateId(app.candidateId),
      applicationId(app.id),
    );

    return {
      id: app.id,
      candidateId: app.candidateId,
      opportunityId: app.opportunityId,
      status: app.status,
      originatingDecisionId: app.originatingDecisionId ?? null,
      originatingDecisionState: app.originatingDecisionState ?? null,
      originatingDecisionAction: app.originatingDecisionAction ?? null,
      submittedAt: app.submittedAt
        ? new Date(app.submittedAt).toISOString()
        : null,
      followUpDueAt: app.followUpDueAt
        ? new Date(app.followUpDueAt).toISOString()
        : null,
      followUpNote: app.followUpNote ?? null,
      followUpCompletedAt: app.followUpCompletedAt
        ? new Date(app.followUpCompletedAt).toISOString()
        : null,
      note: app.note ?? null,
      createdAt: new Date(app.createdAt).toISOString(),
      updatedAt: new Date(app.updatedAt).toISOString(),
      opportunity: snapshot
        ? {
            id: app.opportunityId,
            title: snapshot.title,
            organization: snapshot.organization ?? null,
            location: snapshot.location ?? null,
            sourceUrl: sourceListing?.sourceUrl ?? null,
          }
        : null,
      currentDecision,
      events: events.map((ev: any) => ({
        id: ev.id,
        applicationId: ev.applicationId,
        eventType: ev.eventType,
        detail: ev.detail,
        occurredAt: new Date(ev.occurredAt).toISOString(),
        actor: 'Candidate' as const,
      })),
    };
  }

  const applicationParams = Type.Object({
    candidateId: Type.String(),
    applicationId: Type.String(),
  });

  app.get(
    '/candidates/:candidateId/applications',
    {
      schema: {
        tags: ['applications'],
        summary: 'List candidate applications',
        params: profileParams,
        response: {
          200: ApplicationListResponseSchema,
        },
      },
    },
    async (request: any) => {
      const cId = candidateId(request.params.candidateId);
      const appRepo = new ApplicationRepository(options.database);
      const oppRepo = new OpportunityRepository(options.database);
      const evalRepo = new EvaluationRepository(options.database);

      const apps = await appRepo.listApplications(cId);
      const data = await Promise.all(
        apps.map(async (app: any) => {
          const oppId = opportunityId(app.opportunityId);
          const snapshot = await oppRepo.getLatestSnapshot(oppId);
          const dec = snapshot
            ? await evalRepo.getCurrentDecision(cId, snapshotId(snapshot.id))
            : null;
          const events = await appRepo.getEvents(cId, applicationId(app.id));
          const lastEvent =
            events.length > 0 ? events[events.length - 1] : null;

          return {
            id: app.id,
            opportunityId: app.opportunityId,
            title: snapshot?.title ?? 'Opportunity',
            organization: snapshot?.organization ?? null,
            location: snapshot?.location ?? null,
            status: app.status,
            currentDecision: dec ? dec.priority : null,
            submittedAt: app.submittedAt
              ? new Date(app.submittedAt).toISOString()
              : null,
            followUpDueAt: app.followUpDueAt
              ? new Date(app.followUpDueAt).toISOString()
              : null,
            lastEventAt: lastEvent
              ? new Date(lastEvent.occurredAt).toISOString()
              : new Date(app.updatedAt).toISOString(),
            createdAt: new Date(app.createdAt).toISOString(),
            updatedAt: new Date(app.updatedAt).toISOString(),
          };
        }),
      );

      return { data };
    },
  );

  app.post(
    '/candidates/:candidateId/applications',
    {
      schema: {
        tags: ['applications'],
        summary: 'Create candidate application',
        params: profileParams,
        body: CreateApplicationInputSchema,
        response: {
          201: ApplicationDetailResponseSchema,
          400: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request: any, reply: any) => {
      const cId = candidateId(request.params.candidateId);
      const appRepo = new ApplicationRepository(options.database);
      const oppRepo = new OpportunityRepository(options.database);
      const evalRepo = new EvaluationRepository(options.database);

      try {
        const app = await appRepo.createApplication({
          candidateId: cId,
          opportunityId: opportunityId(request.body.opportunityId),
          ...(request.body.status ? { status: request.body.status } : {}),
          ...(request.body.originatingDecisionId
            ? { originatingDecisionId: request.body.originatingDecisionId }
            : {}),
          ...(request.body.note ? { note: request.body.note } : {}),
          ...(request.body.appliedAt
            ? { appliedAt: new Date(request.body.appliedAt) }
            : {}),
        });

        reply.status(201);
        return await buildApplicationDetail(app, appRepo, oppRepo, evalRepo);
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          'code' in err &&
          typeof (err as { code?: unknown }).code === 'string'
        ) {
          const code = (err as { code: string }).code;
          const statusCode =
            code === 'DUPLICATE_APPLICATION'
              ? 409
              : code === 'UNAUTHORIZED'
                ? 403
                : 400;
          await reply.status(statusCode).send({
            error: {
              code,
              message: err.message,
              requestId: request.id,
            },
          });
          return;
        }
        throw err;
      }
    },
  );

  app.get(
    '/candidates/:candidateId/applications/:applicationId',
    {
      schema: {
        tags: ['applications'],
        summary: 'Get candidate application detail',
        params: applicationParams,
        response: {
          200: ApplicationDetailResponseSchema,
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request: any, reply: any) => {
      const cId = candidateId(request.params.candidateId);
      const appId = applicationId(request.params.applicationId);
      const appRepo = new ApplicationRepository(options.database);
      const oppRepo = new OpportunityRepository(options.database);
      const evalRepo = new EvaluationRepository(options.database);

      const app = await appRepo.getApplication(cId, appId);
      if (!app) {
        await reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Application '${request.params.applicationId}' not found for candidate.`,
            requestId: request.id,
          },
        });
        return;
      }

      return await buildApplicationDetail(app, appRepo, oppRepo, evalRepo);
    },
  );

  app.patch(
    '/candidates/:candidateId/applications/:applicationId',
    {
      schema: {
        tags: ['applications'],
        summary: 'Update candidate application',
        params: applicationParams,
        body: UpdateApplicationInputSchema,
        response: {
          200: ApplicationDetailResponseSchema,
          400: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request: any, reply: any) => {
      const cId = candidateId(request.params.candidateId);
      const appId = applicationId(request.params.applicationId);
      const appRepo = new ApplicationRepository(options.database);
      const oppRepo = new OpportunityRepository(options.database);
      const evalRepo = new EvaluationRepository(options.database);

      if (!(await appRepo.getApplication(cId, appId))) {
        await reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Application '${request.params.applicationId}' not found for candidate.`,
            requestId: request.id,
          },
        });
        return;
      }

      try {
        const updated = await appRepo.updateApplication({
          id: appId,
          candidateId: cId,
          ...(request.body.status ? { status: request.body.status } : {}),
          ...(request.body.expectedUpdatedAt
            ? { expectedUpdatedAt: request.body.expectedUpdatedAt }
            : {}),
          ...(request.body.note !== undefined
            ? { note: request.body.note }
            : {}),
          ...(request.body.followUpDueAt !== undefined
            ? {
                followUpDueAt: request.body.followUpDueAt
                  ? new Date(request.body.followUpDueAt)
                  : null,
              }
            : {}),
          ...(request.body.followUpNote !== undefined
            ? { followUpNote: request.body.followUpNote }
            : {}),
          ...(request.body.followUpCompletedAt !== undefined
            ? {
                followUpCompletedAt: request.body.followUpCompletedAt
                  ? new Date(request.body.followUpCompletedAt)
                  : null,
              }
            : {}),
        });

        return await buildApplicationDetail(
          updated,
          appRepo,
          oppRepo,
          evalRepo,
        );
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          'code' in err &&
          typeof (err as { code?: unknown }).code === 'string'
        ) {
          const code = (err as { code: string }).code;
          let statusCode: 400 | 404 | 409 | 403 = 400;
          if (code === 'NOT_FOUND') statusCode = 404;
          if (code === 'STALE_WRITE_CONFLICT') statusCode = 409;
          if (code === 'UNAUTHORIZED') statusCode = 403;
          await reply.status(statusCode).send({
            error: {
              code,
              message: err.message,
              requestId: request.id,
            },
          });
          return;
        }
        throw err;
      }
    },
  );

  app.post(
    '/candidates/:candidateId/applications/:applicationId/events',
    {
      schema: {
        tags: ['applications'],
        summary: 'Append custom event to candidate application',
        params: applicationParams,
        body: AddApplicationEventInputSchema,
        response: {
          200: ApplicationDetailResponseSchema,
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request: any, reply: any) => {
      const cId = candidateId(request.params.candidateId);
      const appId = applicationId(request.params.applicationId);
      const appRepo = new ApplicationRepository(options.database);
      const oppRepo = new OpportunityRepository(options.database);
      const evalRepo = new EvaluationRepository(options.database);

      const app = await appRepo.getApplication(cId, appId);
      if (!app) {
        await reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Application '${request.params.applicationId}' not found.`,
            requestId: request.id,
          },
        });
        return;
      }

      await appRepo.appendEvent({
        candidateId: cId,
        applicationId: appId,
        eventType: request.body.eventType,
        detail: request.body.detail,
      });

      return await buildApplicationDetail(app, appRepo, oppRepo, evalRepo);
    },
  );

  app.get(
    '/candidates/:candidateId/applications/:applicationId/events',
    {
      schema: {
        tags: ['applications'],
        summary: 'Get application timeline events',
        params: applicationParams,
        response: {
          200: Type.Object({ data: Type.Array(ApplicationEventSchema) }),
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request: any, reply: any) => {
      const cId = candidateId(request.params.candidateId);
      const appId = applicationId(request.params.applicationId);
      const appRepo = new ApplicationRepository(options.database);

      const app = await appRepo.getApplication(cId, appId);
      if (!app) {
        await reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Application '${request.params.applicationId}' not found.`,
            requestId: request.id,
          },
        });
        return;
      }

      const events = await appRepo.getEvents(cId, appId);
      return {
        data: events.map((ev: any) => ({
          id: ev.id,
          applicationId: ev.applicationId,
          eventType: ev.eventType,
          detail: ev.detail,
          occurredAt: new Date(ev.occurredAt).toISOString(),
          actor: 'Candidate' as const,
        })),
      };
    },
  );

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
    async (request: any) => {
      const repo = new OpportunityRepository(options.database);
      const evaluationRepository = new EvaluationRepository(options.database);
      const searchTargetRepo = new SearchTargetRepository(options.database);

      let summaries = await repo.getOpportunitySummaries();

      if (request.query.candidateId) {
        const cId = candidateId(request.query.candidateId);
        const matchedOppIds =
          await searchTargetRepo.getMatchedOpportunityIds(cId);
        const matchedSet = new Set(matchedOppIds);
        summaries = summaries.filter((item: any) =>
          matchedSet.has(opportunityId(item.id)),
        );
      }

      const data = await Promise.all(
        summaries.map(async (item: any) => {
          if (!item.latestSnapshotId) return item;
          const sId = snapshotId(item.latestSnapshotId);
          const evaluation = request.query.candidateId
            ? await evaluationRepository.getCurrentEvaluation(
                candidateId(request.query.candidateId),
                sId,
              )
            : null;
          const decision = evaluation
            ? await evaluationRepository.getCurrentDecisionForEvaluation(
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
        }),
      );

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
    async (request: any, reply: any) => {
      const repo = new OpportunityRepository(options.database);
      const { id: idRaw } = request.params;
      const id = opportunityId(idRaw);
      const opportunity = await repo.getOpportunity(id);

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

      const snapshots = await repo.getSnapshots(id);
      const evaluationRepository = new EvaluationRepository(options.database);
      const evidenceRepository = new EvidenceRepository(options.database);

      const snapshotsWithEvaluations = await Promise.all(
        snapshots.map(async (snapshot: any) => {
          const sId = snapshotId(snapshot.id);
          const isCloud = options.config.identityMode === 'cloud';
          const evaluation = request.query.candidateId
            ? await evaluationRepository.getCurrentEvaluation(
                candidateId(request.query.candidateId),
                sId,
              )
            : null;
          const fit = request.query.candidateId
            ? evaluation
            : isCloud
              ? null
              : await evaluationRepository.getLatestFitForSnapshot(sId);
          const quality = request.query.candidateId
            ? evaluation
            : isCloud
              ? null
              : await evaluationRepository.getLatestQualityForSnapshot(sId);
          const decision = request.query.candidateId
            ? evaluation
              ? await evaluationRepository.getCurrentDecisionForEvaluation(
                  evaluationId(evaluation.id),
                )
              : null
            : isCloud
              ? null
              : await evaluationRepository.getLatestDecisionForSnapshot(sId);

          let fitResult = undefined;
          let eligibilityResult = undefined;
          if (
            evaluation?.eligibilityState &&
            evaluation.eligibilityEngineVersion
          ) {
            const eligibilityFindings =
              await evaluationRepository.getEligibilityFindings(
                evaluationId(evaluation.id),
              );
            const findingsWithEvidence = await Promise.all(
              eligibilityFindings.map(async (item: any) => {
                const evidences = await evidenceRepository.getFindingEvidence(
                  findingId(item.id),
                );
                return {
                  id: item.id,
                  dimension: item.dimensionKey,
                  state: item.state,
                  summary: item.summary,
                  confidence: item.confidence ?? undefined,
                  evidence: evidences.map((ev: any) => ({
                    id: ev.id,
                    evidenceType: ev.evidenceType,
                    sourceReference: ev.sourceReference,
                    excerpt: ev.excerpt,
                    state: ev.state,
                  })),
                };
              }),
            );

            eligibilityResult = {
              state: evaluation.eligibilityState,
              engineVersion: evaluation.eligibilityEngineVersion,
              findings: findingsWithEvidence,
            };
          }

          if (fit?.fitLevel && fit.fitEngineVersion && fit.fitSummary) {
            const rawFitFindings = await evaluationRepository.getFitFindings(
              evaluationId(fit.id),
            );
            const fitFindingsWithEvidence = await Promise.all(
              rawFitFindings.map(async (item: any) => {
                const evidences = await evidenceRepository.getFindingEvidence(
                  findingId(item.id),
                );
                return {
                  id: item.id,
                  dimension:
                    item.dimensionKey.split(':')[0] ?? item.dimensionKey,
                  label: item.label ?? item.dimensionKey,
                  state: item.state,
                  modality: item.modality,
                  requirement: item.requirementText,
                  explanation: item.explanation ?? item.summary,
                  confidence: item.confidence,
                  evidence: evidences.map((ev: any) => ({
                    id: ev.id,
                    evidenceType: ev.evidenceType,
                    sourceReference: ev.sourceReference,
                    excerpt: ev.excerpt,
                    state: ev.state,
                  })),
                };
              }),
            );

            fitResult = {
              level: fit.fitLevel,
              summary: fit.fitSummary,
              engineVersion: fit.fitEngineVersion,
              findings: fitFindingsWithEvidence,
            };
          }

          let qualityResult = undefined;
          if (
            quality?.qualityLevel &&
            quality.qualityEngineVersion &&
            quality.qualitySummary
          ) {
            const rawQualityFindings =
              await evaluationRepository.getQualityFindings(
                evaluationId(quality.id),
              );
            const qualityFindingsWithEvidence = await Promise.all(
              rawQualityFindings.map(async (item: any) => {
                const evidences = await evidenceRepository.getFindingEvidence(
                  findingId(item.id),
                );
                return {
                  id: item.id,
                  dimension: item.dimensionKey,
                  label: item.label ?? item.dimensionKey,
                  state: item.state,
                  importance: item.confidence ?? 'important',
                  explanation: item.explanation ?? item.summary,
                  evidence: evidences.map((ev: any) => ({
                    id: ev.id,
                    evidenceType: ev.evidenceType,
                    sourceReference: ev.sourceReference,
                    excerpt: ev.excerpt,
                    state: ev.state,
                  })),
                };
              }),
            );

            qualityResult = {
              level: quality.qualityLevel,
              summary: quality.qualitySummary,
              engineVersion: quality.qualityEngineVersion,
              freshnessBucket: quality.qualityFreshnessBucket ?? 'recent',
              evaluatedAt: quality.qualityEvaluatedAt
                ? new Date(quality.qualityEvaluatedAt).toISOString()
                : undefined,
              findings: qualityFindingsWithEvidence,
            };
          }

          let decisionResult = undefined;
          if (decision?.priority && decision.explanation) {
            const reasonCodes = JSON.parse(
              decision.reasonCodes ?? '[]',
            ) as string[];
            const reasons = await evaluationRepository.getDecisionReasons(
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
              evaluatedAt: new Date(decision.evaluatedAt).toISOString(),
            };
          }

          return {
            ...snapshot,
            ...(eligibilityResult ? { eligibility: eligibilityResult } : {}),
            ...(fitResult ? { fit: fitResult } : {}),
            ...(qualityResult ? { quality: qualityResult } : {}),
            ...(decisionResult ? { decision: decisionResult } : {}),
          };
        }),
      );

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
    app.addHook('onClose', async () => {
      await options.database.close();
    });
  }

  return app;
}

function serializeProfile(profile: any) {
  return {
    candidate: {
      id: profile.candidate.id,
      createdAt: new Date(profile.candidate.createdAt).toISOString(),
      updatedAt: new Date(profile.candidate.updatedAt).toISOString(),
    },
    claims: profile.claims.map((claim: any) => ({
      id: claim.id,
      kind: claim.kind,
      value: claim.value,
      scope: claim.scope,
      state: claim.state,
      confidence: claim.confidence,
      createdAt: new Date(claim.createdAt).toISOString(),
      updatedAt: new Date(claim.updatedAt).toISOString(),
      evidence: claim.evidence.map((item: any) => ({
        ...item,
        createdAt: new Date(item.createdAt).toISOString(),
      })),
    })),
  };
}

async function sendRepositoryError(
  reply: Parameters<typeof sendCareerMemoryError>[0],
  requestId: string,
  error: CareerMemoryError,
) {
  const status =
    error.code === 'CANDIDATE_NOT_FOUND' || error.code === 'CLAIM_NOT_FOUND'
      ? 404
      : 409;
  await sendCareerMemoryError(reply, requestId, status, error.code);
}

async function sendCareerMemoryError(
  reply: FastifyReply,
  requestId: string,
  status: number,
  code: string,
) {
  await reply.status(status).send({
    error: {
      code,
      message:
        status === 404
          ? 'The requested candidate or claim was not found.'
          : status === 400
            ? 'The mutation payload is empty.'
            : 'The Career Memory mutation violates domain rules.',
      requestId,
    },
  });
}
