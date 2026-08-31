export {
  databaseIsReady,
  openDatabase,
  type DatabaseHandle,
} from './client.js';
export { applyMigrations } from './migrate.js';
export { getTables } from './schema-helper.js';
export {
  BACKGROUND_TASK_STATES,
  type BackgroundTaskEventRow,
} from './schema.js';
export {
  BackgroundTaskLedger,
  IdempotencyConflictError,
  TaskLeaseError,
  type BackgroundTask,
  type ClaimBackgroundTask,
  type EnqueueBackgroundTask,
} from './task-ledger.js';

export * from './schema.js';

// Repositories
export { CandidateRepository } from './repositories/candidate-repository.js';
export {
  AuthRepository,
  normalizeEmail,
  type AuthenticatedPrincipalRecord,
} from './repositories/auth-repository.js';
export {
  CareerMemoryRepository,
  CareerMemoryError,
  type ManualEvidenceInput,
} from './repositories/career-memory-repository.js';
export { OpportunityRepository } from './repositories/opportunity-repository.js';
export { EvaluationRepository } from './repositories/evaluation-repository.js';
export { EvidenceRepository } from './repositories/evidence-repository.js';
export { ApplicationRepository } from './repositories/application-repository.js';
export { SourceListingRepository } from './repositories/source-listing-repository.js';
export {
  SearchTargetRepository,
  type CreateSearchTargetInput,
  type UpdateSearchTargetInput,
  type DiscoveryRunRecord,
  type DiscoveryMatchRecord,
} from './repositories/search-target-repository.js';
export {
  TodayRepository,
  type TodayDashboardOptions,
} from './repositories/today-repository.js';
export {
  CareerSignalsRepository,
  type CareerSignalsOptions,
} from './repositories/career-signals-repository.js';
