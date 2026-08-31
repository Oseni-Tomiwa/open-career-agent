import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type {
  ApplicationId,
  CandidateId,
  EventId,
  OpportunityId,
} from '@oca/domain';
import type { ApplicationStatus } from '@oca/schemas';

import type { DatabaseHandle } from '../client.js';
import { getTables } from '../schema-helper.js';

export class ApplicationError extends Error {
  public readonly statusCode: number;

  public constructor(
    message: string,
    public readonly code:
      | 'NOT_FOUND'
      | 'DUPLICATE_APPLICATION'
      | 'INVALID_TRANSITION'
      | 'STALE_WRITE_CONFLICT'
      | 'UNAUTHORIZED',
  ) {
    super(message);
    this.name = 'ApplicationError';
    this.statusCode =
      code === 'NOT_FOUND'
        ? 404
        : code === 'DUPLICATE_APPLICATION' || code === 'STALE_WRITE_CONFLICT'
          ? 409
          : code === 'UNAUTHORIZED'
            ? 403
            : 400;
  }
}

const ALLOWED_TRANSITIONS: Record<
  ApplicationStatus,
  readonly ApplicationStatus[]
> = {
  Saved: ['Preparing', 'Applied', 'Withdrawn', 'Closed'],
  Preparing: ['Applied', 'Withdrawn', 'Closed'],
  Applied: [
    'Assessment',
    'Interview',
    'Offer',
    'Rejected',
    'Withdrawn',
    'Closed',
  ],
  Assessment: ['Interview', 'Offer', 'Rejected', 'Withdrawn', 'Closed'],
  Interview: ['Offer', 'Rejected', 'Withdrawn', 'Closed'],
  Offer: ['Closed', 'Withdrawn'],
  Rejected: [],
  Withdrawn: [],
  Closed: [],
};

export function validateTransition(
  currentStatus: ApplicationStatus,
  nextStatus: ApplicationStatus,
): void {
  if (currentStatus === nextStatus) return;
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw new ApplicationError(
      `Invalid application status transition from '${currentStatus}' to '${nextStatus}'.`,
      'INVALID_TRANSITION',
    );
  }
}

export class ApplicationRepository {
  public constructor(private readonly handle: DatabaseHandle) {}

  private async findApplication(id: ApplicationId): Promise<any | null> {
    const { applications } = getTables(this.handle);
    const db = this.handle.db as any;

    const rows = await db
      .select()
      .from(applications)
      .where(eq(applications.id, id));
    return rows[0] ?? null;
  }

  public async createApplication(
    input: {
      id?: ApplicationId;
      candidateId: CandidateId;
      opportunityId: OpportunityId;
      status?: ApplicationStatus;
      originatingDecisionId?: string | null;
      note?: string | null;
      appliedAt?: Date | null;
    },
    timestamp: number = Date.now(),
  ): Promise<any> {
    const { applications, decisions, opportunitySnapshots, applicationEvents } =
      getTables(this.handle);
    const db = this.handle.db as any;

    const existingRows = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.candidateId, input.candidateId),
          eq(applications.opportunityId, input.opportunityId),
        ),
      );

    if (existingRows.length > 0) {
      throw new ApplicationError(
        `An application already exists for candidate '${input.candidateId}' and opportunity '${input.opportunityId}'.`,
        'DUPLICATE_APPLICATION',
      );
    }

    const appStatus: ApplicationStatus = input.status ?? 'Saved';
    const appId = input.id ?? (`app-${randomUUID()}` as ApplicationId);
    const now = new Date(timestamp);
    if (input.appliedAt && appStatus !== 'Applied') {
      throw new ApplicationError(
        'appliedAt is only valid when the initial status is Applied.',
        'INVALID_TRANSITION',
      );
    }

    let originatingState: string | null = null;
    let originatingAction: string | null = null;

    if (input.originatingDecisionId) {
      const decRows = await db
        .select()
        .from(decisions)
        .where(eq(decisions.id, input.originatingDecisionId));
      const dec = decRows[0];

      if (!dec || dec.candidateId !== input.candidateId) {
        throw new ApplicationError(
          'The originating Decision does not belong to this candidate.',
          'UNAUTHORIZED',
        );
      }
      const snapRows = await db
        .select({ opportunityId: opportunitySnapshots.opportunityId })
        .from(opportunitySnapshots)
        .where(eq(opportunitySnapshots.id, dec.snapshotId));
      const decisionSnapshot = snapRows[0];

      if (decisionSnapshot?.opportunityId !== input.opportunityId) {
        throw new ApplicationError(
          'The originating Decision does not belong to this opportunity.',
          'INVALID_TRANSITION',
        );
      }
      originatingState = dec.priority;
      originatingAction = dec.action ?? null;
    }

    const submittedAt =
      appStatus === 'Applied' ? (input.appliedAt ?? now) : null;

    return await db.transaction(async (tx: any) => {
      await tx.insert(applications).values({
        id: appId,
        candidateId: input.candidateId,
        opportunityId: input.opportunityId,
        status: appStatus,
        originatingDecisionId: input.originatingDecisionId ?? null,
        originatingDecisionState: originatingState,
        originatingDecisionAction: originatingAction,
        submittedAt,
        followUpDueAt: null,
        followUpNote: null,
        followUpCompletedAt: null,
        note: input.note ?? null,
        createdAt: now,
        updatedAt: now,
      });

      const createEvId = `app-ev-${randomUUID()}` as EventId;
      await tx.insert(applicationEvents).values({
        id: createEvId,
        applicationId: appId,
        eventType: 'application_created',
        detail: `Application created with status ${appStatus}`,
        occurredAt: now,
      });

      if (appStatus === 'Applied') {
        const submitEvId = `app-ev-${randomUUID()}` as EventId;
        await tx.insert(applicationEvents).values({
          id: submitEvId,
          applicationId: appId,
          eventType: 'application_submitted',
          detail: 'Application submitted to employer',
          occurredAt: submittedAt!,
        });
      }

      if (input.note) {
        const noteEvId = `app-ev-${randomUUID()}` as EventId;
        await tx.insert(applicationEvents).values({
          id: noteEvId,
          applicationId: appId,
          eventType: 'note_added',
          detail: `Note added: ${input.note}`,
          occurredAt: now,
        });
      }

      const rows = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, appId));
      return rows[0] ?? null;
    });
  }

  public async getApplication(
    cId: CandidateId,
    id: ApplicationId,
  ): Promise<any | null> {
    const { applications } = getTables(this.handle);
    const db = this.handle.db as any;

    const rows = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, id), eq(applications.candidateId, cId)));

    return rows[0] ?? null;
  }

  public async getApplicationByCandidateAndOpportunity(
    cId: CandidateId,
    oppId: OpportunityId,
  ): Promise<any | null> {
    const { applications } = getTables(this.handle);
    const db = this.handle.db as any;

    const rows = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.candidateId, cId),
          eq(applications.opportunityId, oppId),
        ),
      );

    return rows[0] ?? null;
  }

  public async listApplications(cId: CandidateId): Promise<readonly any[]> {
    const { applications } = getTables(this.handle);
    const db = this.handle.db as any;

    return await db
      .select()
      .from(applications)
      .where(eq(applications.candidateId, cId));
  }

  public async updateApplication(
    input: {
      id: ApplicationId;
      candidateId: CandidateId;
      status?: ApplicationStatus;
      expectedUpdatedAt?: string | Date;
      note?: string | null;
      followUpDueAt?: Date | null;
      followUpNote?: string | null;
      followUpCompletedAt?: Date | null;
    },
    timestamp: number = Date.now(),
  ): Promise<any> {
    const current = await this.findApplication(input.id);
    if (!current) {
      throw new ApplicationError(
        `Application '${input.id}' not found.`,
        'NOT_FOUND',
      );
    }

    if (current.candidateId !== input.candidateId) {
      throw new ApplicationError(
        `Unauthorized access to application '${input.id}'.`,
        'UNAUTHORIZED',
      );
    }

    const currentUpdatedAtDate =
      current.updatedAt instanceof Date
        ? current.updatedAt
        : new Date(current.updatedAt);

    if (input.expectedUpdatedAt) {
      const expectedMs = new Date(input.expectedUpdatedAt).getTime();
      if (expectedMs !== currentUpdatedAtDate.getTime()) {
        throw new ApplicationError(
          `Stale write conflict on application '${input.id}'.`,
          'STALE_WRITE_CONFLICT',
        );
      }
    }

    const nextStatus = input.status ?? current.status;
    if (nextStatus !== current.status) {
      validateTransition(current.status, nextStatus);
    }

    const now = new Date(
      Math.max(timestamp, currentUpdatedAtDate.getTime() + 1),
    );
    const transitionToApplied =
      current.status !== 'Applied' && nextStatus === 'Applied';
    const submittedAt = transitionToApplied ? now : current.submittedAt;

    const updatedNote =
      input.note !== undefined ? input.note : (current.note ?? null);
    const updatedFollowUpDueAt =
      input.followUpDueAt !== undefined
        ? input.followUpDueAt
        : (current.followUpDueAt ?? null);
    const updatedFollowUpNote =
      input.followUpNote !== undefined
        ? input.followUpNote
        : (current.followUpNote ?? null);
    const repeatedCompletion =
      current.followUpCompletedAt !== null &&
      current.followUpCompletedAt !== undefined &&
      input.followUpCompletedAt !== null &&
      input.followUpCompletedAt !== undefined;
    const updatedFollowUpCompletedAt = repeatedCompletion
      ? current.followUpCompletedAt
      : input.followUpCompletedAt !== undefined
        ? input.followUpCompletedAt
        : (current.followUpCompletedAt ?? null);

    const currentFollowUpDueMs = current.followUpDueAt
      ? current.followUpDueAt instanceof Date
        ? current.followUpDueAt.getTime()
        : new Date(current.followUpDueAt).getTime()
      : null;
    const currentFollowUpCompletedMs = current.followUpCompletedAt
      ? current.followUpCompletedAt instanceof Date
        ? current.followUpCompletedAt.getTime()
        : new Date(current.followUpCompletedAt).getTime()
      : null;

    const statusChanged = nextStatus !== current.status;
    const noteChanged =
      input.note !== undefined && input.note !== (current.note ?? null);
    const followUpDueChanged =
      input.followUpDueAt !== undefined &&
      input.followUpDueAt?.getTime() !== currentFollowUpDueMs;
    const followUpNoteChanged =
      input.followUpNote !== undefined &&
      input.followUpNote !== (current.followUpNote ?? null);
    const followUpCompletionChanged =
      input.followUpCompletedAt !== undefined &&
      !repeatedCompletion &&
      input.followUpCompletedAt?.getTime() !== currentFollowUpCompletedMs;

    if (
      !statusChanged &&
      !noteChanged &&
      !followUpDueChanged &&
      !followUpNoteChanged &&
      !followUpCompletionChanged
    ) {
      return current;
    }

    const expectedDate = input.expectedUpdatedAt
      ? new Date(input.expectedUpdatedAt)
      : currentUpdatedAtDate;

    const { applications, applicationEvents } = getTables(this.handle);
    const db = this.handle.db as any;

    return await db.transaction(async (tx: any) => {
      const updateResult = await tx
        .update(applications)
        .set({
          status: nextStatus,
          submittedAt,
          note: updatedNote,
          followUpDueAt: updatedFollowUpDueAt,
          followUpNote: updatedFollowUpNote,
          followUpCompletedAt: updatedFollowUpCompletedAt,
          updatedAt: now,
        })
        .where(
          and(
            eq(applications.id, input.id),
            eq(applications.candidateId, input.candidateId),
            this.handle.engine === 'postgres'
              ? sql`date_trunc('milliseconds', ${applications.updatedAt}) = date_trunc('milliseconds', ${expectedDate.toISOString()}::timestamptz)`
              : eq(applications.updatedAt, expectedDate),
          ),
        )
        .returning();

      if (updateResult.length !== 1) {
        throw new ApplicationError(
          `Stale write conflict on application '${input.id}'.`,
          'STALE_WRITE_CONFLICT',
        );
      }

      if (statusChanged) {
        const evId = `app-ev-${randomUUID()}` as EventId;
        await tx.insert(applicationEvents).values({
          id: evId,
          applicationId: input.id,
          eventType: 'status_changed',
          detail: `Status changed from ${current.status} to ${nextStatus}`,
          occurredAt: now,
        });

        if (transitionToApplied) {
          const submitEvId = `app-ev-${randomUUID()}` as EventId;
          await tx.insert(applicationEvents).values({
            id: submitEvId,
            applicationId: input.id,
            eventType: 'application_submitted',
            detail: 'Application submitted to employer',
            occurredAt: now,
          });
        }
      }

      if (noteChanged) {
        const evId = `app-ev-${randomUUID()}` as EventId;
        await tx.insert(applicationEvents).values({
          id: evId,
          applicationId: input.id,
          eventType: 'note_added',
          detail: input.note ? `Note updated: ${input.note}` : 'Note cleared',
          occurredAt: now,
        });
      }

      if (followUpDueChanged || followUpNoteChanged) {
        const evId = `app-ev-${randomUUID()}` as EventId;
        await tx.insert(applicationEvents).values({
          id: evId,
          applicationId: input.id,
          eventType: 'follow_up_set',
          detail: updatedFollowUpDueAt
            ? `Follow-up scheduled for ${updatedFollowUpDueAt.toISOString()}${updatedFollowUpNote ? `: ${updatedFollowUpNote}` : ''}`
            : 'Follow-up cleared',
          occurredAt: now,
        });
      }

      if (
        input.followUpCompletedAt != null &&
        current.followUpCompletedAt == null
      ) {
        const evId = `app-ev-${randomUUID()}` as EventId;
        await tx.insert(applicationEvents).values({
          id: evId,
          applicationId: input.id,
          eventType: 'follow_up_completed',
          detail: 'Follow-up marked completed',
          occurredAt: now,
        });
      }

      const rows = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, input.id));
      return rows[0]!;
    });
  }

  public async appendEvent(
    event: {
      id?: EventId;
      candidateId: CandidateId;
      applicationId: ApplicationId;
      eventType: string;
      detail: string;
    },
    timestamp: number = Date.now(),
  ): Promise<EventId> {
    const app = await this.getApplication(
      event.candidateId,
      event.applicationId,
    );
    if (!app) {
      throw new ApplicationError(
        `Application '${event.applicationId}' not found for candidate.`,
        'NOT_FOUND',
      );
    }
    const evId = event.id ?? (`app-ev-${randomUUID()}` as EventId);
    const now = new Date(timestamp);
    const { applicationEvents } = getTables(this.handle);
    const db = this.handle.db as any;

    await db.insert(applicationEvents).values({
      id: evId,
      applicationId: event.applicationId,
      eventType: event.eventType,
      detail: event.detail,
      occurredAt: now,
    });

    return evId;
  }

  public async getEvents(
    cId: CandidateId,
    appId: ApplicationId,
  ): Promise<readonly any[]> {
    if (!(await this.getApplication(cId, appId))) {
      throw new ApplicationError(
        `Application '${appId}' not found for candidate.`,
        'NOT_FOUND',
      );
    }
    const { applicationEvents } = getTables(this.handle);
    const db = this.handle.db as any;

    return await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, appId))
      .orderBy(applicationEvents.occurredAt);
  }

  public async updateStatus(
    candidate: CandidateId,
    id: ApplicationId,
    status: ApplicationStatus,
    timestamp: number = Date.now(),
  ): Promise<void> {
    const app = await this.getApplication(candidate, id);
    if (!app) {
      throw new ApplicationError(`Application ${id} not found`, 'NOT_FOUND');
    }
    await this.updateApplication(
      { id, candidateId: candidate, status },
      timestamp,
    );
  }
}
