import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type {
  ApplicationId,
  CandidateId,
  EventId,
  OpportunityId,
} from '@oca/domain';
import type { ApplicationStatus } from '@oca/schemas';

import type { DatabaseHandle } from '../client.js';
import {
  applicationEvents,
  applications,
  decisions,
  opportunitySnapshots,
} from '../schema.js';

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

  private findApplication(id: ApplicationId) {
    return (
      this.handle.db
        .select()
        .from(applications)
        .where(eq(applications.id, id))
        .get() ?? null
    );
  }

  public createApplication(
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
  ) {
    const existing = this.handle.db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.candidateId, input.candidateId),
          eq(applications.opportunityId, input.opportunityId),
        ),
      )
      .get();

    if (existing) {
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
      const dec = this.handle.db
        .select()
        .from(decisions)
        .where(eq(decisions.id, input.originatingDecisionId))
        .get();
      if (!dec || dec.candidateId !== input.candidateId) {
        throw new ApplicationError(
          'The originating Decision does not belong to this candidate.',
          'UNAUTHORIZED',
        );
      }
      const decisionSnapshot = this.handle.db
        .select({ opportunityId: opportunitySnapshots.opportunityId })
        .from(opportunitySnapshots)
        .where(eq(opportunitySnapshots.id, dec.snapshotId))
        .get();
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

    return this.handle.db.transaction((tx) => {
      tx.insert(applications)
        .values({
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
        })
        .run();

      const createEvId = `app-ev-${randomUUID()}` as EventId;
      tx.insert(applicationEvents)
        .values({
          id: createEvId,
          applicationId: appId,
          eventType: 'application_created',
          detail: `Application created with status ${appStatus}`,
          occurredAt: now,
        })
        .run();

      if (appStatus === 'Applied') {
        const submitEvId = `app-ev-${randomUUID()}` as EventId;
        tx.insert(applicationEvents)
          .values({
            id: submitEvId,
            applicationId: appId,
            eventType: 'application_submitted',
            detail: 'Application submitted to employer',
            occurredAt: submittedAt!,
          })
          .run();
      }

      if (input.note) {
        const noteEvId = `app-ev-${randomUUID()}` as EventId;
        tx.insert(applicationEvents)
          .values({
            id: noteEvId,
            applicationId: appId,
            eventType: 'note_added',
            detail: `Note added: ${input.note}`,
            occurredAt: now,
          })
          .run();
      }

      return this.findApplication(appId)!;
    });
  }

  public getApplication(cId: CandidateId, id: ApplicationId) {
    const result = this.handle.db
      .select()
      .from(applications)
      .where(and(eq(applications.id, id), eq(applications.candidateId, cId)))
      .get();

    return result ?? null;
  }

  public getApplicationByCandidateAndOpportunity(
    cId: CandidateId,
    oppId: OpportunityId,
  ) {
    const result = this.handle.db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.candidateId, cId),
          eq(applications.opportunityId, oppId),
        ),
      )
      .get();

    return result ?? null;
  }

  public listApplications(cId: CandidateId) {
    return this.handle.db
      .select()
      .from(applications)
      .where(eq(applications.candidateId, cId))
      .all();
  }

  public updateApplication(
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
  ) {
    const current = this.findApplication(input.id);
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

    if (input.expectedUpdatedAt) {
      const expectedMs = new Date(input.expectedUpdatedAt).getTime();
      if (expectedMs !== current.updatedAt.getTime()) {
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

    const now = new Date(Math.max(timestamp, current.updatedAt.getTime() + 1));
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

    const statusChanged = nextStatus !== current.status;
    const noteChanged =
      input.note !== undefined && input.note !== (current.note ?? null);
    const followUpDueChanged =
      input.followUpDueAt !== undefined &&
      input.followUpDueAt?.getTime() !== current.followUpDueAt?.getTime();
    const followUpNoteChanged =
      input.followUpNote !== undefined &&
      input.followUpNote !== (current.followUpNote ?? null);
    const followUpCompletionChanged =
      input.followUpCompletedAt !== undefined &&
      !repeatedCompletion &&
      input.followUpCompletedAt?.getTime() !==
        current.followUpCompletedAt?.getTime();
    if (
      !statusChanged &&
      !noteChanged &&
      !followUpDueChanged &&
      !followUpNoteChanged &&
      !followUpCompletionChanged
    ) {
      return current;
    }

    return this.handle.db.transaction((tx) => {
      const updateResult = tx
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
            eq(applications.updatedAt, current.updatedAt),
          ),
        )
        .run();

      if (updateResult.changes !== 1) {
        throw new ApplicationError(
          `Stale write conflict on application '${input.id}'.`,
          'STALE_WRITE_CONFLICT',
        );
      }

      if (statusChanged) {
        const evId = `app-ev-${randomUUID()}` as EventId;
        tx.insert(applicationEvents)
          .values({
            id: evId,
            applicationId: input.id,
            eventType: 'status_changed',
            detail: `Status changed from ${current.status} to ${nextStatus}`,
            occurredAt: now,
          })
          .run();

        if (transitionToApplied) {
          const submitEvId = `app-ev-${randomUUID()}` as EventId;
          tx.insert(applicationEvents)
            .values({
              id: submitEvId,
              applicationId: input.id,
              eventType: 'application_submitted',
              detail: 'Application submitted to employer',
              occurredAt: now,
            })
            .run();
        }
      }

      if (noteChanged) {
        const evId = `app-ev-${randomUUID()}` as EventId;
        tx.insert(applicationEvents)
          .values({
            id: evId,
            applicationId: input.id,
            eventType: 'note_added',
            detail: input.note ? `Note updated: ${input.note}` : 'Note cleared',
            occurredAt: now,
          })
          .run();
      }

      if (followUpDueChanged || followUpNoteChanged) {
        const evId = `app-ev-${randomUUID()}` as EventId;
        tx.insert(applicationEvents)
          .values({
            id: evId,
            applicationId: input.id,
            eventType: 'follow_up_set',
            detail: updatedFollowUpDueAt
              ? `Follow-up scheduled for ${updatedFollowUpDueAt.toISOString()}${updatedFollowUpNote ? `: ${updatedFollowUpNote}` : ''}`
              : 'Follow-up cleared',
            occurredAt: now,
          })
          .run();
      }

      if (
        input.followUpCompletedAt != null &&
        current.followUpCompletedAt == null
      ) {
        const evId = `app-ev-${randomUUID()}` as EventId;
        tx.insert(applicationEvents)
          .values({
            id: evId,
            applicationId: input.id,
            eventType: 'follow_up_completed',
            detail: 'Follow-up marked completed',
            occurredAt: now,
          })
          .run();
      }

      return this.findApplication(input.id)!;
    });
  }

  public appendEvent(
    event: {
      id?: EventId;
      candidateId: CandidateId;
      applicationId: ApplicationId;
      eventType: string;
      detail: string;
    },
    timestamp: number = Date.now(),
  ) {
    const app = this.getApplication(event.candidateId, event.applicationId);
    if (!app) {
      throw new ApplicationError(
        `Application '${event.applicationId}' not found for candidate.`,
        'NOT_FOUND',
      );
    }
    const evId = event.id ?? (`app-ev-${randomUUID()}` as EventId);
    const now = new Date(timestamp);
    this.handle.db
      .insert(applicationEvents)
      .values({
        id: evId,
        applicationId: event.applicationId,
        eventType: event.eventType,
        detail: event.detail,
        occurredAt: now,
      })
      .run();
    return evId;
  }

  public getEvents(cId: CandidateId, appId: ApplicationId) {
    if (!this.getApplication(cId, appId)) {
      throw new ApplicationError(
        `Application '${appId}' not found for candidate.`,
        'NOT_FOUND',
      );
    }
    return this.handle.db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, appId))
      .orderBy(applicationEvents.occurredAt)
      .all();
  }

  public updateStatus(
    candidate: CandidateId,
    id: ApplicationId,
    status: ApplicationStatus,
    timestamp: number = Date.now(),
  ): void {
    const app = this.getApplication(candidate, id);
    if (!app) {
      throw new ApplicationError(`Application ${id} not found`, 'NOT_FOUND');
    }
    this.updateApplication({ id, candidateId: candidate, status }, timestamp);
  }
}
