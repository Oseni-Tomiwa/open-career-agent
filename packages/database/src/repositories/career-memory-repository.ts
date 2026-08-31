import { createHash, randomUUID } from 'node:crypto';

import { and, asc, eq } from 'drizzle-orm';
import {
  canTransitionClaimState,
  claimStateTransitionRequiresEvidence,
  type CandidateId,
  type CareerMemoryClaimState,
  type ClaimId,
  type EvidenceId,
} from '@oca/domain';

import type { DatabaseHandle } from '../client.js';
import { getTables } from '../schema-helper.js';
import type { CLAIM_CONFIDENCE_LEVELS, EVIDENCE_STATES } from '../schema.js';
import { BackgroundTaskLedger } from '../task-ledger.js';

type ClaimConfidence = (typeof CLAIM_CONFIDENCE_LEVELS)[number];
type EvidenceState = (typeof EVIDENCE_STATES)[number];

export interface ManualEvidenceInput {
  readonly evidenceType: string;
  readonly sourceReference?: string;
  readonly excerpt: string;
  readonly state: Exclude<EvidenceState, 'source-verified'>;
}

export class CareerMemoryError extends Error {
  public constructor(
    message: string,
    public readonly code:
      | 'CANDIDATE_NOT_FOUND'
      | 'CLAIM_NOT_FOUND'
      | 'INVALID_TRANSITION'
      | 'EVIDENCE_REQUIRED'
      | 'IMMUTABLE_SUPPORTED_CONTENT'
      | 'INVALID_EVIDENCE',
  ) {
    super(message);
    this.name = 'CareerMemoryError';
  }
}

export class CareerMemoryRepository {
  private readonly ledger: BackgroundTaskLedger;

  public constructor(private readonly handle: DatabaseHandle) {
    this.ledger = new BackgroundTaskLedger(handle);
  }

  public async getProfile(candidateId: CandidateId): Promise<any | null> {
    const { candidates, candidateClaims } = getTables(this.handle);
    const db = this.handle.db as any;

    const candRows = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId));
    const candidate = candRows[0];
    if (!candidate) return null;

    const claimRows = await db
      .select()
      .from(candidateClaims)
      .where(eq(candidateClaims.candidateId, candidateId));

    const claims = await Promise.all(
      claimRows.map(async (claim: any) => ({
        ...claim,
        evidence: await this.getClaimEvidence(claim.id as ClaimId),
      })),
    );

    return { candidate, claims };
  }

  public async createClaim(
    input: {
      readonly candidateId: CandidateId;
      readonly kind: string;
      readonly value: string;
      readonly scope?: string;
      readonly state: 'UNKNOWN' | 'SUPPORTED';
      readonly confidence?: ClaimConfidence;
      readonly evidence?: ManualEvidenceInput;
    },
    timestamp = Date.now(),
  ): Promise<any> {
    await this.requireCandidate(input.candidateId);
    if (input.state === 'SUPPORTED') {
      if (!input.evidence || !isTrusted(input.evidence.state)) {
        throw new CareerMemoryError(
          'A supported claim requires candidate-confirmed Evidence.',
          'EVIDENCE_REQUIRED',
        );
      }
    }

    const claimId = `claim-${randomUUID()}` as ClaimId;
    const evidenceId = input.evidence
      ? (`evidence-${randomUUID()}` as EvidenceId)
      : null;
    const now = new Date(timestamp);
    const { candidateClaims, candidates } = getTables(this.handle);
    const db = this.handle.db as any;

    await db.transaction(async (transaction: any) => {
      await transaction.insert(candidateClaims).values({
        id: claimId,
        candidateId: input.candidateId,
        kind: normalize(input.kind, 'Claim kind'),
        value: normalize(input.value, 'Claim value'),
        scope: optional(input.scope),
        state: input.state,
        confidence: input.confidence ?? null,
        createdAt: now,
        updatedAt: now,
      });

      if (input.evidence && evidenceId) {
        await insertManualEvidence(
          this.handle,
          transaction,
          claimId,
          evidenceId,
          input.evidence,
          now,
        );
      }

      await transaction
        .update(candidates)
        .set({ updatedAt: now })
        .where(eq(candidates.id, input.candidateId));
    });

    await this.enqueueReevaluation(input.candidateId, claimId);
    return await this.requireClaim(input.candidateId, claimId);
  }

  public async updateClaim(
    input: {
      readonly candidateId: CandidateId;
      readonly claimId: ClaimId;
      readonly value?: string;
      readonly scope?: string | null;
      readonly state?: CareerMemoryClaimState;
      readonly confidence?: ClaimConfidence | null;
    },
    timestamp = Date.now(),
  ): Promise<any> {
    const current = await this.requireClaim(input.candidateId, input.claimId);
    const nextState = input.state ?? current.state;
    if (!canTransitionClaimState(current.state, nextState)) {
      throw new CareerMemoryError(
        `Claim state cannot transition from ${current.state} to ${nextState}.`,
        'INVALID_TRANSITION',
      );
    }
    const contentChanges =
      (input.value !== undefined &&
        normalize(input.value, 'Claim value') !== current.value) ||
      (input.scope !== undefined && optional(input.scope) !== current.scope);
    if (
      contentChanges &&
      (current.state === 'SUPPORTED' || current.state === 'CONFLICTING')
    ) {
      throw new CareerMemoryError(
        'Supported or conflicting claim content is immutable; create a corrected claim so historical Evidence remains coherent.',
        'IMMUTABLE_SUPPORTED_CONTENT',
      );
    }
    await this.requireTransitionEvidence(
      current.state,
      nextState,
      input.claimId,
    );

    const next = {
      value:
        input.value === undefined
          ? current.value
          : normalize(input.value, 'Claim value'),
      scope: input.scope === undefined ? current.scope : optional(input.scope),
      state: nextState,
      confidence:
        input.confidence === undefined ? current.confidence : input.confidence,
    };
    if (
      next.value === current.value &&
      next.scope === current.scope &&
      next.state === current.state &&
      next.confidence === current.confidence
    ) {
      return current;
    }

    const now = new Date(timestamp);
    const { candidateClaims, candidates } = getTables(this.handle);
    const db = this.handle.db as any;

    await db.transaction(async (transaction: any) => {
      await transaction
        .update(candidateClaims)
        .set({ ...next, updatedAt: now })
        .where(
          and(
            eq(candidateClaims.id, input.claimId),
            eq(candidateClaims.candidateId, input.candidateId),
          ),
        );
      await transaction
        .update(candidates)
        .set({ updatedAt: now })
        .where(eq(candidates.id, input.candidateId));
    });

    await this.enqueueReevaluation(input.candidateId, input.claimId);
    return await this.requireClaim(input.candidateId, input.claimId);
  }

  public async attachEvidence(
    input: {
      readonly candidateId: CandidateId;
      readonly claimId: ClaimId;
      readonly evidence: ManualEvidenceInput;
      readonly transitionTo?: CareerMemoryClaimState;
    },
    timestamp = Date.now(),
  ): Promise<{ claim: any; evidence: any }> {
    const current = await this.requireClaim(input.candidateId, input.claimId);
    validateManualEvidence(input.evidence);
    const existingList = await this.getClaimEvidence(input.claimId);
    const existing = existingList.find(
      (item) =>
        item.evidenceType ===
          normalize(input.evidence.evidenceType, 'Evidence type') &&
        item.sourceReference === sourceReference(input.evidence) &&
        item.excerpt ===
          normalize(input.evidence.excerpt, 'Evidence excerpt') &&
        item.state === input.evidence.state,
    );
    const nextState = input.transitionTo ?? current.state;
    if (!canTransitionClaimState(current.state, nextState)) {
      throw new CareerMemoryError(
        `Claim state cannot transition from ${current.state} to ${nextState}.`,
        'INVALID_TRANSITION',
      );
    }
    const required = claimStateTransitionRequiresEvidence(
      current.state,
      nextState,
    );
    if (
      required === 'trusted' &&
      !isTrusted(input.evidence.state) &&
      !(await this.hasEvidence(input.claimId, 'trusted'))
    ) {
      throw new CareerMemoryError(
        'This transition requires candidate-confirmed Evidence.',
        'EVIDENCE_REQUIRED',
      );
    }
    if (
      required === 'disputed' &&
      input.evidence.state !== 'disputed' &&
      !(await this.hasEvidence(input.claimId, 'disputed'))
    ) {
      throw new CareerMemoryError(
        'A conflicting claim requires disputed Evidence.',
        'EVIDENCE_REQUIRED',
      );
    }
    if (existing && nextState === current.state) {
      return { claim: current, evidence: existing };
    }

    const evidenceId = existing
      ? (existing.id as EvidenceId)
      : (`evidence-${randomUUID()}` as EvidenceId);
    const now = new Date(timestamp);
    const { candidateClaims, candidates } = getTables(this.handle);
    const db = this.handle.db as any;

    await db.transaction(async (transaction: any) => {
      if (!existing) {
        await insertManualEvidence(
          this.handle,
          transaction,
          input.claimId,
          evidenceId,
          input.evidence,
          now,
        );
      }
      if (nextState !== current.state) {
        await transaction
          .update(candidateClaims)
          .set({ state: nextState, updatedAt: now })
          .where(
            and(
              eq(candidateClaims.id, input.claimId),
              eq(candidateClaims.candidateId, input.candidateId),
            ),
          );
      }
      await transaction
        .update(candidates)
        .set({ updatedAt: now })
        .where(eq(candidates.id, input.candidateId));
    });

    await this.enqueueReevaluation(input.candidateId, input.claimId);
    const updatedClaim = await this.requireClaim(
      input.candidateId,
      input.claimId,
    );
    const updatedEvidence = (await this.getClaimEvidence(input.claimId)).find(
      (item) => item.id === evidenceId,
    )!;

    return {
      claim: updatedClaim,
      evidence: updatedEvidence,
    };
  }

  private async requireCandidate(candidateId: CandidateId): Promise<any> {
    const { candidates } = getTables(this.handle);
    const db = this.handle.db as any;
    const rows = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId));
    const candidate = rows[0];
    if (!candidate) {
      throw new CareerMemoryError(
        'Candidate not found.',
        'CANDIDATE_NOT_FOUND',
      );
    }
    return candidate;
  }

  private async requireClaim(
    candidateId: CandidateId,
    claimId: ClaimId,
  ): Promise<any> {
    await this.requireCandidate(candidateId);
    const { candidateClaims } = getTables(this.handle);
    const db = this.handle.db as any;
    const rows = await db
      .select()
      .from(candidateClaims)
      .where(
        and(
          eq(candidateClaims.id, claimId),
          eq(candidateClaims.candidateId, candidateId),
        ),
      );
    const claim = rows[0];
    if (!claim) {
      throw new CareerMemoryError('Claim not found.', 'CLAIM_NOT_FOUND');
    }
    return claim;
  }

  private async getClaimEvidence(claimId: ClaimId): Promise<readonly any[]> {
    const { evidence, candidateClaimEvidence } = getTables(this.handle);
    const db = this.handle.db as any;

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
      .where(eq(candidateClaimEvidence.claimId, claimId))
      .orderBy(asc(evidence.createdAt));
  }

  private async hasEvidence(
    claimId: ClaimId,
    required: 'trusted' | 'disputed',
  ): Promise<boolean> {
    const list = await this.getClaimEvidence(claimId);
    return list.some((item) =>
      required === 'trusted'
        ? isTrusted(item.state)
        : item.state === 'disputed',
    );
  }

  private async requireTransitionEvidence(
    from: CareerMemoryClaimState,
    to: CareerMemoryClaimState,
    claimId: ClaimId,
  ): Promise<void> {
    const required = claimStateTransitionRequiresEvidence(from, to);
    if (required && !(await this.hasEvidence(claimId, required))) {
      throw new CareerMemoryError(
        required === 'trusted'
          ? 'This transition requires candidate-confirmed Evidence.'
          : 'A conflicting claim requires disputed Evidence.',
        'EVIDENCE_REQUIRED',
      );
    }
  }

  private async enqueueReevaluation(
    candidateId: CandidateId,
    claimId: ClaimId,
  ): Promise<void> {
    const claim = await this.requireClaim(candidateId, claimId);
    const claimEvidences = await this.getClaimEvidence(claimId);

    const semanticInput = {
      kind: claim.kind,
      value: claim.value,
      scope: claim.scope,
      state: claim.state,
      confidence: claim.confidence,
      evidence: claimEvidences.map((item) => ({
        evidenceType: item.evidenceType,
        sourceReference: item.sourceReference,
        excerpt: item.excerpt,
        state: item.state,
      })),
    };
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(semanticInput))
      .digest('hex')
      .slice(0, 20);

    const { opportunitySnapshots } = getTables(this.handle);
    const db = this.handle.db as any;

    const snapshots = await db
      .select({ id: opportunitySnapshots.id })
      .from(opportunitySnapshots);

    for (const snapshot of snapshots) {
      await this.ledger.enqueue({
        taskType: 'eligibility.evaluate',
        payload: { snapshotId: snapshot.id, candidateId },
        idempotencyKey: `career-memory-${claimId}-${snapshot.id}-${fingerprint}`,
      });
    }
  }
}

function normalize(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} cannot be empty.`);
  return normalized;
}

function optional(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isTrusted(state: EvidenceState): boolean {
  return state === 'candidate-confirmed' || state === 'source-verified';
}

function sourceReference(input: ManualEvidenceInput): string {
  if (input.state === 'candidate-confirmed')
    return 'candidate-confirmed/manual';
  const reference = optional(input.sourceReference);
  if (!reference) {
    throw new CareerMemoryError(
      'Non-candidate-confirmed Evidence requires a source reference.',
      'INVALID_EVIDENCE',
    );
  }
  return reference;
}

function validateManualEvidence(input: ManualEvidenceInput): void {
  normalize(input.evidenceType, 'Evidence type');
  normalize(input.excerpt, 'Evidence excerpt');
  sourceReference(input);
}

async function insertManualEvidence(
  handle: DatabaseHandle,
  transaction: any,
  claimId: ClaimId,
  evidenceId: EvidenceId,
  input: ManualEvidenceInput,
  createdAt: Date,
): Promise<void> {
  validateManualEvidence(input);
  const { evidence, candidateClaimEvidence } = getTables(handle);

  await transaction.insert(evidence).values({
    id: evidenceId,
    evidenceType: normalize(input.evidenceType, 'Evidence type'),
    sourceReference: sourceReference(input),
    excerpt: normalize(input.excerpt, 'Evidence excerpt'),
    state: input.state,
    createdAt,
  });

  await transaction
    .insert(candidateClaimEvidence)
    .values({ claimId, evidenceId });
}
