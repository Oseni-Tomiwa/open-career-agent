import { eq } from 'drizzle-orm';
import type { DatabaseHandle } from '../client.js';
import {
  candidateClaims,
  candidates,
  opportunitySnapshots,
} from '../schema.js';
import { BackgroundTaskLedger } from '../task-ledger.js';
import type { CandidateId, ClaimId } from '@oca/domain';

export class CandidateRepository {
  public constructor(private readonly db: DatabaseHandle) {}

  public createCandidate(
    id: CandidateId,
    timestamp: number = Date.now(),
  ): void {
    this.db.db
      .insert(candidates)
      .values({
        id,
        createdAt: new Date(timestamp),
        updatedAt: new Date(timestamp),
      })
      .run();
  }

  public getCandidate(id: CandidateId) {
    const result = this.db.db
      .select()
      .from(candidates)
      .where(eq(candidates.id, id))
      .get();
    return result ?? null;
  }

  public addClaim(
    claim: {
      id: ClaimId;
      candidateId: CandidateId;
      kind: string;
      value: string;
      scope?: string;
      state:
        'SUPPORTED' | 'INFERRED' | 'UNKNOWN' | 'CONFLICTING' | 'UNSUPPORTED';
      confidence?: 'HIGH' | 'MODERATE' | 'LOW';
    },
    timestamp: number = Date.now(),
  ): void {
    this.db.db
      .insert(candidateClaims)
      .values({
        id: claim.id,
        candidateId: claim.candidateId,
        kind: claim.kind,
        value: claim.value,
        scope: claim.scope,
        state: claim.state,
        confidence: claim.confidence,
        createdAt: new Date(timestamp),
        updatedAt: new Date(timestamp),
      })
      .run();

    // Candidate knowledge is a material Evaluation input.  Enqueue targeted
    // reevaluation work for existing snapshots; ledger identity prevents a
    // duplicate command from producing a task storm.
    const ledger = new BackgroundTaskLedger(this.db);
    for (const snapshot of this.db.db
      .select({ id: opportunitySnapshots.id })
      .from(opportunitySnapshots)
      .all()) {
      ledger.enqueue({
        taskType: 'eligibility.evaluate',
        payload: { snapshotId: snapshot.id, candidateId: claim.candidateId },
        idempotencyKey: `eligibility-claim-${claim.id}-${snapshot.id}`,
      });
    }
  }

  public getClaims(candidateId: CandidateId) {
    return this.db.db
      .select()
      .from(candidateClaims)
      .where(eq(candidateClaims.candidateId, candidateId))
      .all();
  }
}
