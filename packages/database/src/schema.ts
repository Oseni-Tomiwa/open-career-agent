import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const BACKGROUND_TASK_STATES = [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
] as const;

export type BackgroundTaskState = (typeof BACKGROUND_TASK_STATES)[number];

export const backgroundTasks = sqliteTable(
  'background_tasks',
  {
    id: text('id').primaryKey(),
    taskType: text('task_type').notNull(),
    payload: text('payload').notNull(),
    state: text('state', { enum: BACKGROUND_TASK_STATES })
      .notNull()
      .default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    availableAt: integer('available_at', { mode: 'timestamp_ms' }).notNull(),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: integer('lease_expires_at', { mode: 'timestamp_ms' }),
    idempotencyKey: text('idempotency_key'),
    lastError: text('last_error'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('background_tasks_idempotency_key_unique').on(
      table.idempotencyKey,
    ),
    index('background_tasks_claimable_idx').on(
      table.state,
      table.availableAt,
      table.createdAt,
    ),
    index('background_tasks_expired_lease_idx').on(
      table.state,
      table.leaseExpiresAt,
    ),
    check(
      'background_tasks_state_check',
      sql`${table.state} in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')`,
    ),
    check('background_tasks_attempts_check', sql`${table.attempts} >= 0`),
    check('background_tasks_max_attempts_check', sql`${table.maxAttempts} > 0`),
  ],
);

export const backgroundTaskEvents = sqliteTable(
  'background_task_events',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => backgroundTasks.id, { onDelete: 'cascade' }),
    fromState: text('from_state', { enum: BACKGROUND_TASK_STATES }),
    toState: text('to_state', { enum: BACKGROUND_TASK_STATES }).notNull(),
    detail: text('detail'),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('background_task_events_task_time_idx').on(
      table.taskId,
      table.occurredAt,
    ),
  ],
);

export type BackgroundTaskRow = typeof backgroundTasks.$inferSelect;
export type BackgroundTaskEventRow = typeof backgroundTaskEvents.$inferSelect;
