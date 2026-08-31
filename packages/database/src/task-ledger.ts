import { randomUUID } from 'node:crypto';

import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm';

import type { DatabaseHandle } from './client.js';
import { getTables } from './schema-helper.js';
import type { BackgroundTaskEventRow, BackgroundTaskState } from './schema.js';

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

function toBackgroundTask(row: any): BackgroundTask {
  const payload: unknown =
    typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;

  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new TypeError(`Background task ${row.id} has an invalid payload`);
  }

  return {
    id: row.id,
    taskType: row.taskType ?? row.task_type,
    payload: payload as Readonly<Record<string, unknown>>,
    state: row.state,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts ?? row.max_attempts,
    availableAt:
      row.availableAt instanceof Date
        ? row.availableAt
        : new Date(row.availableAt ?? row.available_at),
    leaseOwner: row.leaseOwner ?? row.lease_owner ?? null,
    leaseExpiresAt: row.leaseExpiresAt
      ? row.leaseExpiresAt instanceof Date
        ? row.leaseExpiresAt
        : new Date(row.leaseExpiresAt)
      : row.lease_expires_at
        ? new Date(row.lease_expires_at)
        : null,
    idempotencyKey: row.idempotencyKey ?? row.idempotency_key ?? null,
    lastError: row.lastError ?? row.last_error ?? null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt
        : new Date(row.createdAt ?? row.created_at),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt
        : new Date(row.updatedAt ?? row.updated_at),
  };
}

export class BackgroundTaskLedger {
  public constructor(private readonly handle: DatabaseHandle) {}

  public async enqueue(input: EnqueueBackgroundTask): Promise<BackgroundTask> {
    const taskType = normalizeRequired(input.taskType, 'taskType');
    const idempotencyKey = input.idempotencyKey?.trim() || null;
    const payload = serializePayload(input.payload ?? {});
    const maxAttempts = input.maxAttempts ?? 3;
    const now = new Date();
    const availableAt = input.availableAt ?? now;

    if (!Number.isSafeInteger(maxAttempts) || maxAttempts <= 0) {
      throw new TypeError('maxAttempts must be a positive integer');
    }

    const { backgroundTasks, backgroundTaskEvents } = getTables(this.handle);
    const db = this.handle.db as any;

    const insertedRows = await db
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
      .returning();

    const inserted = insertedRows[0];

    if (inserted) {
      await db.insert(backgroundTaskEvents).values({
        id: randomUUID(),
        taskId: inserted.id,
        fromState: null,
        toState: 'PENDING',
        detail: 'enqueued',
        occurredAt: now,
      });
      return toBackgroundTask(inserted);
    }

    if (!idempotencyKey) {
      throw new Error(
        'Background task insert failed without an idempotency key',
      );
    }

    const existingRows = await db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.idempotencyKey, idempotencyKey));
    const existing = existingRows[0];

    if (!existing) {
      throw new Error('Idempotent background task could not be recovered');
    }

    const existingTaskType = existing.taskType ?? existing.task_type;
    const existingPayload = existing.payload;
    const existingMaxAttempts = existing.maxAttempts ?? existing.max_attempts;

    if (
      existingTaskType !== taskType ||
      existingPayload !== payload ||
      existingMaxAttempts !== maxAttempts
    ) {
      throw new IdempotencyConflictError(idempotencyKey);
    }

    return toBackgroundTask(existing);
  }

  public async claimNext(
    input: ClaimBackgroundTask,
  ): Promise<BackgroundTask | null> {
    const leaseOwner = normalizeRequired(input.leaseOwner, 'leaseOwner');
    if (
      !Number.isSafeInteger(input.leaseDurationMs) ||
      input.leaseDurationMs <= 0
    ) {
      throw new TypeError('leaseDurationMs must be a positive integer');
    }

    const now = input.now ?? new Date();
    const leaseExpiresAt = new Date(now.getTime() + input.leaseDurationMs);

    if (this.handle.engine === 'postgres' && this.handle.pgPool) {
      const client = await this.handle.pgPool.connect();
      try {
        await client.query('BEGIN');
        const res = await client.query(
          `WITH target AS (
             SELECT id FROM background_tasks
             WHERE state = 'PENDING'
               AND available_at <= $1
               AND attempts < max_attempts
             ORDER BY available_at, created_at
             FOR UPDATE SKIP LOCKED
             LIMIT 1
           )
           UPDATE background_tasks
           SET state = 'RUNNING',
               attempts = background_tasks.attempts + 1,
               lease_owner = $2,
               lease_expires_at = $3,
               updated_at = $1
           FROM target
           WHERE background_tasks.id = target.id
           RETURNING background_tasks.*`,
          [now, leaseOwner, leaseExpiresAt],
        );

        if (res.rows.length === 0) {
          await client.query('COMMIT');
          return null;
        }

        const row = res.rows[0];
        const taskId = row.id;

        await client.query(
          `INSERT INTO background_task_events (id, task_id, from_state, to_state, detail, occurred_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            taskId,
            'PENDING',
            'RUNNING',
            `leased by ${leaseOwner}`,
            now,
          ],
        );

        await client.query('COMMIT');

        return toBackgroundTask(row);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const { backgroundTasks, backgroundTaskEvents } = getTables(this.handle);
    const db = this.handle.db as any;

    const claimedRows = await db
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
      .returning();

    const claimed = claimedRows[0];
    if (!claimed) return null;

    await db.insert(backgroundTaskEvents).values({
      id: randomUUID(),
      taskId: claimed.id,
      fromState: 'PENDING',
      toState: 'RUNNING',
      detail: `leased by ${leaseOwner}`,
      occurredAt: now,
    });

    return toBackgroundTask(claimed);
  }

  public async markSucceeded(
    taskId: string,
    leaseOwner: string,
    now = new Date(),
  ): Promise<BackgroundTask> {
    return this.completeLease(taskId, leaseOwner, 'SUCCEEDED', null, now);
  }

  public async markFailed(
    taskId: string,
    leaseOwner: string,
    error: string,
    now = new Date(),
  ): Promise<BackgroundTask> {
    return this.completeLease(
      taskId,
      leaseOwner,
      'FAILED',
      normalizeRequired(error, 'error'),
      now,
    );
  }

  public async scheduleRetry(
    taskId: string,
    leaseOwner: string,
    error: string,
    availableAt: Date,
    now = new Date(),
  ): Promise<BackgroundTask> {
    const errorDetail = normalizeRequired(error, 'error');
    const { backgroundTasks, backgroundTaskEvents } = getTables(this.handle);
    const db = this.handle.db as any;

    const currentRows = await db
      .select()
      .from(backgroundTasks)
      .where(
        and(
          eq(backgroundTasks.id, taskId),
          eq(backgroundTasks.state, 'RUNNING'),
          eq(backgroundTasks.leaseOwner, leaseOwner),
        ),
      );

    const current = currentRows[0];
    if (!current) throw new TaskLeaseError(taskId);

    const currentLeaseExpiresAt =
      current.leaseExpiresAt ?? current.lease_expires_at;
    const currentLeaseMs =
      currentLeaseExpiresAt instanceof Date
        ? currentLeaseExpiresAt.getTime()
        : new Date(currentLeaseExpiresAt).getTime();

    if (currentLeaseMs <= now.getTime()) {
      throw new TaskLeaseError(taskId);
    }

    const attempts = current.attempts;
    const maxAttempts = current.maxAttempts ?? current.max_attempts;
    const nextState: BackgroundTaskState =
      attempts >= maxAttempts ? 'FAILED' : 'PENDING';

    const updatedRows = await db
      .update(backgroundTasks)
      .set({
        state: nextState,
        availableAt:
          nextState === 'PENDING'
            ? availableAt
            : (current.availableAt ?? current.available_at),
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
        ),
      )
      .returning();

    const updated = updatedRows[0];
    if (!updated) throw new TaskLeaseError(taskId);

    await db.insert(backgroundTaskEvents).values({
      id: randomUUID(),
      taskId,
      fromState: 'RUNNING',
      toState: nextState,
      detail: errorDetail,
      occurredAt: now,
    });

    return toBackgroundTask(updated);
  }

  public async recoverExpiredLeases(
    now = new Date(),
  ): Promise<readonly BackgroundTask[]> {
    const { backgroundTasks, backgroundTaskEvents } = getTables(this.handle);
    const db = this.handle.db as any;

    const expired = await db
      .select()
      .from(backgroundTasks)
      .where(
        and(
          eq(backgroundTasks.state, 'RUNNING'),
          isNotNull(backgroundTasks.leaseExpiresAt),
          lte(backgroundTasks.leaseExpiresAt, now),
        ),
      );

    const recovered: BackgroundTask[] = [];

    for (const task of expired) {
      const leaseOwner = task.leaseOwner ?? task.lease_owner;
      if (!leaseOwner) continue;

      const attempts = task.attempts;
      const maxAttempts = task.maxAttempts ?? task.max_attempts;
      const nextState: BackgroundTaskState =
        attempts >= maxAttempts ? 'FAILED' : 'PENDING';
      const detail =
        nextState === 'FAILED'
          ? 'lease expired after final attempt'
          : 'expired lease recovered';

      const updatedRows = await db
        .update(backgroundTasks)
        .set({
          state: nextState,
          availableAt:
            nextState === 'PENDING'
              ? now
              : (task.availableAt ?? task.available_at),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: detail,
          updatedAt: now,
        })
        .where(
          and(
            eq(backgroundTasks.id, task.id),
            eq(backgroundTasks.state, 'RUNNING'),
            eq(backgroundTasks.leaseOwner, leaseOwner),
          ),
        )
        .returning();

      const updated = updatedRows[0];
      if (updated) {
        await db.insert(backgroundTaskEvents).values({
          id: randomUUID(),
          taskId: task.id,
          fromState: 'RUNNING',
          toState: nextState,
          detail,
          occurredAt: now,
        });
        recovered.push(toBackgroundTask(updated));
      }
    }

    return recovered;
  }

  public async findById(taskId: string): Promise<BackgroundTask | null> {
    const { backgroundTasks } = getTables(this.handle);
    const db = this.handle.db as any;
    const rows = await db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, taskId));
    const row = rows[0];
    return row ? toBackgroundTask(row) : null;
  }

  public async eventsFor(
    taskId: string,
  ): Promise<readonly BackgroundTaskEventRow[]> {
    const { backgroundTaskEvents } = getTables(this.handle);
    const db = this.handle.db as any;
    return await db
      .select()
      .from(backgroundTaskEvents)
      .where(eq(backgroundTaskEvents.taskId, taskId))
      .orderBy(asc(backgroundTaskEvents.occurredAt));
  }

  private async completeLease(
    taskId: string,
    leaseOwner: string,
    state: 'SUCCEEDED' | 'FAILED',
    detail: string | null,
    now: Date,
  ): Promise<BackgroundTask> {
    const { backgroundTasks, backgroundTaskEvents } = getTables(this.handle);
    const db = this.handle.db as any;

    const currentRows = await db
      .select()
      .from(backgroundTasks)
      .where(
        and(
          eq(backgroundTasks.id, taskId),
          eq(backgroundTasks.state, 'RUNNING'),
          eq(backgroundTasks.leaseOwner, leaseOwner),
        ),
      );

    const current = currentRows[0];
    if (!current) throw new TaskLeaseError(taskId);

    const currentLeaseExpiresAt =
      current.leaseExpiresAt ?? current.lease_expires_at;
    if (currentLeaseExpiresAt) {
      const currentLeaseMs =
        currentLeaseExpiresAt instanceof Date
          ? currentLeaseExpiresAt.getTime()
          : new Date(currentLeaseExpiresAt).getTime();
      if (currentLeaseMs <= now.getTime()) {
        throw new TaskLeaseError(taskId);
      }
    }

    const updatedRows = await db
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
        ),
      )
      .returning();

    const updated = updatedRows[0];
    if (!updated) {
      throw new TaskLeaseError(taskId);
    }

    await db.insert(backgroundTaskEvents).values({
      id: randomUUID(),
      taskId,
      fromState: 'RUNNING',
      toState: state,
      detail,
      occurredAt: now,
    });

    return toBackgroundTask(updated);
  }
}
