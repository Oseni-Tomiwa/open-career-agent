import { setTimeout as delay } from 'node:timers/promises';

import type { BackgroundTask, BackgroundTaskLedger } from '@oca/database';
import type { Logger } from 'pino';

export type BackgroundTaskHandler = (
  task: BackgroundTask,
) => Promise<void> | void;

export interface WorkerOptions {
  readonly ledger: BackgroundTaskLedger;
  readonly handlers: Readonly<Record<string, BackgroundTaskHandler>>;
  readonly logger: Logger;
  readonly workerId: string;
  readonly pollIntervalMs: number;
  readonly leaseDurationMs: number;
  readonly random?: () => number;
}

export class BackgroundWorker {
  private readonly abortController = new AbortController();
  private readonly random: () => number;
  private running: Promise<void> | null = null;

  public constructor(private readonly options: WorkerOptions) {
    this.random = options.random ?? Math.random;
  }

  public start(): Promise<void> {
    if (!this.running) {
      this.running = this.runLoop();
    }
    return this.running;
  }

  public async stop(): Promise<void> {
    this.abortController.abort();
    await this.running;
  }

  public async runOnce(now = new Date()): Promise<boolean> {
    const recovered = this.options.ledger.recoverExpiredLeases(now);
    if (recovered.length > 0) {
      this.options.logger.warn(
        { count: recovered.length },
        'Recovered expired background task leases',
      );
    }

    const task = this.options.ledger.claimNext({
      leaseOwner: this.options.workerId,
      leaseDurationMs: this.options.leaseDurationMs,
      now,
    });

    if (!task) return false;

    const handler = this.options.handlers[task.taskType];
    if (!handler) {
      this.options.ledger.markFailed(
        task.id,
        this.options.workerId,
        `No handler registered for ${task.taskType}`,
      );
      this.options.logger.error(
        { taskId: task.id, taskType: task.taskType },
        'Background task has no handler',
      );
      return true;
    }

    try {
      await handler(task);
      this.options.ledger.markSucceeded(task.id, this.options.workerId);
      this.options.logger.info(
        { taskId: task.id, taskType: task.taskType },
        'Background task succeeded',
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown task error';
      const baseDelay = Math.min(60_000, 1000 * 2 ** (task.attempts - 1));
      const jitteredDelay = Math.round(
        baseDelay * (0.75 + this.random() * 0.5),
      );
      const retryAt = new Date(Date.now() + jitteredDelay);
      const updated = this.options.ledger.scheduleRetry(
        task.id,
        this.options.workerId,
        message,
        retryAt,
      );
      this.options.logger.warn(
        {
          taskId: task.id,
          taskType: task.taskType,
          state: updated.state,
          retryAt: updated.state === 'PENDING' ? retryAt.toISOString() : null,
        },
        'Background task failed',
      );
    }

    return true;
  }

  private async runLoop(): Promise<void> {
    while (!this.abortController.signal.aborted) {
      const processed = await this.runOnce();
      if (processed) continue;

      try {
        await delay(this.options.pollIntervalMs, undefined, {
          signal: this.abortController.signal,
        });
      } catch (error) {
        if (!this.abortController.signal.aborted) throw error;
      }
    }
  }
}

export const systemTaskHandlers: Readonly<
  Record<string, BackgroundTaskHandler>
> = {
  'system.noop': () => undefined,
};
