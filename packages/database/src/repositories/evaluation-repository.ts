import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { DatabaseHandle } from '../client.js';
import { getTables } from '../schema-helper.js';
import type {
  CandidateId,
  SnapshotId,
  EvaluationId,
  DecisionId,
  FindingId,
  EvidenceId,
  OpportunityId,
} from '@oca/domain';

export class EvaluationRepository {
  public constructor(private readonly db: DatabaseHandle) {}

  public async persistEvaluation(
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
  ): Promise<void> {
    const { evaluations } = getTables(this.db);
    const db = this.db.db as any;

    await db.insert(evaluations).values({
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
    });
  }

  public async forkEvaluation(input: {
    id: EvaluationId;
    sourceEvaluationId: EvaluationId;
    copy: readonly ('eligibility' | 'fit' | 'quality')[];
  }): Promise<void> {
    const { evaluations, evaluationFindings, evaluationFindingEvidence } =
      getTables(this.db);
    const db = this.db.db as any;

    await db.transaction(async (transaction: any) => {
      const sourceRows = await transaction
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, input.sourceEvaluationId));
      const source = sourceRows[0];
      if (!source)
        throw new Error(`Evaluation ${input.sourceEvaluationId} not found`);

      const copyEligibility = input.copy.includes('eligibility');
      const copyFit = input.copy.includes('fit');
      const copyQuality = input.copy.includes('quality');

      await transaction.insert(evaluations).values({
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
        qualityEngineVersion: copyQuality ? source.qualityEngineVersion : null,
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
      });

      await transaction
        .update(evaluations)
        .set({ supersededAt: new Date() })
        .where(
          and(eq(evaluations.id, source.id), isNull(evaluations.supersededAt)),
        );

      const categories = input.copy;
      const allSourceFindings = await transaction
        .select()
        .from(evaluationFindings)
        .where(eq(evaluationFindings.evaluationId, source.id));

      const sourceFindings = allSourceFindings.filter((finding: any) =>
        categories.includes(finding.category),
      );

      for (const finding of sourceFindings) {
        const clonedId = randomUUID() as FindingId;
        await transaction
          .insert(evaluationFindings)
          .values({ ...finding, id: clonedId, evaluationId: input.id });

        const links = await transaction
          .select()
          .from(evaluationFindingEvidence)
          .where(eq(evaluationFindingEvidence.findingId, finding.id));

        for (const link of links) {
          await transaction
            .insert(evaluationFindingEvidence)
            .values({ findingId: clonedId, evidenceId: link.evidenceId });
        }
      }
    });
  }

  public async copyAssessment(input: {
    sourceEvaluationId: EvaluationId;
    targetEvaluationId: EvaluationId;
    category: 'fit' | 'quality';
  }): Promise<boolean> {
    const { evaluations, evaluationFindings, evaluationFindingEvidence } =
      getTables(this.db);
    const db = this.db.db as any;

    return await db.transaction(async (transaction: any) => {
      const sourceRows = await transaction
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, input.sourceEvaluationId));
      const targetRows = await transaction
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, input.targetEvaluationId));
      const source = sourceRows[0];
      const target = targetRows[0];

      if (!source || !target) return false;

      if (input.category === 'fit') {
        if (!source.fitLevel || target.fitLevel) return false;
        await transaction
          .update(evaluations)
          .set({
            fitLevel: source.fitLevel,
            fitEngineVersion: source.fitEngineVersion,
            fitInputFingerprint: source.fitInputFingerprint,
            fitSummary: source.fitSummary,
          })
          .where(eq(evaluations.id, target.id));
      } else {
        if (!source.qualityLevel || target.qualityLevel) return false;
        await transaction
          .update(evaluations)
          .set({
            qualityLevel: source.qualityLevel,
            qualityEngineVersion: source.qualityEngineVersion,
            qualityInputFingerprint: source.qualityInputFingerprint,
            qualitySummary: source.qualitySummary,
            qualityEvaluatedAt: source.qualityEvaluatedAt,
            qualityFreshnessBucket: source.qualityFreshnessBucket,
          })
          .where(eq(evaluations.id, target.id));
      }

      const findings = await transaction
        .select()
        .from(evaluationFindings)
        .where(
          and(
            eq(evaluationFindings.evaluationId, source.id),
            eq(evaluationFindings.category, input.category),
          ),
        );

      for (const finding of findings) {
        const clonedId = randomUUID() as FindingId;
        await transaction
          .insert(evaluationFindings)
          .values({ ...finding, id: clonedId, evaluationId: target.id });

        const links = await transaction
          .select()
          .from(evaluationFindingEvidence)
          .where(eq(evaluationFindingEvidence.findingId, finding.id));

        for (const link of links) {
          await transaction
            .insert(evaluationFindingEvidence)
            .values({ findingId: clonedId, evidenceId: link.evidenceId });
        }
      }
      return true;
    });
  }

  public async supersedeCurrentEvaluation(input: {
    candidateId: CandidateId;
    snapshotId: SnapshotId;
  }): Promise<void> {
    const { evaluations } = getTables(this.db);
    const db = this.db.db as any;

    await db
      .update(evaluations)
      .set({ supersededAt: new Date() })
      .where(
        and(
          eq(evaluations.candidateId, input.candidateId),
          eq(evaluations.snapshotId, input.snapshotId),
          isNull(evaluations.supersededAt),
        ),
      );
  }

  public async getCurrentEvaluation(
    candidateId: CandidateId,
    snapshotId: SnapshotId,
  ): Promise<any | null> {
    const { evaluations } = getTables(this.db);
    const db = this.db.db as any;

    const rows = await db
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.candidateId, candidateId),
          eq(evaluations.snapshotId, snapshotId),
          isNull(evaluations.supersededAt),
        ),
      )
      .orderBy(desc(evaluations.createdAt));
    return rows[0] ?? null;
  }

  public async persistFinding(finding: {
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
  }): Promise<void> {
    const { evaluationFindings } = getTables(this.db);
    const db = this.db.db as any;

    await db.insert(evaluationFindings).values({
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
    });
  }

  public async attachEvidenceToFinding(
    findingId: FindingId,
    evidenceId: EvidenceId,
  ): Promise<void> {
    const { evaluationFindingEvidence } = getTables(this.db);
    const db = this.db.db as any;

    await db.insert(evaluationFindingEvidence).values({
      findingId,
      evidenceId,
    });
  }

  public async getEvaluation(id: EvaluationId): Promise<any | null> {
    const { evaluations } = getTables(this.db);
    const db = this.db.db as any;

    const rows = await db
      .select()
      .from(evaluations)
      .where(eq(evaluations.id, id));
    return rows[0] ?? null;
  }

  public async getFindings(
    evaluationId: EvaluationId,
  ): Promise<readonly any[]> {
    const { evaluationFindings } = getTables(this.db);
    const db = this.db.db as any;

    return await db
      .select()
      .from(evaluationFindings)
      .where(eq(evaluationFindings.evaluationId, evaluationId));
  }

  public async persistFitResult(input: {
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
  }): Promise<boolean> {
    const {
      evaluations,
      evaluationFindings,
      evidence,
      evaluationFindingEvidence,
    } = getTables(this.db);
    const db = this.db.db as any;

    return await db.transaction(async (transaction: any) => {
      const claimedRows = await transaction
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
        .returning({ id: evaluations.id });

      if (claimedRows.length === 0) return false;

      for (const finding of input.findings) {
        await transaction.insert(evaluationFindings).values({
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
        });

        await transaction.insert(evidence).values({
          ...finding.opportunityEvidence,
          createdAt: new Date(),
        });

        await transaction.insert(evaluationFindingEvidence).values({
          findingId: finding.id,
          evidenceId: finding.opportunityEvidence.id,
        });

        for (const evidenceId of finding.candidateEvidenceIds) {
          await transaction.insert(evaluationFindingEvidence).values({
            findingId: finding.id,
            evidenceId,
          });
        }
      }

      return true;
    });
  }

  public async findFitEvaluation(input: {
    candidateId: CandidateId;
    snapshotId: SnapshotId;
    engineVersion: string;
    inputFingerprint: string;
  }): Promise<any | null> {
    const { evaluations } = getTables(this.db);
    const db = this.db.db as any;

    const rows = await db
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.candidateId, input.candidateId),
          eq(evaluations.snapshotId, input.snapshotId),
          eq(evaluations.fitEngineVersion, input.engineVersion),
          eq(evaluations.fitInputFingerprint, input.inputFingerprint),
        ),
      );
    return rows[0] ?? null;
  }

  public async getLatestFitForSnapshot(
    snapshotId: SnapshotId,
  ): Promise<any | null> {
    const { evaluations } = getTables(this.db);
    const db = this.db.db as any;

    const rows = await db
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.snapshotId, snapshotId),
          isNotNull(evaluations.fitLevel),
        ),
      )
      .orderBy(desc(evaluations.createdAt));
    return rows[0] ?? null;
  }

  public async persistQualityResult(input: {
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
  }): Promise<boolean> {
    const {
      evaluations,
      evaluationFindings,
      evidence,
      evaluationFindingEvidence,
    } = getTables(this.db);
    const db = this.db.db as any;

    return await db.transaction(async (transaction: any) => {
      const existingRows = await transaction
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, input.evaluationId));

      const existing = existingRows[0];
      if (!existing) return false;

      if (existing.qualityLevel || existing.qualityInputFingerprint) {
        return (
          existing.qualityInputFingerprint === input.quality.inputFingerprint &&
          existing.qualityLevel === input.quality.level
        );
      }

      await transaction
        .update(evaluations)
        .set({
          qualityLevel: input.quality.level,
          qualityEngineVersion: input.quality.engineVersion,
          qualityInputFingerprint: input.quality.inputFingerprint,
          qualitySummary: input.quality.summary,
          qualityEvaluatedAt: input.quality.evaluatedAt,
          qualityFreshnessBucket: input.quality.freshnessBucket,
        })
        .where(eq(evaluations.id, input.evaluationId));

      for (const finding of input.findings) {
        await transaction.insert(evaluationFindings).values({
          id: finding.id,
          evaluationId: input.evaluationId,
          category: 'quality',
          dimensionKey: finding.dimensionKey,
          label: finding.label,
          state: finding.state,
          summary: finding.summary,
          confidence: finding.confidence,
          explanation: finding.explanation ?? finding.summary,
        });

        for (const ev of finding.evidence) {
          await transaction
            .insert(evidence)
            .values({
              id: ev.id,
              evidenceType: ev.evidenceType,
              sourceReference: ev.sourceReference,
              excerpt: ev.excerpt,
              state: ev.state,
              createdAt: new Date(),
            })
            .onConflictDoNothing();

          await transaction
            .insert(evaluationFindingEvidence)
            .values({
              findingId: finding.id,
              evidenceId: ev.id,
            })
            .onConflictDoNothing();
        }
      }

      return true;
    });
  }

  public async findQualityEvaluation(input: {
    snapshotId: SnapshotId;
    engineVersion: string;
    inputFingerprint: string;
  }): Promise<any | null> {
    const { evaluations } = getTables(this.db);
    const db = this.db.db as any;

    const rows = await db
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.snapshotId, input.snapshotId),
          eq(evaluations.qualityEngineVersion, input.engineVersion),
          eq(evaluations.qualityInputFingerprint, input.inputFingerprint),
        ),
      );
    return rows[0] ?? null;
  }

  public async getLatestQualityForSnapshot(
    snapshotId: SnapshotId,
  ): Promise<any | null> {
    const { evaluations } = getTables(this.db);
    const db = this.db.db as any;

    const rows = await db
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.snapshotId, snapshotId),
          isNotNull(evaluations.qualityLevel),
        ),
      )
      .orderBy(desc(evaluations.createdAt));
    return rows[0] ?? null;
  }

  public async getEligibilityFindings(
    evaluationId: EvaluationId,
  ): Promise<readonly any[]> {
    const { evaluationFindings } = getTables(this.db);
    const db = this.db.db as any;

    return await db
      .select()
      .from(evaluationFindings)
      .where(
        and(
          eq(evaluationFindings.evaluationId, evaluationId),
          eq(evaluationFindings.category, 'eligibility'),
        ),
      );
  }

  public async getFitFindings(
    evaluationId: EvaluationId,
  ): Promise<readonly any[]> {
    const { evaluationFindings } = getTables(this.db);
    const db = this.db.db as any;

    return await db
      .select()
      .from(evaluationFindings)
      .where(
        and(
          eq(evaluationFindings.evaluationId, evaluationId),
          eq(evaluationFindings.category, 'fit'),
        ),
      );
  }

  public async getQualityFindings(
    evaluationId: EvaluationId,
  ): Promise<readonly any[]> {
    const { evaluationFindings } = getTables(this.db);
    const db = this.db.db as any;

    return await db
      .select()
      .from(evaluationFindings)
      .where(
        and(
          eq(evaluationFindings.evaluationId, evaluationId),
          eq(evaluationFindings.category, 'quality'),
        ),
      );
  }

  public async persistDecision(
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
  ): Promise<boolean> {
    const { evaluations, decisions, decisionReasons } = getTables(this.db);
    const db = this.db.db as any;

    return await db.transaction(async (transaction: any) => {
      const evalRows = await transaction
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, decision.evaluationId));

      const evaluation = evalRows[0];
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

      const existingRows = await transaction
        .select()
        .from(decisions)
        .where(
          and(
            eq(decisions.evaluationId, decision.evaluationId),
            eq(decisions.engineVersion, decision.engineVersion),
            eq(decisions.inputFingerprint, decision.inputFingerprint),
          ),
        );

      if (existingRows.length > 0) return true;

      await transaction.insert(decisions).values({
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
      });

      for (const reason of decision.reasonFindingIds) {
        await transaction
          .insert(decisionReasons)
          .values({
            id: randomUUID(),
            decisionId: decision.id,
            reasonCode: reason.reasonCode,
            findingId: reason.findingId,
          })
          .onConflictDoNothing();
      }

      return true;
    });
  }

  public async getDecision(id: DecisionId): Promise<any | null> {
    const { decisions } = getTables(this.db);
    const db = this.db.db as any;

    const rows = await db.select().from(decisions).where(eq(decisions.id, id));
    return rows[0] ?? null;
  }

  public async getLatestDecisionForEvaluation(
    evaluationId: EvaluationId,
  ): Promise<any | null> {
    const { decisions } = getTables(this.db);
    const db = this.db.db as any;

    const rows = await db
      .select()
      .from(decisions)
      .where(eq(decisions.evaluationId, evaluationId))
      .orderBy(desc(decisions.createdAt));
    return rows[0] ?? null;
  }

  public async getCurrentDecisionForEvaluation(
    evaluationId: EvaluationId,
  ): Promise<any | null> {
    const { decisions, evaluations } = getTables(this.db);
    const db = this.db.db as any;

    const rows = await db
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
      .orderBy(desc(decisions.evaluatedAt));

    return rows[0]?.decision ?? null;
  }

  public async getLatestDecisionForSnapshot(
    snapshotId: SnapshotId,
  ): Promise<any | null> {
    const { decisions, evaluations } = getTables(this.db);
    const db = this.db.db as any;

    const rows = await db
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
      .orderBy(desc(decisions.createdAt));

    return rows[0] ?? null;
  }

  public async getCurrentDecision(
    candidateId: CandidateId,
    snapshotId: SnapshotId,
  ): Promise<any | null> {
    const { decisions, evaluations } = getTables(this.db);
    const db = this.db.db as any;

    const rows = await db
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
      .orderBy(desc(decisions.evaluatedAt));

    return rows[0]?.decision ?? null;
  }

  public async getDecisionReasons(
    decisionId: DecisionId,
  ): Promise<readonly any[]> {
    const { decisionReasons } = getTables(this.db);
    const db = this.db.db as any;

    return await db
      .select()
      .from(decisionReasons)
      .where(eq(decisionReasons.decisionId, decisionId));
  }

  public async getDecisionHistoryForCandidate(
    cId: CandidateId,
    oppId: OpportunityId,
  ): Promise<readonly any[]> {
    const { decisions, evaluations, opportunitySnapshots } = getTables(this.db);
    const db = this.db.db as any;

    const rows = await db
      .select({ decision: decisions })
      .from(decisions)
      .innerJoin(evaluations, eq(decisions.evaluationId, evaluations.id))
      .innerJoin(
        opportunitySnapshots,
        eq(evaluations.snapshotId, opportunitySnapshots.id),
      )
      .where(
        and(
          eq(decisions.candidateId, cId),
          eq(opportunitySnapshots.opportunityId, oppId),
        ),
      )
      .orderBy(desc(decisions.evaluatedAt));

    return rows.map((r: any) => r.decision);
  }
}
