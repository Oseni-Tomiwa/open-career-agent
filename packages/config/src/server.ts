import { Type } from '@sinclair/typebox';

import {
  parsePositiveInteger,
  parseUrl,
  validateConfiguration,
} from './validation.js';

const AppEnvironmentSchema = Type.Union([
  Type.Literal('development'),
  Type.Literal('test'),
  Type.Literal('production'),
]);

const IdentityModeSchema = Type.Union([
  Type.Literal('development'),
  Type.Literal('self-hosted'),
  Type.Literal('cloud'),
]);

const MigrationModeSchema = Type.Union([
  Type.Literal('auto'),
  Type.Literal('manual'),
]);

const ServerEnvironmentSchema = Type.Object(
  {
    APP_ENV: Type.Optional(AppEnvironmentSchema),
    IDENTITY_MODE: Type.Optional(IdentityModeSchema),
    TRUSTED_CANDIDATE_ID: Type.Optional(Type.String({ minLength: 1 })),
    MIGRATION_MODE: Type.Optional(MigrationModeSchema),
    SESSION_TTL_HOURS: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
    API_HOST: Type.Optional(Type.String({ minLength: 1 })),
    API_PORT: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
    SQLITE_DATABASE_PATH: Type.Optional(Type.String({ minLength: 1 })),
    WEB_ORIGIN: Type.Optional(Type.String({ minLength: 1 })),
    WORKER_POLL_INTERVAL_MS: Type.Optional(
      Type.String({ pattern: '^[0-9]+$' }),
    ),
    GREENHOUSE_BOARDS: Type.Optional(Type.String()),
    WORKER_LEASE_DURATION_MS: Type.Optional(
      Type.String({ pattern: '^[0-9]+$' }),
    ),
  },
  { additionalProperties: false },
);

export type ApplicationEnvironment = 'development' | 'test' | 'production';
export type IdentityMode = 'development' | 'self-hosted' | 'cloud';
export type MigrationMode = 'auto' | 'manual';

export interface SharedServerConfig {
  readonly environment: ApplicationEnvironment;
  readonly databasePath: string;
  readonly migrationMode: MigrationMode;
}

export interface ApiConfig extends SharedServerConfig {
  readonly host: string;
  readonly port: number;
  readonly webOrigin: string;
  readonly identityMode: IdentityMode;
  readonly trustedCandidateId?: string;
  readonly sessionTtlHours: number;
}

export interface WorkerConfig extends SharedServerConfig {
  readonly pollIntervalMs: number;
  readonly leaseDurationMs: number;
  readonly greenhouseBoards: readonly string[];
}

function selectEnvironment(input: NodeJS.ProcessEnv) {
  return {
    APP_ENV: input.APP_ENV,
    IDENTITY_MODE: input.IDENTITY_MODE,
    TRUSTED_CANDIDATE_ID: input.TRUSTED_CANDIDATE_ID,
    MIGRATION_MODE: input.MIGRATION_MODE,
    SESSION_TTL_HOURS: input.SESSION_TTL_HOURS,
    API_HOST: input.API_HOST,
    API_PORT: input.API_PORT,
    SQLITE_DATABASE_PATH: input.SQLITE_DATABASE_PATH,
    WEB_ORIGIN: input.WEB_ORIGIN,
    WORKER_POLL_INTERVAL_MS: input.WORKER_POLL_INTERVAL_MS,
    WORKER_LEASE_DURATION_MS: input.WORKER_LEASE_DURATION_MS,
    GREENHOUSE_BOARDS: input.GREENHOUSE_BOARDS,
  };
}

function parseServerEnvironment(input: NodeJS.ProcessEnv) {
  return validateConfiguration(
    'server',
    ServerEnvironmentSchema,
    selectEnvironment(input),
  );
}

export function parseApiConfig(input: NodeJS.ProcessEnv): ApiConfig {
  const environment = parseServerEnvironment(input);
  const applicationEnvironment = environment.APP_ENV ?? 'development';
  if (applicationEnvironment === 'production' && !environment.IDENTITY_MODE) {
    throw new Error(
      'Invalid server configuration: IDENTITY_MODE is required in production',
    );
  }
  const identityMode = environment.IDENTITY_MODE ?? 'development';
  if (
    applicationEnvironment === 'production' &&
    identityMode === 'development'
  ) {
    throw new Error(
      'Invalid server configuration: development identity is not allowed in production',
    );
  }
  if (
    applicationEnvironment === 'production' &&
    identityMode !== 'cloud' &&
    !environment.TRUSTED_CANDIDATE_ID
  ) {
    throw new Error(
      'Invalid server configuration: TRUSTED_CANDIDATE_ID is required for production trusted identity',
    );
  }
  const trustedCandidateId =
    identityMode === 'cloud'
      ? undefined
      : (environment.TRUSTED_CANDIDATE_ID ?? 'development-candidate');

  return {
    environment: applicationEnvironment,
    databasePath:
      environment.SQLITE_DATABASE_PATH ?? './data/open-career-agent.sqlite',
    host: environment.API_HOST ?? '127.0.0.1',
    port: parsePositiveInteger('API_PORT', environment.API_PORT ?? '3000'),
    webOrigin: parseUrl(
      'WEB_ORIGIN',
      environment.WEB_ORIGIN ?? 'http://localhost:5173',
    ),
    identityMode,
    migrationMode:
      environment.MIGRATION_MODE ??
      (identityMode === 'cloud' ? 'manual' : 'auto'),
    sessionTtlHours: parsePositiveInteger(
      'SESSION_TTL_HOURS',
      environment.SESSION_TTL_HOURS ?? '168',
    ),
    ...(trustedCandidateId ? { trustedCandidateId } : {}),
  };
}

export function parseWorkerConfig(input: NodeJS.ProcessEnv): WorkerConfig {
  const environment = parseServerEnvironment(input);

  return {
    environment: environment.APP_ENV ?? 'development',
    databasePath:
      environment.SQLITE_DATABASE_PATH ?? './data/open-career-agent.sqlite',
    migrationMode:
      environment.MIGRATION_MODE ??
      (environment.IDENTITY_MODE === 'cloud' ? 'manual' : 'auto'),
    pollIntervalMs: parsePositiveInteger(
      'WORKER_POLL_INTERVAL_MS',
      environment.WORKER_POLL_INTERVAL_MS ?? '1000',
    ),
    leaseDurationMs: parsePositiveInteger(
      'WORKER_LEASE_DURATION_MS',
      environment.WORKER_LEASE_DURATION_MS ?? '30000',
    ),
    greenhouseBoards: (environment.GREENHOUSE_BOARDS ?? 'stripe')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  };
}
