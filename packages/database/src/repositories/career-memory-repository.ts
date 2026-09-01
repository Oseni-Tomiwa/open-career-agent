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
import type {
  CLAIM_CONFIDENCE_LEVELS,
  CLAIM_SUCCESSION_TYPES,
  EVIDENCE_STATES,
} from '../schema.js';
import { BackgroundTaskLedger, type BackgroundTask } from '../task-ledger.js';

type ClaimConfidence = (typeof CLAIM_CONFIDENCE_LEVELS)[number];
type SuccessionType = (typeof CLAIM_SUCCESSION_TYPES)[number];
type EvidenceState = (typeof EVIDENCE_STATES)[number];

export interface ManualEvidenceInput {
  readonly evidenceType: string;
  readonly sourceReference?: string;
  readonly excerpt: string;
  readonly state: Exclude<EvidenceState, 'source-verified'>;
}

export interface CreateClaimInput {
  readonly kind: string;
  readonly value: string;
  readonly scope?: string;
  readonly state: 'UNKNOWN' | 'SUPPORTED';
  readonly confidence?: ClaimConfidence;
  readonly evidence?: ManualEvidenceInput;
}

export interface CareerProfileReevaluation {
  readonly id: string;
  readonly state: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  readonly taskCount: number;
  readonly completedTaskCount: number;
  readonly failedTaskCount: number;
  readonly requestedAt: Date;
  readonly updatedAt: Date;
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
      | 'INVALID_EVIDENCE'
      | 'DUPLICATE_CURRENT_CLAIM'
      | 'CLAIM_NOT_CURRENT'
      | 'REEVALUATION_NOT_FOUND',
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
    const { candidates, candidateClaims, candidateClaimEvidence, evidence } =
      getTables(this.handle);
    const db = this.handle.db as any;
    const candidate = (
      await db.select().from(candidates).where(eq(candidates.id, candidateId))
    )[0];
    if (!candidate) return null;
    const rows = await db
      .select()
      .from(candidateClaims)
      .where(eq(candidateClaims.candidateId, candidateId));
    const evidenceRows = await db
      .select({
        claimId: candidateClaimEvidence.claimId,
        id: evidence.id,
        evidenceType: evidence.evidenceType,
        sourceReference: evidence.sourceReference,
        excerpt: evidence.excerpt,
        state: evidence.state,
        createdAt: evidence.createdAt,
      })
      .from(candidateClaimEvidence)
      .innerJoin(evidence, eq(evidence.id, candidateClaimEvidence.evidenceId))
      .innerJoin(
        candidateClaims,
        eq(candidateClaims.id, candidateClaimEvidence.claimId),
      )
      .where(eq(candidateClaims.candidateId, candidateId))
      .orderBy(asc(evidence.createdAt));
    const evidenceByClaim = new Map<string, any[]>();
    for (const item of evidenceRows) {
      evidenceByClaim.set(item.claimId, [
        ...(evidenceByClaim.get(item.claimId) ?? []),
        {
          id: item.id,
          evidenceType: item.evidenceType,
          sourceReference: item.sourceReference,
          excerpt: item.excerpt,
          state: item.state,
          createdAt: item.createdAt,
        },
      ]);
    }
    const enriched = rows.map((claim: any) => ({
      ...claim,
      evidence: evidenceByClaim.get(claim.id) ?? [],
    }));
    const order = (left: any, right: any) =>
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id);
    return {
      candidate,
      claims: enriched
        .filter((claim: any) => claim.lifecycleState === 'CURRENT')
        .sort(order),
      historicalClaims: enriched
        .filter((claim: any) => claim.lifecycleState !== 'CURRENT')
        .sort(order),
    };
  }

  public async createClaim(
    input: CreateClaimInput & { readonly candidateId: CandidateId },
    timestamp = Date.now(),
  ): Promise<any> {
    const result = await this.createClaimsBatch(
      { candidateId: input.candidateId, claims: [input] },
      timestamp,
    );
    return result.claims[0];
  }

  public async createClaimsBatch(
    input: {
      readonly candidateId: CandidateId;
      readonly claims: readonly CreateClaimInput[];
    },
    timestamp = Date.now(),
  ): Promise<{
    claims: readonly any[];
    reevaluation: CareerProfileReevaluation;
  }> {
    await this.requireCandidate(input.candidateId);
    if (input.claims.length === 0 || input.claims.length > 100) {
      throw new TypeError(
        'A profile batch must contain between 1 and 100 items.',
      );
    }
    input.claims.forEach(validateCreateClaim);
    const subjectKeys = input.claims.map((claim) =>
      claimSubjectKey(claim.kind, claim.value),
    );
    if (new Set(subjectKeys).size !== subjectKeys.length) {
      throw new CareerMemoryError(
        'The batch contains duplicate current profile items.',
        'DUPLICATE_CURRENT_CLAIM',
      );
    }
    await this.rejectExistingSubjects(input.candidateId, subjectKeys);

    const now = new Date(timestamp);
    const records = input.claims.map((claim, index) => ({
      claim,
      claimId: `claim-${randomUUID()}` as ClaimId,
      evidenceId: claim.evidence
        ? (`evidence-${randomUUID()}` as EvidenceId)
        : null,
      subjectKey: subjectKeys[index]!,
    }));
    const { candidateClaims, candidates } = getTables(this.handle);
    const db = this.handle.db as any;
    await runProfileTransaction(db, async (transaction: any) => {
      for (const record of records) {
        await transaction.insert(candidateClaims).values({
          id: record.claimId,
          candidateId: input.candidateId,
          kind: normalize(record.claim.kind, 'Claim kind'),
          value: normalize(record.claim.value, 'Claim value'),
          scope: optional(record.claim.scope),
          state: record.claim.state,
          confidence: record.claim.confidence ?? null,
          subjectKey: record.subjectKey,
          lifecycleState: 'CURRENT',
          predecessorClaimId: null,
          successionType: null,
          successionNote: null,
          endedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        if (record.claim.evidence && record.evidenceId) {
          await insertManualEvidence(
            this.handle,
            transaction,
            record.claimId,
            record.evidenceId,
            record.claim.evidence,
            now,
          );
        }
      }
      await transaction
        .update(candidates)
        .set({ updatedAt: now })
        .where(eq(candidates.id, input.candidateId));
    });
    const reevaluation = await this.enqueueReevaluation(input.candidateId, now);
    const profile = (await this.getProfile(input.candidateId))!;
    const ids = new Set(records.map((record) => record.claimId));
    return {
      claims: profile.claims.filter((claim: any) => ids.has(claim.id)),
      reevaluation,
    };
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
  ): Promise<{
    claim: any;
    reevaluation: CareerProfileReevaluation | null;
  }> {
    const current = await this.requireCurrentClaim(
      input.candidateId,
      input.claimId,
    );
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
        'Supported or conflicting claim content is immutable; use Correct or Update so history remains coherent.',
        'IMMUTABLE_SUPPORTED_CONTENT',
      );
    }
    await this.requireTransitionEvidence(
      current.state,
      nextState,
      input.claimId,
    );
    const nextSubjectKey =
      input.value === undefined
        ? current.subjectKey
        : claimSubjectKey(current.kind, input.value);
    if (nextSubjectKey !== current.subjectKey) {
      await this.rejectExistingSubjects(
        input.candidateId,
        [nextSubjectKey],
        input.claimId,
      );
    }
    const next = {
      value:
        input.value === undefined
          ? current.value
          : normalize(input.value, 'Claim value'),
      scope: input.scope === undefined ? current.scope : optional(input.scope),
      state: nextState,
      confidence:
        input.confidence === undefined ? current.confidence : input.confidence,
      subjectKey: nextSubjectKey,
    };
    if (
      next.value === current.value &&
      next.scope === current.scope &&
      next.state === current.state &&
      next.confidence === current.confidence &&
      next.subjectKey === current.subjectKey
    ) {
      return { claim: current, reevaluation: null };
    }
    const now = new Date(timestamp);
    const { candidateClaims, candidates } = getTables(this.handle);
    const db = this.handle.db as any;
    await runProfileTransaction(db, async (transaction: any) => {
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
    return {
      claim: await this.requireCurrentClaim(input.candidateId, input.claimId),
      reevaluation: await this.enqueueReevaluation(input.candidateId, now),
    };
  }

  public async replaceClaim(
    input: {
      readonly candidateId: CandidateId;
      readonly claimId: ClaimId;
      readonly changeType: SuccessionType;
      readonly value: string;
      readonly scope?: string | null;
      readonly state: 'UNKNOWN' | 'SUPPORTED';
      readonly confidence?: ClaimConfidence | null;
      readonly evidence?: ManualEvidenceInput;
      readonly note?: string;
    },
    timestamp = Date.now(),
  ): Promise<{ claim: any; reevaluation: CareerProfileReevaluation }> {
    const current = await this.requireCurrentClaim(
      input.candidateId,
      input.claimId,
    );
    validateCreateClaim({
      kind: current.kind,
      value: input.value,
      ...(input.scope ? { scope: input.scope } : {}),
      state: input.state,
      ...(input.confidence ? { confidence: input.confidence } : {}),
      ...(input.evidence ? { evidence: input.evidence } : {}),
    });
    const now = new Date(timestamp);
    const nextId = `claim-${randomUUID()}` as ClaimId;
    const evidenceId = input.evidence
      ? (`evidence-${randomUUID()}` as EvidenceId)
      : null;
    const { candidateClaims, candidates } = getTables(this.handle);
    const db = this.handle.db as any;
    await runProfileTransaction(db, async (transaction: any) => {
      await transaction
        .update(candidateClaims)
        .set({
          lifecycleState: 'SUPERSEDED',
          endedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(candidateClaims.id, input.claimId),
            eq(candidateClaims.candidateId, input.candidateId),
            eq(candidateClaims.lifecycleState, 'CURRENT'),
          ),
        );
      await transaction.insert(candidateClaims).values({
        id: nextId,
        candidateId: input.candidateId,
        kind: current.kind,
        value: normalize(input.value, 'Claim value'),
        scope: optional(input.scope),
        state: input.state,
        confidence: input.confidence ?? null,
        subjectKey: current.subjectKey,
        lifecycleState: 'CURRENT',
        predecessorClaimId: current.id,
        successionType: input.changeType,
        successionNote: optional(input.note),
        endedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      if (input.evidence && evidenceId) {
        await insertManualEvidence(
          this.handle,
          transaction,
          nextId,
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
    return {
      claim: await this.requireCurrentClaim(input.candidateId, nextId),
      reevaluation: await this.enqueueReevaluation(input.candidateId, now),
    };
  }

  public async retireClaim(
    input: {
      readonly candidateId: CandidateId;
      readonly claimId: ClaimId;
      readonly note?: string;
    },
    timestamp = Date.now(),
  ): Promise<CareerProfileReevaluation> {
    await this.requireCurrentClaim(input.candidateId, input.claimId);
    const now = new Date(timestamp);
    const { candidateClaims, candidates } = getTables(this.handle);
    const db = this.handle.db as any;
    await runProfileTransaction(db, async (transaction: any) => {
      await transaction
        .update(candidateClaims)
        .set({
          lifecycleState: 'RETIRED',
          successionNote: optional(input.note),
          endedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(candidateClaims.id, input.claimId),
            eq(candidateClaims.candidateId, input.candidateId),
            eq(candidateClaims.lifecycleState, 'CURRENT'),
          ),
        );
      await transaction
        .update(candidates)
        .set({ updatedAt: now })
        .where(eq(candidates.id, input.candidateId));
    });
    return await this.enqueueReevaluation(input.candidateId, now);
  }

  public async attachEvidence(
    input: {
      readonly candidateId: CandidateId;
      readonly claimId: ClaimId;
      readonly evidence: ManualEvidenceInput;
      readonly transitionTo?: CareerMemoryClaimState;
    },
    timestamp = Date.now(),
  ): Promise<{
    claim: any;
    evidence: any;
    reevaluation: CareerProfileReevaluation | null;
  }> {
    const current = await this.requireCurrentClaim(
      input.candidateId,
      input.claimId,
    );
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
      return { claim: current, evidence: existing, reevaluation: null };
    }
    const evidenceId = existing
      ? (existing.id as EvidenceId)
      : (`evidence-${randomUUID()}` as EvidenceId);
    const now = new Date(timestamp);
    const { candidateClaims, candidates } = getTables(this.handle);
    const db = this.handle.db as any;
    await runProfileTransaction(db, async (transaction: any) => {
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
    return {
      claim: await this.requireCurrentClaim(input.candidateId, input.claimId),
      evidence: (await this.getClaimEvidence(input.claimId)).find(
        (item) => item.id === evidenceId,
      )!,
      reevaluation: await this.enqueueReevaluation(input.candidateId, now),
    };
  }

  public async getReevaluation(
    candidateId: CandidateId,
    reevaluationId: string,
  ): Promise<CareerProfileReevaluation> {
    await this.requireCandidate(candidateId);
    const { careerProfileReevaluations, backgroundTasks } = getTables(
      this.handle,
    );
    const db = this.handle.db as any;
    const row = (
      await db
        .select()
        .from(careerProfileReevaluations)
        .where(
          and(
            eq(careerProfileReevaluations.id, reevaluationId),
            eq(careerProfileReevaluations.candidateId, candidateId),
          ),
        )
    )[0];
    if (!row) {
      throw new CareerMemoryError(
        'Reevaluation not found.',
        'REEVALUATION_NOT_FOUND',
      );
    }
    const tasks = (await db
      .select()
      .from(backgroundTasks)
      .then((items: any[]) =>
        items.filter((task: any) => {
          const payload = parsePayload(task.payload);
          return (
            payload.profileReevaluationId === reevaluationId &&
            payload.candidateId === candidateId
          );
        }),
      )) as BackgroundTask[];
    const failedTaskCount = new Set(
      tasks
        .filter((task) => task.state === 'FAILED')
        .map((task) =>
          typeof task.payload.snapshotId === 'string'
            ? task.payload.snapshotId
            : task.id,
        ),
    ).size;
    const completedTaskCount = tasks.filter(
      (task) =>
        task.taskType === 'decision.evaluate' && task.state === 'SUCCEEDED',
    ).length;
    const state =
      failedTaskCount > 0
        ? 'FAILED'
        : tasks.some((task) => task.state === 'RUNNING')
          ? 'RUNNING'
          : completedTaskCount === row.taskCount
            ? 'SUCCEEDED'
            : 'PENDING';
    const newest = tasks.reduce(
      (value, task) => Math.max(value, task.updatedAt.getTime()),
      row.updatedAt.getTime(),
    );
    return {
      id: row.id,
      state,
      taskCount: row.taskCount,
      completedTaskCount,
      failedTaskCount,
      requestedAt: row.createdAt,
      updatedAt: new Date(newest),
    };
  }

  private async requireCandidate(candidateId: CandidateId): Promise<any> {
    const { candidates } = getTables(this.handle);
    const rows = await (this.handle.db as any)
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId));
    if (!rows[0]) {
      throw new CareerMemoryError(
        'Candidate not found.',
        'CANDIDATE_NOT_FOUND',
      );
    }
    return rows[0];
  }

  private async requireClaim(
    candidateId: CandidateId,
    claimId: ClaimId,
  ): Promise<any> {
    await this.requireCandidate(candidateId);
    const { candidateClaims } = getTables(this.handle);
    const rows = await (this.handle.db as any)
      .select()
      .from(candidateClaims)
      .where(
        and(
          eq(candidateClaims.id, claimId),
          eq(candidateClaims.candidateId, candidateId),
        ),
      );
    if (!rows[0]) {
      throw new CareerMemoryError('Claim not found.', 'CLAIM_NOT_FOUND');
    }
    return rows[0];
  }

  private async requireCurrentClaim(
    candidateId: CandidateId,
    claimId: ClaimId,
  ): Promise<any> {
    const claim = await this.requireClaim(candidateId, claimId);
    if (claim.lifecycleState !== 'CURRENT') {
      throw new CareerMemoryError(
        'Only the current profile item can be changed.',
        'CLAIM_NOT_CURRENT',
      );
    }
    return claim;
  }

  private async rejectExistingSubjects(
    candidateId: CandidateId,
    subjectKeys: readonly string[],
    excludingClaimId?: ClaimId,
  ): Promise<void> {
    const { candidateClaims } = getTables(this.handle);
    const rows = await (this.handle.db as any)
      .select()
      .from(candidateClaims)
      .where(
        and(
          eq(candidateClaims.candidateId, candidateId),
          eq(candidateClaims.lifecycleState, 'CURRENT'),
        ),
      );
    if (
      rows.some(
        (row: any) =>
          row.id !== excludingClaimId && subjectKeys.includes(row.subjectKey),
      )
    ) {
      throw new CareerMemoryError(
        'A current profile item already represents that fact. Add Evidence or use Correct or Update.',
        'DUPLICATE_CURRENT_CLAIM',
      );
    }
  }

  private async getClaimEvidence(claimId: ClaimId): Promise<readonly any[]> {
    const { evidence, candidateClaimEvidence } = getTables(this.handle);
    return await (this.handle.db as any)
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
    return (await this.getClaimEvidence(claimId)).some((item) =>
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
    now: Date,
  ): Promise<CareerProfileReevaluation> {
    const profile = (await this.getProfile(candidateId))!;
    const semanticInput = profile.claims.map((claim: any) => ({
      kind: claim.kind,
      value: claim.value,
      scope: claim.scope,
      state: claim.state,
      confidence: claim.confidence,
      evidence: claim.evidence.map((item: any) => ({
        evidenceType: item.evidenceType,
        sourceReference: item.sourceReference,
        excerpt: item.excerpt,
        state: item.state,
      })),
    }));
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(semanticInput))
      .digest('hex')
      .slice(0, 20);
    const snapshots = await this.latestSnapshots();
    const reevaluationId = `profile-reevaluation-${randomUUID()}`;
    const { careerProfileReevaluations } = getTables(this.handle);
    await (this.handle.db as any).insert(careerProfileReevaluations).values({
      id: reevaluationId,
      candidateId,
      taskCount: snapshots.length,
      createdAt: now,
      updatedAt: now,
    });
    for (const snapshot of snapshots) {
      await this.ledger.enqueue({
        taskType: 'eligibility.evaluate',
        payload: {
          snapshotId: snapshot.id,
          candidateId,
          profileReevaluationId: reevaluationId,
        },
        idempotencyKey: `career-profile-${candidateId}-${snapshot.id}-${fingerprint}-${reevaluationId}`,
      });
    }
    return await this.getReevaluation(candidateId, reevaluationId);
  }

  private async latestSnapshots(): Promise<readonly any[]> {
    const { opportunitySnapshots } = getTables(this.handle);
    const snapshots = await (this.handle.db as any)
      .select()
      .from(opportunitySnapshots);
    const latest = new Map<string, any>();
    for (const snapshot of snapshots) {
      const current = latest.get(snapshot.opportunityId);
      if (!current || compareSnapshots(current, snapshot) < 0) {
        latest.set(snapshot.opportunityId, snapshot);
      }
    }
    return [...latest.values()];
  }
}

function compareSnapshots(left: any, right: any): number {
  return (
    left.observedAt.getTime() - right.observedAt.getTime() ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.id.localeCompare(right.id)
  );
}

function claimSubjectKey(kind: string, value: string): string {
  return `${canonicalIdentityPart(kind)}:${canonicalIdentityPart(value)}`;
}

function canonicalIdentityPart(value: string): string {
  const canonical = normalize(value, 'Claim identity')
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  if (!canonical) throw new TypeError('Claim identity cannot be empty.');
  return canonical;
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
  if (input.state === 'candidate-confirmed') {
    return 'candidate-confirmed/manual';
  }
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

function validateCreateClaim(input: CreateClaimInput): void {
  normalize(input.kind, 'Claim kind');
  normalize(input.value, 'Claim value');
  if (input.evidence) validateManualEvidence(input.evidence);
  if (
    input.state === 'SUPPORTED' &&
    (!input.evidence || !isTrusted(input.evidence.state))
  ) {
    throw new CareerMemoryError(
      'A supported claim requires candidate-confirmed Evidence.',
      'EVIDENCE_REQUIRED',
    );
  }
}

function parsePayload(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'string') {
    return (payload ?? {}) as Record<string, unknown>;
  }
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function runProfileTransaction(
  db: any,
  callback: (transaction: any) => Promise<void>,
): Promise<void> {
  try {
    await db.transaction(callback);
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';
    const message = error instanceof Error ? error.message : String(error);
    if (
      code === '23505' ||
      code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      /unique constraint|unique constraint failed|duplicate key/i.test(message)
    ) {
      throw new CareerMemoryError(
        'A current profile item already represents that fact.',
        'DUPLICATE_CURRENT_CLAIM',
      );
    }
    throw error;
  }
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
