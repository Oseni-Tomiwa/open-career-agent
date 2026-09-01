import { and, eq } from 'drizzle-orm';
import type { DatabaseHandle } from '../client.js';
import { getTables } from '../schema-helper.js';
import { BackgroundTaskLedger } from '../task-ledger.js';
import type { CandidateId, ClaimId } from '@oca/domain';

export class CandidateRepository {
  public constructor(private readonly db: DatabaseHandle) {}

  public async createCandidate(
    id: CandidateId,
    timestamp: number = Date.now(),
  ): Promise<void> {
    const { candidates } = getTables(this.db);
    const db = this.db.db as any;
    await db.insert(candidates).values({
      id,
      createdAt: new Date(timestamp),
      updatedAt: new Date(timestamp),
    });
  }

  public async getCandidate(id: CandidateId): Promise<any | null> {
    const { candidates } = getTables(this.db);
    const db = this.db.db as any;
    const rows = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, id));
    return rows[0] ?? null;
  }

  public async addClaim(
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
  ): Promise<void> {
    const { candidateClaims, opportunitySnapshots } = getTables(this.db);
    const db = this.db.db as any;

    await db.insert(candidateClaims).values({
      id: claim.id,
      candidateId: claim.candidateId,
      kind: claim.kind,
      value: claim.value,
      scope: claim.scope,
      state: claim.state,
      confidence: claim.confidence,
      subjectKey: `legacy:${claim.id}`,
      lifecycleState: 'CURRENT',
      createdAt: new Date(timestamp),
      updatedAt: new Date(timestamp),
    });

    const snapshots = await db
      .select({ id: opportunitySnapshots.id })
      .from(opportunitySnapshots);

    const ledger = new BackgroundTaskLedger(this.db);
    for (const snapshot of snapshots) {
      await ledger.enqueue({
        taskType: 'eligibility.evaluate',
        payload: { snapshotId: snapshot.id, candidateId: claim.candidateId },
        idempotencyKey: `eligibility-claim-${claim.id}-${snapshot.id}`,
      });
    }
  }

  public async getClaims(candidateId: CandidateId): Promise<readonly any[]> {
    const { candidateClaims } = getTables(this.db);
    const db = this.db.db as any;
    return await db
      .select()
      .from(candidateClaims)
      .where(
        and(
          eq(candidateClaims.candidateId, candidateId),
          eq(candidateClaims.lifecycleState, 'CURRENT'),
        ),
      );
  }
}
