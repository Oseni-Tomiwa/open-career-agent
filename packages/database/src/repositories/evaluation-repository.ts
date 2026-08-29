import { eq } from 'drizzle-orm';
import type { DatabaseHandle } from '../client.js';
import { evaluations, decisions, evaluationFindings, evaluationFindingEvidence } from '../schema.js';
import type { CandidateId, SnapshotId, EvaluationId, DecisionId, FindingId, EvidenceId } from '@oca/domain';

export class EvaluationRepository {
  public constructor(private readonly db: DatabaseHandle) {}

  public persistEvaluation(
    evaluation: {
      id: EvaluationId;
      candidateId: CandidateId;
      snapshotId: SnapshotId;
      eligibilityState: 'eligible' | 'ineligible' | 'investigate' | 'unknown';
      fitLevel: 'strong' | 'moderate' | 'weak';
      qualityLevel: 'strong' | 'moderate' | 'weak' | 'risk';
    },
    timestamp: number = Date.now(),
  ): void {
    this.db.db.insert(evaluations).values({
      id: evaluation.id,
      candidateId: evaluation.candidateId,
      snapshotId: evaluation.snapshotId,
      eligibilityState: evaluation.eligibilityState,
      fitLevel: evaluation.fitLevel,
      qualityLevel: evaluation.qualityLevel,
      createdAt: new Date(timestamp),
    }).run();
  }

  public persistFinding(
    finding: {
      id: FindingId;
      evaluationId: EvaluationId;
      category: 'eligibility' | 'fit' | 'quality';
      dimensionKey: string;
      state: string;
      summary: string;
      confidence?: string;
    }
  ): void {
    this.db.db.insert(evaluationFindings).values({
      id: finding.id,
      evaluationId: finding.evaluationId,
      category: finding.category,
      dimensionKey: finding.dimensionKey,
      state: finding.state,
      summary: finding.summary,
      confidence: finding.confidence,
    }).run();
  }

  public attachEvidenceToFinding(findingId: FindingId, evidenceId: EvidenceId): void {
    this.db.db.insert(evaluationFindingEvidence).values({
      findingId,
      evidenceId,
    }).run();
  }

  public getEvaluation(id: EvaluationId) {
    const result = this.db.db.select()
      .from(evaluations)
      .where(eq(evaluations.id, id))
      .get();
    return result ?? null;
  }

  public getFindings(evaluationId: EvaluationId) {
    return this.db.db.select()
      .from(evaluationFindings)
      .where(eq(evaluationFindings.evaluationId, evaluationId))
      .all();
  }

  public persistDecision(
    decision: {
      id: DecisionId;
      evaluationId: EvaluationId;
      priority: 'high-priority' | 'consider' | 'investigate' | 'low-priority' | 'ineligible';
      explanation: string;
    },
    timestamp: number = Date.now(),
  ): void {
    this.db.db.insert(decisions).values({
      id: decision.id,
      evaluationId: decision.evaluationId,
      priority: decision.priority,
      explanation: decision.explanation,
      createdAt: new Date(timestamp),
    }).run();
  }

  public getDecision(id: DecisionId) {
    const result = this.db.db.select()
      .from(decisions)
      .where(eq(decisions.id, id))
      .get();
    return result ?? null;
  }
}
