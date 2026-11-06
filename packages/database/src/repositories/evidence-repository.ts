import {
  publicEvaluation,
  publicOpportunity,
  publicSnapshot,
} from '../public-opportunity-scope.js';
import { and, eq } from 'drizzle-orm';
import type { DatabaseHandle } from '../client.js';
import { getTables } from '../schema-helper.js';
import { BackgroundTaskLedger } from '../task-ledger.js';
import type { ClaimId, EvidenceId, SnapshotId, FindingId } from '@oca/domain';

export class EvidenceRepository {
  public constructor(private readonly db: DatabaseHandle) {}

  public async attachToClaim(
    claimId: ClaimId,
    ev: {
      id: EvidenceId;
      evidenceType: string;
      sourceReference: string;
      excerpt: string;
      state?:
        'source-verified' | 'candidate-confirmed' | 'unreviewed' | 'disputed';
    },
    timestamp: number = Date.now(),
  ): Promise<void> {
    const {
      evidence,
      candidateClaimEvidence,
      candidateClaims,
      opportunitySnapshots,
    } = getTables(this.db);
    const db = this.db.db as any;

    await db.transaction(async (tx: any) => {
      await tx.insert(evidence).values({
        id: ev.id,
        evidenceType: ev.evidenceType,
        sourceReference: ev.sourceReference,
        excerpt: ev.excerpt,
        state: ev.state ?? 'unreviewed',
        createdAt: new Date(timestamp),
      });

      await tx.insert(candidateClaimEvidence).values({
        claimId,
        evidenceId: ev.id,
      });
    });

    const claimRows = await db
      .select({ candidateId: candidateClaims.candidateId })
      .from(candidateClaims)
      .where(eq(candidateClaims.id, claimId));

    const claim = claimRows[0];
    if (claim) {
      const ledger = new BackgroundTaskLedger(this.db);
      const snapshots = await db
        .select({ id: opportunitySnapshots.id })
        .from(opportunitySnapshots)
        .where(publicOpportunity(opportunitySnapshots.opportunityId));

      for (const snapshot of snapshots) {
        await ledger.enqueue({
          taskType: 'eligibility.evaluate',
          payload: { snapshotId: snapshot.id, candidateId: claim.candidateId },
          idempotencyKey: `eligibility-evidence-${ev.id}-${snapshot.id}`,
        });
      }
    }
  }

  public async attachToSnapshot(
    snapshotId: SnapshotId,
    ev: {
      id: EvidenceId;
      evidenceType: string;
      sourceReference: string;
      excerpt: string;
      state?:
        'source-verified' | 'candidate-confirmed' | 'unreviewed' | 'disputed';
    },
    timestamp: number = Date.now(),
  ): Promise<void> {
    const { evidence, opportunitySnapshotEvidence } = getTables(this.db);
    const db = this.db.db as any;

    const { opportunitySnapshots } = getTables(this.db);
    const allowed = await db
      .select({ id: opportunitySnapshots.id })
      .from(opportunitySnapshots)
      .where(
        and(
          eq(opportunitySnapshots.id, snapshotId),
          publicSnapshot(opportunitySnapshots.id),
        ),
      );
    if (!allowed.length) throw new Error('Public evidence target not found');
    await db.transaction(async (tx: any) => {
      await tx.insert(evidence).values({
        id: ev.id,
        evidenceType: ev.evidenceType,
        sourceReference: ev.sourceReference,
        excerpt: ev.excerpt,
        state: ev.state ?? 'unreviewed',
        createdAt: new Date(timestamp),
      });

      await tx.insert(opportunitySnapshotEvidence).values({
        snapshotId,
        evidenceId: ev.id,
      });
    });
  }

  public async attachToFinding(
    findingId: FindingId,
    ev: {
      id: EvidenceId;
      evidenceType: string;
      sourceReference: string;
      excerpt: string;
      state?:
        'source-verified' | 'candidate-confirmed' | 'unreviewed' | 'disputed';
    },
    timestamp: number = Date.now(),
  ): Promise<void> {
    const { evidence, evaluationFindingEvidence, evaluationFindings } =
      getTables(this.db);
    const db = this.db.db as any;

    const allowed = await db
      .select({ id: evaluationFindings.id })
      .from(evaluationFindings)
      .where(
        and(
          eq(evaluationFindings.id, findingId),
          publicEvaluation(evaluationFindings.evaluationId),
        ),
      );
    if (!allowed.length) throw new Error('Public evidence target not found');
    await db.transaction(async (tx: any) => {
      await tx.insert(evidence).values({
        id: ev.id,
        evidenceType: ev.evidenceType,
        sourceReference: ev.sourceReference,
        excerpt: ev.excerpt,
        state: ev.state ?? 'unreviewed',
        createdAt: new Date(timestamp),
      });

      await tx.insert(evaluationFindingEvidence).values({
        findingId,
        evidenceId: ev.id,
      });
    });
  }

  public async getClaimEvidence(claimId: ClaimId): Promise<readonly any[]> {
    const { evidence, candidateClaimEvidence } = getTables(this.db);
    const db = this.db.db as any;

    return await db
      .select({
        id: evidence.id,
        evidenceType: evidence.evidenceType,
        sourceReference: evidence.sourceReference,
        excerpt: evidence.excerpt,
        state: evidence.state,
        createdAt: evidence.createdAt,
      })
      .from(evidence)
      .innerJoin(
        candidateClaimEvidence,
        eq(evidence.id, candidateClaimEvidence.evidenceId),
      )
      .where(eq(candidateClaimEvidence.claimId, claimId));
  }

  public async getFindingEvidence(
    findingId: FindingId,
  ): Promise<readonly any[]> {
    const { evidence, evaluationFindingEvidence, evaluationFindings } =
      getTables(this.db);
    const db = this.db.db as any;

    return await db
      .select({
        id: evidence.id,
        evidenceType: evidence.evidenceType,
        sourceReference: evidence.sourceReference,
        excerpt: evidence.excerpt,
        state: evidence.state,
        createdAt: evidence.createdAt,
      })
      .from(evidence)
      .innerJoin(
        evaluationFindingEvidence,
        eq(evidence.id, evaluationFindingEvidence.evidenceId),
      )
      .innerJoin(
        evaluationFindings,
        eq(evaluationFindings.id, evaluationFindingEvidence.findingId),
      )
      .where(
        and(
          eq(evaluationFindingEvidence.findingId, findingId),
          publicEvaluation(evaluationFindings.evaluationId),
        ),
      );
  }
}
