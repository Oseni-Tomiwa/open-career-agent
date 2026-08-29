import { eq } from 'drizzle-orm';
import type { DatabaseHandle } from '../client.js';
import { candidateClaims, candidates } from '../schema.js';
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
        state: claim.state,
        confidence: claim.confidence,
        createdAt: new Date(timestamp),
        updatedAt: new Date(timestamp),
      })
      .run();
  }

  public getClaims(candidateId: CandidateId) {
    return this.db.db
      .select()
      .from(candidateClaims)
      .where(eq(candidateClaims.candidateId, candidateId))
      .all();
  }
}
