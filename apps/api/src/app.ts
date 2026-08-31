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
    methods: ['GET', 'POST', 'PATCH'],
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
      const profile = repository.getProfile(
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
        repository.createClaim({ candidateId: cId, ...request.body });
        const profile = repository.getProfile(cId)!;
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
        repository.updateClaim({
          candidateId: cId,
          claimId: claimId(request.params.claimId),
          ...request.body,
        });
        return {
          ...serializeProfile(repository.getProfile(cId)!),
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
        repository.attachEvidence({
          candidateId: cId,
          claimId: claimId(request.params.claimId),
          ...request.body,
        });
        return await reply.status(201).send({
          ...serializeProfile(repository.getProfile(cId)!),
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
    (request) => {
      const repo = new SearchTargetRepository(options.database);
      const targets = repo.listSearchTargets(
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
        },
      },
    },
    async (request, reply) => {
      const repo = new SearchTargetRepository(options.database);
      const created = repo.createSearchTarget(
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
    async (request, reply) => {
      const repo = new SearchTargetRepository(options.database);
      const target = repo.getSearchTarget(
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
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const repo = new SearchTargetRepository(options.database);
      const updated = repo.updateSearchTarget(
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
    async (request, reply) => {
      const repo = new SearchTargetRepository(options.database);
      const deleted = repo.deleteSearchTarget(
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
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const repo = new SearchTargetRepository(options.database);
      const cId = candidateId(request.params.candidateId);
      const tId = searchTargetId(request.params.targetId);

      const target = repo.getSearchTarget(cId, tId);
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

      const runId = discoveryRunId(`dr_${crypto.randomUUID()}`);
      const runRecord = repo.createDiscoveryRun(
        runId,
        cId,
        tId,
        target.sources[0]?.sourceSystem ?? 'greenhouse',
      );

      const taskLedger = new BackgroundTaskLedger(options.database);
      taskLedger.enqueue({
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
    (request) => {
      const repo = new SearchTargetRepository(options.database);
      const runs = repo.listDiscoveryRuns(
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
    (request) => {
      const repo = new TodayRepository(options.database);
      const dashboard = repo.getTodayDashboard(
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
    (request) => {
      const repo = new CareerSignalsRepository(options.database);
      const signals = repo.getCareerSignals(
        candidateId(request.params.candidateId),
      );
      return signals;
    },
  );

  function buildApplicationDetail(
    app: NonNullable<ReturnType<ApplicationRepository['getApplication']>>,
    appRepo: ApplicationRepository,
    oppRepo: OpportunityRepository,
    evalRepo: EvaluationRepository,
  ) {
    const oppId = opportunityId(app.opportunityId);
    const snapshot = oppRepo.getLatestSnapshot(oppId);
    const sourceRepo = new SourceListingRepository(options.database);
    const sourceListing = sourceRepo.findListingByOpportunityId(
      app.opportunityId,
    );

    let currentDecision: {
      state: string;
      action: string | null;
      explanation: string;
    } | null = null;
    if (snapshot) {
      const dec = evalRepo.getCurrentDecision(
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

    const events = appRepo.getEvents(
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
      submittedAt: app.submittedAt ? app.submittedAt.toISOString() : null,
      followUpDueAt: app.followUpDueAt ? app.followUpDueAt.toISOString() : null,
      followUpNote: app.followUpNote ?? null,
      followUpCompletedAt: app.followUpCompletedAt
        ? app.followUpCompletedAt.toISOString()
        : null,
      note: app.note ?? null,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
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
      events: events.map((ev) => ({
        id: ev.id,
        applicationId: ev.applicationId,
        eventType: ev.eventType,
        detail: ev.detail,
        occurredAt: ev.occurredAt.toISOString(),
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
    (request) => {
      const cId = candidateId(request.params.candidateId);
      const appRepo = new ApplicationRepository(options.database);
      const oppRepo = new OpportunityRepository(options.database);
      const evalRepo = new EvaluationRepository(options.database);

      const apps = appRepo.listApplications(cId);
      const data = apps.map((app) => {
        const oppId = opportunityId(app.opportunityId);
        const snapshot = oppRepo.getLatestSnapshot(oppId);
        const dec = snapshot
          ? evalRepo.getCurrentDecision(cId, snapshotId(snapshot.id))
          : null;
        const events = appRepo.getEvents(cId, applicationId(app.id));
        const lastEvent = events.length > 0 ? events[events.length - 1] : null;

        return {
          id: app.id,
          opportunityId: app.opportunityId,
          title: snapshot?.title ?? 'Opportunity',
          organization: snapshot?.organization ?? null,
          location: snapshot?.location ?? null,
          status: app.status,
          currentDecision: dec ? dec.priority : null,
          submittedAt: app.submittedAt ? app.submittedAt.toISOString() : null,
          followUpDueAt: app.followUpDueAt
            ? app.followUpDueAt.toISOString()
            : null,
          lastEventAt: lastEvent
            ? lastEvent.occurredAt.toISOString()
            : app.updatedAt.toISOString(),
          createdAt: app.createdAt.toISOString(),
          updatedAt: app.updatedAt.toISOString(),
        };
      });

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
    async (request, reply) => {
      const cId = candidateId(request.params.candidateId);
      const appRepo = new ApplicationRepository(options.database);
      const oppRepo = new OpportunityRepository(options.database);
      const evalRepo = new EvaluationRepository(options.database);

      try {
        const app = appRepo.createApplication({
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
        return buildApplicationDetail(app, appRepo, oppRepo, evalRepo);
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
    async (request, reply) => {
      const cId = candidateId(request.params.candidateId);
      const appId = applicationId(request.params.applicationId);
      const appRepo = new ApplicationRepository(options.database);
      const oppRepo = new OpportunityRepository(options.database);
      const evalRepo = new EvaluationRepository(options.database);

      const app = appRepo.getApplication(cId, appId);
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

      return buildApplicationDetail(app, appRepo, oppRepo, evalRepo);
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
    async (request, reply) => {
      const cId = candidateId(request.params.candidateId);
      const appId = applicationId(request.params.applicationId);
      const appRepo = new ApplicationRepository(options.database);
      const oppRepo = new OpportunityRepository(options.database);
      const evalRepo = new EvaluationRepository(options.database);

      if (!appRepo.getApplication(cId, appId)) {
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
        const updated = appRepo.updateApplication({
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

        return buildApplicationDetail(updated, appRepo, oppRepo, evalRepo);
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
    async (request, reply) => {
      const cId = candidateId(request.params.candidateId);
      const appId = applicationId(request.params.applicationId);
      const appRepo = new ApplicationRepository(options.database);
      const oppRepo = new OpportunityRepository(options.database);
      const evalRepo = new EvaluationRepository(options.database);

      const app = appRepo.getApplication(cId, appId);
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

      appRepo.appendEvent({
        candidateId: cId,
        applicationId: appId,
        eventType: request.body.eventType,
        detail: request.body.detail,
      });

      return buildApplicationDetail(app, appRepo, oppRepo, evalRepo);
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
    async (request, reply) => {
      const cId = candidateId(request.params.candidateId);
      const appId = applicationId(request.params.applicationId);
      const appRepo = new ApplicationRepository(options.database);

      const app = appRepo.getApplication(cId, appId);
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

      const events = appRepo.getEvents(cId, appId);
      return {
        data: events.map((ev) => ({
          id: ev.id,
          applicationId: ev.applicationId,
          eventType: ev.eventType,
          detail: ev.detail,
          occurredAt: ev.occurredAt.toISOString(),
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
    (request) => {
      const repo = new OpportunityRepository(options.database);
      const evaluationRepository = new EvaluationRepository(options.database);
      const searchTargetRepo = new SearchTargetRepository(options.database);

      let summaries = repo.getOpportunitySummaries();

      if (request.query.candidateId) {
        const cId = candidateId(request.query.candidateId);
        const matchedOppIds = searchTargetRepo.getMatchedOpportunityIds(cId);
        const matchedSet = new Set(matchedOppIds);
        summaries = summaries.filter((item) =>
          matchedSet.has(opportunityId(item.id)),
        );
      }

      const data = summaries.map((item) => {
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

function serializeProfile(
  profile: NonNullable<ReturnType<CareerMemoryRepository['getProfile']>>,
) {
  return {
    candidate: {
      id: profile.candidate.id,
      createdAt: profile.candidate.createdAt.toISOString(),
      updatedAt: profile.candidate.updatedAt.toISOString(),
    },
    claims: profile.claims.map((claim) => ({
      id: claim.id,
      kind: claim.kind,
      value: claim.value,
      scope: claim.scope,
      state: claim.state,
      confidence: claim.confidence,
      createdAt: claim.createdAt.toISOString(),
      updatedAt: claim.updatedAt.toISOString(),
      evidence: claim.evidence.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
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
