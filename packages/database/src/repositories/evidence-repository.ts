import { eq } from 'drizzle-orm';
import type { DatabaseHandle } from '../client.js';
import {
  evidence,
  candidateClaimEvidence,
  opportunitySnapshotEvidence,
  evaluationFindingEvidence,
} from '../schema.js';
import type { ClaimId, EvidenceId, SnapshotId, FindingId } from '@oca/domain';

export class EvidenceRepository {
  public constructor(private readonly db: DatabaseHandle) {}

  public attachToClaim(
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
  ): void {
    this.db.db.transaction((tx) => {
      tx.insert(evidence)
        .values({
          id: ev.id,
          evidenceType: ev.evidenceType,
          sourceReference: ev.sourceReference,
          excerpt: ev.excerpt,
          state: ev.state ?? 'unreviewed',
          createdAt: new Date(timestamp),
        })
        .run();

      tx.insert(candidateClaimEvidence)
        .values({
          claimId,
          evidenceId: ev.id,
        })
        .run();
    });
  }

  public attachToSnapshot(
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
  ): void {
    this.db.db.transaction((tx) => {
      tx.insert(evidence)
        .values({
          id: ev.id,
          evidenceType: ev.evidenceType,
          sourceReference: ev.sourceReference,
          excerpt: ev.excerpt,
          state: ev.state ?? 'unreviewed',
          createdAt: new Date(timestamp),
        })
        .run();

      tx.insert(opportunitySnapshotEvidence)
        .values({
          snapshotId,
          evidenceId: ev.id,
        })
        .run();
    });
  }

  public attachToFinding(
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
  ): void {
    this.db.db.transaction((tx) => {
      tx.insert(evidence)
        .values({
          id: ev.id,
          evidenceType: ev.evidenceType,
          sourceReference: ev.sourceReference,
          excerpt: ev.excerpt,
          state: ev.state ?? 'unreviewed',
          createdAt: new Date(timestamp),
        })
        .run();

      tx.insert(evaluationFindingEvidence)
        .values({
          findingId,
          evidenceId: ev.id,
        })
        .run();
    });
  }

  public getClaimEvidence(claimId: ClaimId) {
    return this.db.db
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
      .where(eq(candidateClaimEvidence.claimId, claimId))
      .all();
  }

  public getFindingEvidence(findingId: FindingId) {
    return this.db.db
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
      .where(eq(evaluationFindingEvidence.findingId, findingId))
      .all();
  }
}
