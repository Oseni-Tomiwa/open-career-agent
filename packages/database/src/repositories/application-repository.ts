import { eq } from 'drizzle-orm';
import type { DatabaseHandle } from '../client.js';
import { applicationEvents, applications } from '../schema.js';
import type { ApplicationId, CandidateId, EventId, OpportunityId } from '@oca/domain';

export class ApplicationRepository {
  public constructor(private readonly db: DatabaseHandle) {}

  public createApplication(
    application: {
      id: ApplicationId;
      candidateId: CandidateId;
      opportunityId: OpportunityId;
      status: 'Preparing' | 'Applied' | 'Assessment' | 'Interview' | 'Offer' | 'Rejected' | 'Withdrawn';
    },
    timestamp: number = Date.now(),
  ): void {
    this.db.db.insert(applications).values({
      id: application.id,
      candidateId: application.candidateId,
      opportunityId: application.opportunityId,
      status: application.status,
      createdAt: new Date(timestamp),
      updatedAt: new Date(timestamp),
    }).run();
  }

  public getApplication(id: ApplicationId) {
    const result = this.db.db.select()
      .from(applications)
      .where(eq(applications.id, id))
      .get();

    return result ?? null;
  }

  public updateStatus(
    id: ApplicationId,
    status: 'Preparing' | 'Applied' | 'Assessment' | 'Interview' | 'Offer' | 'Rejected' | 'Withdrawn',
    timestamp: number = Date.now(),
  ): void {
    this.db.db.update(applications)
      .set({
        status,
        updatedAt: new Date(timestamp),
      })
      .where(eq(applications.id, id)).run();
  }

  public appendEvent(
    event: {
      id: EventId;
      applicationId: ApplicationId;
      eventType: string;
      detail: string;
    },
    timestamp: number = Date.now(),
  ): void {
    this.db.db.insert(applicationEvents).values({
      id: event.id,
      applicationId: event.applicationId,
      eventType: event.eventType,
      detail: event.detail,
      occurredAt: new Date(timestamp),
    }).run();
  }

  public getEvents(applicationId: ApplicationId) {
    return this.db.db.select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, applicationId))
      .orderBy(applicationEvents.occurredAt).all();
  }
}
