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
