import { randomUUID } from 'node:crypto';

import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm';

import type { DatabaseHandle } from './client.js';
import {
  backgroundTaskEvents,
  backgroundTasks,
  type BackgroundTaskEventRow,
  type BackgroundTaskRow,
  type BackgroundTaskState,
} from './schema.js';

export interface BackgroundTask {
  readonly id: string;
  readonly taskType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly state: BackgroundTaskState;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly availableAt: Date;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: Date | null;
  readonly idempotencyKey: string | null;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EnqueueBackgroundTask {
  readonly taskType: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly idempotencyKey?: string;
  readonly maxAttempts?: number;
  readonly availableAt?: Date;
}

export interface ClaimBackgroundTask {
  readonly leaseOwner: string;
  readonly leaseDurationMs: number;
  readonly now?: Date;
}

export class TaskLeaseError extends Error {
  public constructor(taskId: string) {
    super(`Background task ${taskId} is not held by the supplied lease owner`);
    this.name = 'TaskLeaseError';
  }
}

export class IdempotencyConflictError extends Error {
  public constructor(key: string) {
    super(`Idempotency key ${key} is already used for different task input`);
    this.name = 'IdempotencyConflictError';
  }
}

function normalizeRequired(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${name} cannot be empty`);
  }
  return normalized;
}

function serializePayload(payload: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(payload);
}

function toBackgroundTask(row: BackgroundTaskRow): BackgroundTask {
  const payload: unknown = JSON.parse(row.payload);

  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new TypeError(`Background task ${row.id} has an invalid payload`);
  }

  return { ...row, payload: payload as Readonly<Record<string, unknown>> };
}

export class BackgroundTaskLedger {
  public constructor(private readonly handle: DatabaseHandle) {}

  public enqueue(input: EnqueueBackgroundTask): BackgroundTask {
    const taskType = normalizeRequired(input.taskType, 'taskType');
    const idempotencyKey = input.idempotencyKey?.trim() || null;
    const payload = serializePayload(input.payload ?? {});
    const maxAttempts = input.maxAttempts ?? 3;
    const now = new Date();
    const availableAt = input.availableAt ?? now;

    if (!Number.isSafeInteger(maxAttempts) || maxAttempts <= 0) {
      throw new TypeError('maxAttempts must be a positive integer');
    }

    return this.handle.db.transaction((transaction) => {
      const inserted = transaction
        .insert(backgroundTasks)
        .values({
          id: randomUUID(),
          taskType,
          payload,
          state: 'PENDING',
          attempts: 0,
          maxAttempts,
          availableAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          idempotencyKey,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning()
        .get();

      if (inserted) {
        transaction
          .insert(backgroundTaskEvents)
          .values({
            id: randomUUID(),
            taskId: inserted.id,
            fromState: null,
            toState: 'PENDING',
            detail: 'enqueued',
            occurredAt: now,
          })
          .run();
        return toBackgroundTask(inserted);
      }

      if (!idempotencyKey) {
        throw new Error(
          'Background task insert failed without an idempotency key',
        );
      }

      const existing = transaction
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.idempotencyKey, idempotencyKey))
        .get();

      if (!existing) {
        throw new Error('Idempotent background task could not be recovered');
      }

      if (
        existing.taskType !== taskType ||
        existing.payload !== payload ||
        existing.maxAttempts !== maxAttempts
      ) {
        throw new IdempotencyConflictError(idempotencyKey);
      }

      return toBackgroundTask(existing);
    });
  }

  public claimNext(input: ClaimBackgroundTask): BackgroundTask | null {
    const leaseOwner = normalizeRequired(input.leaseOwner, 'leaseOwner');
    if (
      !Number.isSafeInteger(input.leaseDurationMs) ||
      input.leaseDurationMs <= 0
    ) {
      throw new TypeError('leaseDurationMs must be a positive integer');
    }

    const now = input.now ?? new Date();
    const leaseExpiresAt = new Date(now.getTime() + input.leaseDurationMs);

    return this.handle.db.transaction((transaction) => {
      const claimed = transaction
        .update(backgroundTasks)
        .set({
          state: 'RUNNING',
          attempts: sql`${backgroundTasks.attempts} + 1`,
          leaseOwner,
          leaseExpiresAt,
          updatedAt: now,
        })
        .where(
          and(
            eq(backgroundTasks.state, 'PENDING'),
            lte(backgroundTasks.availableAt, now),
            sql`${backgroundTasks.attempts} < ${backgroundTasks.maxAttempts}`,
            eq(
              backgroundTasks.id,
              sql`(
                select ${backgroundTasks.id}
                from ${backgroundTasks}
                where ${backgroundTasks.state} = 'PENDING'
                  and ${backgroundTasks.availableAt} <= ${now.getTime()}
                  and ${backgroundTasks.attempts} < ${backgroundTasks.maxAttempts}
                order by ${backgroundTasks.availableAt}, ${backgroundTasks.createdAt}
                limit 1
              )`,
            ),
          ),
        )
        .returning()
        .get();

      if (!claimed) {
        return null;
      }

      transaction
        .insert(backgroundTaskEvents)
        .values({
          id: randomUUID(),
          taskId: claimed.id,
          fromState: 'PENDING',
          toState: 'RUNNING',
          detail: `leased by ${leaseOwner}`,
          occurredAt: now,
        })
        .run();

      return toBackgroundTask(claimed);
    });
  }

  public markSucceeded(
    taskId: string,
    leaseOwner: string,
    now = new Date(),
  ): BackgroundTask {
    return this.completeLease(taskId, leaseOwner, 'SUCCEEDED', null, now);
  }

  public markFailed(
    taskId: string,
    leaseOwner: string,
    error: string,
    now = new Date(),
  ): BackgroundTask {
    return this.completeLease(
      taskId,
      leaseOwner,
      'FAILED',
      normalizeRequired(error, 'error'),
      now,
    );
  }

  public scheduleRetry(
    taskId: string,
    leaseOwner: string,
    error: string,
    availableAt: Date,
    now = new Date(),
  ): BackgroundTask {
    const errorDetail = normalizeRequired(error, 'error');

    return this.handle.db.transaction((transaction) => {
      const current = transaction
        .select()
        .from(backgroundTasks)
        .where(
          and(
            eq(backgroundTasks.id, taskId),
            eq(backgroundTasks.state, 'RUNNING'),
            eq(backgroundTasks.leaseOwner, leaseOwner),
            sql`${backgroundTasks.leaseExpiresAt} > ${now.getTime()}`,
          ),
        )
        .get();

      if (!current) {
        throw new TaskLeaseError(taskId);
      }

      const nextState: BackgroundTaskState =
        current.attempts >= current.maxAttempts ? 'FAILED' : 'PENDING';

      const updated = transaction
        .update(backgroundTasks)
        .set({
          state: nextState,
          availableAt:
            nextState === 'PENDING' ? availableAt : current.availableAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: errorDetail,
          updatedAt: now,
        })
        .where(
          and(
            eq(backgroundTasks.id, taskId),
            eq(backgroundTasks.state, 'RUNNING'),
            eq(backgroundTasks.leaseOwner, leaseOwner),
            sql`${backgroundTasks.leaseExpiresAt} > ${now.getTime()}`,
          ),
        )
        .returning()
        .get();

      if (!updated) {
        throw new TaskLeaseError(taskId);
      }

      transaction
        .insert(backgroundTaskEvents)
        .values({
          id: randomUUID(),
          taskId,
          fromState: 'RUNNING',
          toState: nextState,
          detail: errorDetail,
          occurredAt: now,
        })
        .run();

      return toBackgroundTask(updated);
    });
  }

  public recoverExpiredLeases(now = new Date()): readonly BackgroundTask[] {
    return this.handle.db.transaction((transaction) => {
      const expired = transaction
        .select()
        .from(backgroundTasks)
        .where(
          and(
            eq(backgroundTasks.state, 'RUNNING'),
            isNotNull(backgroundTasks.leaseExpiresAt),
            lte(backgroundTasks.leaseExpiresAt, now),
          ),
        )
        .all();

      return expired.map((task) => {
        if (!task.leaseOwner) {
          throw new TaskLeaseError(task.id);
        }

        const nextState: BackgroundTaskState =
          task.attempts >= task.maxAttempts ? 'FAILED' : 'PENDING';
        const detail =
          nextState === 'FAILED'
            ? 'lease expired after final attempt'
            : 'expired lease recovered';

        const updated = transaction
          .update(backgroundTasks)
          .set({
            state: nextState,
            availableAt: nextState === 'PENDING' ? now : task.availableAt,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: detail,
            updatedAt: now,
          })
          .where(
            and(
              eq(backgroundTasks.id, task.id),
              eq(backgroundTasks.state, 'RUNNING'),
              eq(backgroundTasks.leaseOwner, task.leaseOwner),
              lte(backgroundTasks.leaseExpiresAt, now),
            ),
          )
          .returning()
          .get();

        if (!updated) {
          throw new TaskLeaseError(task.id);
        }

        transaction
          .insert(backgroundTaskEvents)
          .values({
            id: randomUUID(),
            taskId: task.id,
            fromState: 'RUNNING',
            toState: nextState,
            detail,
            occurredAt: now,
          })
          .run();

        return toBackgroundTask(updated);
      });
    });
  }

  public findById(taskId: string): BackgroundTask | null {
    const row = this.handle.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, taskId))
      .get();
    return row ? toBackgroundTask(row) : null;
  }

  public eventsFor(taskId: string): readonly BackgroundTaskEventRow[] {
    return this.handle.db
      .select()
      .from(backgroundTaskEvents)
      .where(eq(backgroundTaskEvents.taskId, taskId))
      .orderBy(asc(backgroundTaskEvents.occurredAt))
      .all();
  }

  private completeLease(
    taskId: string,
    leaseOwner: string,
    state: 'SUCCEEDED' | 'FAILED',
    detail: string | null,
    now: Date,
  ): BackgroundTask {
    return this.handle.db.transaction((transaction) => {
      const updated = transaction
        .update(backgroundTasks)
        .set({
          state,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: detail,
          updatedAt: now,
        })
        .where(
          and(
            eq(backgroundTasks.id, taskId),
            eq(backgroundTasks.state, 'RUNNING'),
            eq(backgroundTasks.leaseOwner, leaseOwner),
            sql`${backgroundTasks.leaseExpiresAt} > ${now.getTime()}`,
          ),
        )
        .returning()
        .get();

      if (!updated) {
        throw new TaskLeaseError(taskId);
      }

      transaction
        .insert(backgroundTaskEvents)
        .values({
          id: randomUUID(),
          taskId,
          fromState: 'RUNNING',
          toState: state,
          detail,
          occurredAt: now,
        })
        .run();

      return toBackgroundTask(updated);
    });
  }
}
