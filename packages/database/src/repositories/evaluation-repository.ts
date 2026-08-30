import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { DatabaseHandle } from '../client.js';
import {
  evaluations,
  decisions,
  evidence,
  evaluationFindings,
  evaluationFindingEvidence,
  decisionReasons,
} from '../schema.js';
import type {
  CandidateId,
  SnapshotId,
  EvaluationId,
  DecisionId,
  FindingId,
  EvidenceId,
} from '@oca/domain';

export class EvaluationRepository {
  public constructor(private readonly db: DatabaseHandle) {}

  public persistEvaluation(
    evaluation: {
      id: EvaluationId;
      candidateId: CandidateId;
      snapshotId: SnapshotId;
      eligibilityState: 'eligible' | 'ineligible' | 'investigate' | 'unknown';
      eligibilityEngineVersion?: string | null;
      eligibilityInputFingerprint?: string | null;
      fitLevel?: 'strong' | 'moderate' | 'weak' | null;
      fitEngineVersion?: string | null;
      fitInputFingerprint?: string | null;
      fitSummary?: string | null;
      qualityLevel?: 'strong' | 'moderate' | 'weak' | 'risk' | null;
      qualityEngineVersion?: string | null;
      qualityInputFingerprint?: string | null;
      qualitySummary?: string | null;
      qualityEvaluatedAt?: Date | null;
      qualityFreshnessBucket?: string | null;
      supersedesEvaluationId?: EvaluationId | null;
    },
    timestamp: number = Date.now(),
  ): void {
    this.db.db
      .insert(evaluations)
      .values({
        id: evaluation.id,
        candidateId: evaluation.candidateId,
        snapshotId: evaluation.snapshotId,
        eligibilityState: evaluation.eligibilityState,
        eligibilityEngineVersion: evaluation.eligibilityEngineVersion ?? null,
        eligibilityInputFingerprint:
          evaluation.eligibilityInputFingerprint ?? null,
        fitLevel: evaluation.fitLevel ?? null,
        fitEngineVersion: evaluation.fitEngineVersion ?? null,
        fitInputFingerprint: evaluation.fitInputFingerprint ?? null,
        fitSummary: evaluation.fitSummary ?? null,
        qualityLevel: evaluation.qualityLevel ?? null,
        qualityEngineVersion: evaluation.qualityEngineVersion ?? null,
        qualityInputFingerprint: evaluation.qualityInputFingerprint ?? null,
        qualitySummary: evaluation.qualitySummary ?? null,
        qualityEvaluatedAt: evaluation.qualityEvaluatedAt ?? null,
        qualityFreshnessBucket: evaluation.qualityFreshnessBucket ?? null,
        supersedesEvaluationId: evaluation.supersedesEvaluationId ?? null,
        supersededAt: null,
        createdAt: new Date(timestamp),
      })
      .run();
  }

  /**
   * Starts a new immutable Evaluation lineage from an earlier revision.  The
   * selected assessments and their existing Evidence links are copied; the
   * original row and findings are never changed.
   */
  public forkEvaluation(input: {
    id: EvaluationId;
    sourceEvaluationId: EvaluationId;
    copy: readonly ('eligibility' | 'fit' | 'quality')[];
  }): void {
    this.db.db.transaction((transaction) => {
      const source = transaction
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, input.sourceEvaluationId))
        .get();
      if (!source)
        throw new Error(`Evaluation ${input.sourceEvaluationId} not found`);

      const copyEligibility = input.copy.includes('eligibility');
      const copyFit = input.copy.includes('fit');
      const copyQuality = input.copy.includes('quality');
      transaction
        .insert(evaluations)
        .values({
          ...source,
          id: input.id,
          eligibilityState: source.eligibilityState,
          eligibilityEngineVersion: copyEligibility
            ? source.eligibilityEngineVersion
            : null,
          eligibilityInputFingerprint: copyEligibility
            ? source.eligibilityInputFingerprint
            : null,
          fitLevel: copyFit ? source.fitLevel : null,
          fitEngineVersion: copyFit ? source.fitEngineVersion : null,
          fitInputFingerprint: copyFit ? source.fitInputFingerprint : null,
          fitSummary: copyFit ? source.fitSummary : null,
          qualityLevel: copyQuality ? source.qualityLevel : null,
          qualityEngineVersion: copyQuality
            ? source.qualityEngineVersion
            : null,
          qualityInputFingerprint: copyQuality
            ? source.qualityInputFingerprint
            : null,
          qualitySummary: copyQuality ? source.qualitySummary : null,
          qualityEvaluatedAt: copyQuality ? source.qualityEvaluatedAt : null,
          qualityFreshnessBucket: copyQuality
            ? source.qualityFreshnessBucket
            : null,
          supersedesEvaluationId: source.id,
          supersededAt: null,
          createdAt: new Date(),
        })
        .run();

      transaction
        .update(evaluations)
        .set({ supersededAt: new Date() })
        .where(
          and(eq(evaluations.id, source.id), isNull(evaluations.supersededAt)),
        )
        .run();

      const categories = input.copy;
      const sourceFindings = transaction
        .select()
        .from(evaluationFindings)
        .where(eq(evaluationFindings.evaluationId, source.id))
        .all()
        .filter((finding) => categories.includes(finding.category));
      for (const finding of sourceFindings) {
        const clonedId = randomUUID() as FindingId;
        transaction
          .insert(evaluationFindings)
          .values({ ...finding, id: clonedId, evaluationId: input.id })
          .run();
        const links = transaction
          .select()
          .from(evaluationFindingEvidence)
          .where(eq(evaluationFindingEvidence.findingId, finding.id))
          .all();
        for (const link of links) {
          transaction
            .insert(evaluationFindingEvidence)
            .values({ findingId: clonedId, evidenceId: link.evidenceId })
            .run();
        }
      }
    });
  }

  /** Reuses an immutable historical assessment by copying its values and
   * finding-to-Evidence links into a new Evaluation revision. */
  public copyAssessment(input: {
    sourceEvaluationId: EvaluationId;
    targetEvaluationId: EvaluationId;
    category: 'fit' | 'quality';
  }): boolean {
    return this.db.db.transaction((transaction) => {
      const source = transaction
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, input.sourceEvaluationId))
        .get();
      const target = transaction
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, input.targetEvaluationId))
        .get();
      if (!source || !target) return false;
      if (input.category === 'fit') {
        if (!source.fitLevel || target.fitLevel) return false;
        transaction
          .update(evaluations)
          .set({
            fitLevel: source.fitLevel,
            fitEngineVersion: source.fitEngineVersion,
            fitInputFingerprint: source.fitInputFingerprint,
            fitSummary: source.fitSummary,
          })
          .where(eq(evaluations.id, target.id))
          .run();
      } else {
        if (!source.qualityLevel || target.qualityLevel) return false;
        transaction
          .update(evaluations)
          .set({
            qualityLevel: source.qualityLevel,
            qualityEngineVersion: source.qualityEngineVersion,
            qualityInputFingerprint: source.qualityInputFingerprint,
            qualitySummary: source.qualitySummary,
            qualityEvaluatedAt: source.qualityEvaluatedAt,
            qualityFreshnessBucket: source.qualityFreshnessBucket,
          })
          .where(eq(evaluations.id, target.id))
          .run();
      }
      const findings = transaction
        .select()
        .from(evaluationFindings)
        .where(
          and(
            eq(evaluationFindings.evaluationId, source.id),
            eq(evaluationFindings.category, input.category),
          ),
        )
        .all();
      for (const finding of findings) {
        const clonedId = randomUUID() as FindingId;
        transaction
          .insert(evaluationFindings)
          .values({ ...finding, id: clonedId, evaluationId: target.id })
          .run();
        for (const link of transaction
          .select()
          .from(evaluationFindingEvidence)
          .where(eq(evaluationFindingEvidence.findingId, finding.id))
          .all()) {
          transaction
            .insert(evaluationFindingEvidence)
            .values({ findingId: clonedId, evidenceId: link.evidenceId })
            .run();
        }
      }
      return true;
    });
  }

  public supersedeCurrentEvaluation(input: {
    candidateId: CandidateId;
    snapshotId: SnapshotId;
  }): void {
    this.db.db
      .update(evaluations)
      .set({ supersededAt: new Date() })
      .where(
        and(
          eq(evaluations.candidateId, input.candidateId),
          eq(evaluations.snapshotId, input.snapshotId),
          isNull(evaluations.supersededAt),
        ),
      )
      .run();
  }

  public getCurrentEvaluation(
    candidateId: CandidateId,
    snapshotId: SnapshotId,
  ) {
    return (
      this.db.db
        .select()
        .from(evaluations)
        .where(
          and(
            eq(evaluations.candidateId, candidateId),
            eq(evaluations.snapshotId, snapshotId),
            isNull(evaluations.supersededAt),
          ),
        )
        .orderBy(desc(evaluations.createdAt))
        .get() ?? null
    );
  }

  public persistFinding(finding: {
    id: FindingId;
    evaluationId: EvaluationId;
    category: 'eligibility' | 'fit' | 'quality';
    dimensionKey: string;
    label?: string;
    state: string;
    summary: string;
    confidence?: string;
    modality?: string;
    requirementText?: string;
    explanation?: string;
  }): void {
    this.db.db
      .insert(evaluationFindings)
      .values({
        id: finding.id,
        evaluationId: finding.evaluationId,
        category: finding.category,
        dimensionKey: finding.dimensionKey,
        label: finding.label,
        state: finding.state,
        summary: finding.summary,
        confidence: finding.confidence,
        modality: finding.modality,
        requirementText: finding.requirementText,
        explanation: finding.explanation,
      })
      .run();
  }

  public attachEvidenceToFinding(
    findingId: FindingId,
    evidenceId: EvidenceId,
  ): void {
    this.db.db
      .insert(evaluationFindingEvidence)
      .values({
        findingId,
        evidenceId,
      })
      .run();
  }

  public getEvaluation(id: EvaluationId) {
    const result = this.db.db
      .select()
      .from(evaluations)
      .where(eq(evaluations.id, id))
      .get();
    return result ?? null;
  }

  public getFindings(evaluationId: EvaluationId) {
    return this.db.db
      .select()
      .from(evaluationFindings)
      .where(eq(evaluationFindings.evaluationId, evaluationId))
      .all();
  }

  public persistFitResult(input: {
    evaluationId: EvaluationId;
    fit: {
      level: 'strong' | 'moderate' | 'weak';
      engineVersion: string;
      inputFingerprint: string;
      summary: string;
    };
    findings: readonly {
      id: FindingId;
      dimensionKey: string;
      label: string;
      state: string;
      summary: string;
      confidence: string;
      modality: string;
      requirementText: string;
      explanation: string;
      opportunityEvidence: {
        id: EvidenceId;
        evidenceType: string;
        sourceReference: string;
        excerpt: string;
        state:
          'source-verified' | 'candidate-confirmed' | 'unreviewed' | 'disputed';
      };
      candidateEvidenceIds: readonly EvidenceId[];
    }[];
  }): boolean {
    return this.db.db.transaction((transaction) => {
      const claimed = transaction
        .update(evaluations)
        .set({
          fitLevel: input.fit.level,
          fitEngineVersion: input.fit.engineVersion,
          fitInputFingerprint: input.fit.inputFingerprint,
          fitSummary: input.fit.summary,
        })
        .where(
          and(
            eq(evaluations.id, input.evaluationId),
            isNull(evaluations.fitLevel),
            isNull(evaluations.fitEngineVersion),
            isNull(evaluations.fitInputFingerprint),
            isNull(evaluations.fitSummary),
          ),
        )
        .returning({ id: evaluations.id })
        .get();
      if (!claimed) return false;

      for (const finding of input.findings) {
        transaction
          .insert(evaluationFindings)
          .values({
            id: finding.id,
            evaluationId: input.evaluationId,
            category: 'fit',
            dimensionKey: finding.dimensionKey,
            label: finding.label,
            state: finding.state,
            summary: finding.summary,
            confidence: finding.confidence,
            modality: finding.modality,
            requirementText: finding.requirementText,
            explanation: finding.explanation,
          })
          .run();
        transaction
          .insert(evidence)
          .values({
            ...finding.opportunityEvidence,
            createdAt: new Date(),
          })
          .run();
        transaction
          .insert(evaluationFindingEvidence)
          .values({
            findingId: finding.id,
            evidenceId: finding.opportunityEvidence.id,
          })
          .run();
        for (const evidenceId of finding.candidateEvidenceIds) {
          transaction
            .insert(evaluationFindingEvidence)
            .values({ findingId: finding.id, evidenceId })
            .run();
        }
      }

      return true;
    });
  }

  public findFitEvaluation(input: {
    candidateId: CandidateId;
    snapshotId: SnapshotId;
    engineVersion: string;
    inputFingerprint: string;
  }) {
    return (
      this.db.db
        .select()
        .from(evaluations)
        .where(
          and(
            eq(evaluations.candidateId, input.candidateId),
            eq(evaluations.snapshotId, input.snapshotId),
            eq(evaluations.fitEngineVersion, input.engineVersion),
            eq(evaluations.fitInputFingerprint, input.inputFingerprint),
          ),
        )
        .get() ?? null
    );
  }

  public getLatestFitForSnapshot(snapshotId: SnapshotId) {
    return (
      this.db.db
        .select()
        .from(evaluations)
        .where(
          and(
            eq(evaluations.snapshotId, snapshotId),
            isNotNull(evaluations.fitLevel),
          ),
        )
        .orderBy(desc(evaluations.createdAt))
        .get() ?? null
    );
  }

  public persistQualityResult(input: {
    evaluationId: EvaluationId;
    quality: {
      level: 'strong' | 'moderate' | 'weak' | 'risk';
      engineVersion: string;
      inputFingerprint: string;
      summary: string;
      evaluatedAt: Date;
      freshnessBucket: string;
    };
    findings: readonly {
      id: FindingId;
      dimensionKey: string;
      label: string;
      state: string;
      summary: string;
      confidence?: string;
      explanation?: string;
      evidence: readonly {
        id: EvidenceId;
        evidenceType: string;
        sourceReference: string;
        excerpt: string;
        state:
          'source-verified' | 'candidate-confirmed' | 'unreviewed' | 'disputed';
      }[];
    }[];
  }): boolean {
    return this.db.db.transaction((transaction) => {
      const existing = transaction
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, input.evaluationId))
        .get();

      if (!existing) return false;

      if (existing.qualityLevel || existing.qualityInputFingerprint) {
        return (
          existing.qualityInputFingerprint === input.quality.inputFingerprint &&
          existing.qualityLevel === input.quality.level
        );
      }

      transaction
        .update(evaluations)
        .set({
          qualityLevel: input.quality.level,
          qualityEngineVersion: input.quality.engineVersion,
          qualityInputFingerprint: input.quality.inputFingerprint,
          qualitySummary: input.quality.summary,
          qualityEvaluatedAt: input.quality.evaluatedAt,
          qualityFreshnessBucket: input.quality.freshnessBucket,
        })
        .where(eq(evaluations.id, input.evaluationId))
        .run();

      for (const finding of input.findings) {
        transaction
          .insert(evaluationFindings)
          .values({
            id: finding.id,
            evaluationId: input.evaluationId,
            category: 'quality',
            dimensionKey: finding.dimensionKey,
            label: finding.label,
            state: finding.state,
            summary: finding.summary,
            confidence: finding.confidence,
            explanation: finding.explanation ?? finding.summary,
          })
          .run();

        for (const ev of finding.evidence) {
          transaction
            .insert(evidence)
            .values({
              id: ev.id,
              evidenceType: ev.evidenceType,
              sourceReference: ev.sourceReference,
              excerpt: ev.excerpt,
              state: ev.state,
              createdAt: new Date(),
            })
            .onConflictDoNothing()
            .run();

          transaction
            .insert(evaluationFindingEvidence)
            .values({
              findingId: finding.id,
              evidenceId: ev.id,
            })
            .onConflictDoNothing()
            .run();
        }
      }

      return true;
    });
  }

  public findQualityEvaluation(input: {
    snapshotId: SnapshotId;
    engineVersion: string;
    inputFingerprint: string;
  }) {
    return (
      this.db.db
        .select()
        .from(evaluations)
        .where(
          and(
            eq(evaluations.snapshotId, input.snapshotId),
            eq(evaluations.qualityEngineVersion, input.engineVersion),
            eq(evaluations.qualityInputFingerprint, input.inputFingerprint),
          ),
        )
        .get() ?? null
    );
  }

  public getLatestQualityForSnapshot(snapshotId: SnapshotId) {
    return (
      this.db.db
        .select()
        .from(evaluations)
        .where(
          and(
            eq(evaluations.snapshotId, snapshotId),
            isNotNull(evaluations.qualityLevel),
          ),
        )
        .orderBy(desc(evaluations.createdAt))
        .get() ?? null
    );
  }

  public getEligibilityFindings(evaluationId: EvaluationId) {
    return this.db.db
      .select()
      .from(evaluationFindings)
      .where(
        and(
          eq(evaluationFindings.evaluationId, evaluationId),
          eq(evaluationFindings.category, 'eligibility'),
        ),
      )
      .all();
  }

  public getFitFindings(evaluationId: EvaluationId) {
    return this.db.db
      .select()
      .from(evaluationFindings)
      .where(
        and(
          eq(evaluationFindings.evaluationId, evaluationId),
          eq(evaluationFindings.category, 'fit'),
        ),
      )
      .all();
  }

  public getQualityFindings(evaluationId: EvaluationId) {
    return this.db.db
      .select()
      .from(evaluationFindings)
      .where(
        and(
          eq(evaluationFindings.evaluationId, evaluationId),
          eq(evaluationFindings.category, 'quality'),
        ),
      )
      .all();
  }

  public persistDecision(
    decision: {
      id: DecisionId;
      evaluationId: EvaluationId;
      priority:
        | 'high-priority'
        | 'consider'
        | 'investigate'
        | 'low-priority'
        | 'blocked';
      candidateId: CandidateId;
      snapshotId: SnapshotId;
      action: 'apply' | 'review' | 'investigate' | 'do_not_apply';
      explanation: string;
      engineVersion: string;
      inputFingerprint: string;
      eligibilityInputFingerprint: string;
      fitInputFingerprint: string;
      qualityInputFingerprint: string;
      reasonCodes: readonly string[];
      reasonFindingIds: readonly { reasonCode: string; findingId: FindingId }[];
      evaluatedAt: Date;
    },
    timestamp: number = Date.now(),
  ): boolean {
    return this.db.db.transaction((transaction) => {
      const evaluation = transaction
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, decision.evaluationId))
        .get();
      if (
        !evaluation ||
        evaluation.candidateId !== decision.candidateId ||
        evaluation.snapshotId !== decision.snapshotId ||
        evaluation.supersededAt ||
        evaluation.eligibilityInputFingerprint !==
          decision.eligibilityInputFingerprint ||
        evaluation.fitInputFingerprint !== decision.fitInputFingerprint ||
        evaluation.qualityInputFingerprint !== decision.qualityInputFingerprint
      ) {
        return false;
      }

      const existing = transaction
        .select()
        .from(decisions)
        .where(
          and(
            eq(decisions.evaluationId, decision.evaluationId),
            eq(decisions.engineVersion, decision.engineVersion),
            eq(decisions.inputFingerprint, decision.inputFingerprint),
          ),
        )
        .get();

      if (existing) return true;

      transaction
        .insert(decisions)
        .values({
          id: decision.id,
          evaluationId: decision.evaluationId,
          candidateId: decision.candidateId,
          snapshotId: decision.snapshotId,
          priority: decision.priority,
          action: decision.action,
          explanation: decision.explanation,
          engineVersion: decision.engineVersion,
          inputFingerprint: decision.inputFingerprint,
          eligibilityInputFingerprint: decision.eligibilityInputFingerprint,
          fitInputFingerprint: decision.fitInputFingerprint,
          qualityInputFingerprint: decision.qualityInputFingerprint,
          reasonCodes: JSON.stringify(decision.reasonCodes),
          evaluatedAt: decision.evaluatedAt,
          createdAt: new Date(timestamp),
        })
        .run();

      for (const reason of decision.reasonFindingIds) {
        transaction
          .insert(decisionReasons)
          .values({
            id: randomUUID(),
            decisionId: decision.id,
            reasonCode: reason.reasonCode,
            findingId: reason.findingId,
          })
          .onConflictDoNothing()
          .run();
      }

      return true;
    });
  }

  public getDecision(id: DecisionId) {
    const result = this.db.db
      .select()
      .from(decisions)
      .where(eq(decisions.id, id))
      .get();
    return result ?? null;
  }

  public getLatestDecisionForEvaluation(evaluationId: EvaluationId) {
    return (
      this.db.db
        .select()
        .from(decisions)
        .where(eq(decisions.evaluationId, evaluationId))
        .orderBy(desc(decisions.createdAt))
        .get() ?? null
    );
  }

  public getCurrentDecisionForEvaluation(evaluationId: EvaluationId) {
    return (
      this.db.db
        .select({ decision: decisions })
        .from(decisions)
        .innerJoin(evaluations, eq(decisions.evaluationId, evaluations.id))
        .where(
          and(
            eq(decisions.evaluationId, evaluationId),
            isNull(evaluations.supersededAt),
            eq(
              decisions.eligibilityInputFingerprint,
              evaluations.eligibilityInputFingerprint,
            ),
            eq(decisions.fitInputFingerprint, evaluations.fitInputFingerprint),
            eq(
              decisions.qualityInputFingerprint,
              evaluations.qualityInputFingerprint,
            ),
          ),
        )
        .orderBy(desc(decisions.evaluatedAt))
        .get()?.decision ?? null
    );
  }

  public getLatestDecisionForSnapshot(snapshotId: SnapshotId) {
    return (
      this.db.db
        .select({
          id: decisions.id,
          evaluationId: decisions.evaluationId,
          priority: decisions.priority,
          action: decisions.action,
          explanation: decisions.explanation,
          engineVersion: decisions.engineVersion,
          inputFingerprint: decisions.inputFingerprint,
          reasonCodes: decisions.reasonCodes,
          evaluatedAt: decisions.evaluatedAt,
          createdAt: decisions.createdAt,
        })
        .from(decisions)
        .innerJoin(evaluations, eq(decisions.evaluationId, evaluations.id))
        .where(eq(evaluations.snapshotId, snapshotId))
        .orderBy(desc(decisions.createdAt))
        .get() ?? null
    );
  }

  public getCurrentDecision(candidateId: CandidateId, snapshotId: SnapshotId) {
    return (
      this.db.db
        .select({ decision: decisions })
        .from(decisions)
        .innerJoin(evaluations, eq(decisions.evaluationId, evaluations.id))
        .where(
          and(
            eq(decisions.candidateId, candidateId),
            eq(decisions.snapshotId, snapshotId),
            isNull(evaluations.supersededAt),
            eq(
              decisions.eligibilityInputFingerprint,
              evaluations.eligibilityInputFingerprint,
            ),
            eq(decisions.fitInputFingerprint, evaluations.fitInputFingerprint),
            eq(
              decisions.qualityInputFingerprint,
              evaluations.qualityInputFingerprint,
            ),
          ),
        )
        .orderBy(desc(decisions.evaluatedAt))
        .get()?.decision ?? null
    );
  }

  public getDecisionReasons(decisionId: DecisionId) {
    return this.db.db
      .select()
      .from(decisionReasons)
      .where(eq(decisionReasons.decisionId, decisionId))
      .all();
  }
}
