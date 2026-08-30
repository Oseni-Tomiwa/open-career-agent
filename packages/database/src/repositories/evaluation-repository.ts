import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { DatabaseHandle } from '../client.js';
import {
  evaluations,
  decisions,
  evidence,
  evaluationFindings,
  evaluationFindingEvidence,
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
        createdAt: new Date(timestamp),
      })
      .run();
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

      if (
        existing.qualityEvaluatedAt &&
        existing.qualityEvaluatedAt.getTime() >
          input.quality.evaluatedAt.getTime()
      ) {
        return false;
      }

      if (
        existing.qualityInputFingerprint === input.quality.inputFingerprint &&
        existing.qualityLevel === input.quality.level
      ) {
        return true;
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

      const previousFindings = transaction
        .select({ id: evaluationFindings.id })
        .from(evaluationFindings)
        .where(
          and(
            eq(evaluationFindings.evaluationId, input.evaluationId),
            eq(evaluationFindings.category, 'quality'),
          ),
        )
        .all();

      for (const prev of previousFindings) {
        transaction
          .delete(evaluationFindingEvidence)
          .where(eq(evaluationFindingEvidence.findingId, prev.id))
          .run();
      }

      transaction
        .delete(evaluationFindings)
        .where(
          and(
            eq(evaluationFindings.evaluationId, input.evaluationId),
            eq(evaluationFindings.category, 'quality'),
          ),
        )
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
        | 'ineligible';
      explanation: string;
    },
    timestamp: number = Date.now(),
  ): void {
    this.db.db
      .insert(decisions)
      .values({
        id: decision.id,
        evaluationId: decision.evaluationId,
        priority: decision.priority,
        explanation: decision.explanation,
        createdAt: new Date(timestamp),
      })
      .run();
  }

  public getDecision(id: DecisionId) {
    const result = this.db.db
      .select()
      .from(decisions)
      .where(eq(decisions.id, id))
      .get();
    return result ?? null;
  }
}
