import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyMigrations,
  BackgroundTaskLedger,
  CandidateRepository,
  EvaluationRepository,
  openDatabase,
  OpportunityRepository,
  RequirementSetRepository,
  SourceListingRepository,
  type BackgroundTask,
  type DatabaseHandle,
} from '@oca/database';
import {
  candidateId,
  opportunityId,
  requirementSetId,
  snapshotId,
} from '@oca/domain';
import {
  CANONICAL_FIT_ENGINE_VERSION,
  REQUIREMENT_PROPOSAL_SCHEMA_VERSION,
  type RequirementProposalProvider,
} from '@oca/intelligence';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDecisionHandlers } from '../decision/workflow.js';
import { createEligibilityHandlers } from '../eligibility/workflow.js';
import { createFitHandlers } from '../fit/workflow.js';
import { createQualityHandlers } from '../quality/workflow.js';
import { createRequirementHandlers } from './workflow.js';

function task(snapshot: string, candidate: string): BackgroundTask {
  return {
    id: 'task-requirements',
    taskType: 'requirements.extract',
    payload: { snapshotId: snapshot, candidateId: candidate },
    state: 'RUNNING',
    attempts: 1,
    maxAttempts: 3,
    availableAt: new Date(),
    leaseOwner: 'requirements-test',
    leaseExpiresAt: new Date(Date.now() + 30_000),
    idempotencyKey: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('requirements.extract V2.3.1 workflow', () => {
  let directory: string;
  let database: DatabaseHandle;
  let ledger: BackgroundTaskLedger;
  const candidate = candidateId('candidate-requirements-workflow');
  const snapshot = snapshotId('snapshot-requirements-workflow');

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-requirements-worker-'));
    database = openDatabase(join(directory, 'worker.sqlite'));
    await applyMigrations(database);
    ledger = new BackgroundTaskLedger(database);
    await new CandidateRepository(database).createCandidate(candidate);

    const sources = new SourceListingRepository(database);
    await sources.persistListing('listing-requirements-workflow', {
      sourceSystem: 'lever',
      sourceExternalId: 'synthetic-requirements-workflow',
      sourceUrl: 'https://example.test/jobs/requirements-workflow',
    });
    await sources.persistObservation(
      'observation-requirements-workflow',
      'listing-requirements-workflow',
      {
        rawPayload: JSON.stringify({
          text: 'Synthetic Engineer',
          _siteId: 'synthetic-organization',
          descriptionPlain: 'A legacy summary without requirement cues.',
          lists: [
            {
              text: 'Requirements',
              content: '<ul><li>TypeScript</li></ul>',
            },
            {
              text: 'Additional requirements',
              content: '<ul><li>Neo4j experience is required.</li></ul>',
            },
          ],
        }),
        fingerprint: 'observation-requirements-workflow',
      },
    );
    const opportunities = new OpportunityRepository(database);
    const opportunity = opportunityId('opportunity-requirements-workflow');
    await opportunities.createOpportunity(opportunity);
    await opportunities.appendSnapshot({
      id: snapshot,
      opportunityId: opportunity,
      title: 'Synthetic Engineer',
      organization: 'Synthetic Organization',
      content: 'TypeScript is required.',
      fingerprint: 'snapshot-requirements-workflow',
      sourceObservationId: 'observation-requirements-workflow',
    });
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function runEvaluationChain(): Promise<void> {
    const handlers = {
      ...createEligibilityHandlers({ db: database }),
      ...createFitHandlers({ db: database }),
      ...createQualityHandlers({ db: database }),
      ...createDecisionHandlers(database),
    };
    for (let index = 0; index < 4; index += 1) {
      const next = await ledger.claimNext({
        leaseOwner: 'requirements-chain',
        leaseDurationMs: 30_000,
      });
      expect(next).not.toBeNull();
      await handlers[next!.taskType]!(next!);
      await ledger.markSucceeded(next!.id, 'requirements-chain');
    }
  }

  it('generates one set and one evaluation chain for repeated identical processing', async () => {
    const handler = createRequirementHandlers({ db: database })[
      'requirements.extract'
    ]!;
    const work = task(snapshot, candidate);
    await handler(work);
    await handler(work);

    expect(
      database
        .sqlite!.prepare('select count(*) count from requirement_sets')
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database
        .sqlite!.prepare(
          'select deterministic_extractor_version deterministicExtractorVersion from requirement_sets',
        )
        .get(),
    ).toEqual({
      deterministicExtractorVersion: 'requirements-deterministic-v2.3.1',
    });
    expect(
      database
        .sqlite!.prepare(
          `select r.normalized_key normalizedKey,
                  p.source_field_path sourceFieldPath,
                  p.normalized_fragment_id normalizedFragmentId
             from canonical_requirements r
             join requirement_provenance p on p.requirement_id = r.id
            where r.normalized_key = 'technical:typescript'`,
        )
        .get(),
    ).toMatchObject({
      normalizedKey: 'technical:typescript',
      sourceFieldPath: '$.lists[0].content',
      normalizedFragmentId: expect.stringMatching(/^fragment_/),
    });
    expect(
      database
        .sqlite!.prepare(
          "select count(*) count from background_tasks where task_type = 'eligibility.evaluate'",
        )
        .get(),
    ).toEqual({ count: 1 });

    await runEvaluationChain();
    const evaluation = await new EvaluationRepository(
      database,
    ).getCurrentEvaluation(candidate, snapshot);
    expect(evaluation?.requirementSetId).toBeTruthy();
    expect(evaluation?.requirementInputFingerprint).toBeTruthy();
    expect(evaluation).toMatchObject({
      requirementInputMode: 'CANONICAL',
      eligibilityEngineVersion: 'eligibility-v2.5',
      fitAssessmentStatus: 'INSUFFICIENT_CANDIDATE_EVIDENCE',
      fitLevel: null,
      fitEngineVersion: CANONICAL_FIT_ENGINE_VERSION,
    });
    const fitFindings = await new EvaluationRepository(database).getFitFindings(
      evaluation!.id,
    );
    expect(fitFindings[0]?.canonicalRequirementId).toBeTruthy();
    expect(
      await new EvaluationRepository(database).getFindings(evaluation!.id),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'fit',
          canonicalRequirementId: expect.stringMatching(/^req_/),
        }),
      ]),
    );
    expect(
      database.sqlite!.prepare('select count(*) count from evaluations').get(),
    ).toEqual({ count: 1 });
    expect(
      database.sqlite!.prepare('select count(*) count from decisions').get(),
    ).toEqual({ count: 1 });
  });

  it('creates a new historical set and evaluation lineage for a new extractor version', async () => {
    await createRequirementHandlers({ db: database })['requirements.extract']!(
      task(snapshot, candidate),
    );
    await runEvaluationChain();
    const firstEvaluation = await new EvaluationRepository(
      database,
    ).getCurrentEvaluation(candidate, snapshot);

    await createRequirementHandlers({
      db: database,
      pipelineVersion: 'requirements-v2.2-rich-document-next',
      deterministicExtractorVersion: 'requirements-deterministic-v2.3.1-next',
    })['requirements.extract']!(task(snapshot, candidate));
    await runEvaluationChain();

    const currentEvaluation = await new EvaluationRepository(
      database,
    ).getCurrentEvaluation(candidate, snapshot);
    expect(currentEvaluation?.requirementSetId).not.toBe(
      firstEvaluation?.requirementSetId,
    );
    expect(
      database
        .sqlite!.prepare('select count(*) count from requirement_sets')
        .get(),
    ).toEqual({ count: 2 });
    expect(
      database.sqlite!.prepare('select count(*) count from evaluations').get(),
    ).toEqual({ count: 2 });
    expect(
      database
        .sqlite!.prepare(
          'select count(*) count from evaluations where superseded_at is not null',
        )
        .get(),
    ).toEqual({ count: 1 });

    const firstSet = await new RequirementSetRepository(database).getById(
      firstEvaluation!.requirementSetId,
    );
    expect(firstSet).not.toBeNull();
  });

  it('reuses the compatible Requirement Set when candidate knowledge changes', async () => {
    await createRequirementHandlers({ db: database })['requirements.extract']!(
      task(snapshot, candidate),
    );
    await runEvaluationChain();
    const repository = new EvaluationRepository(database);
    const first = await repository.getCurrentEvaluation(candidate, snapshot);

    await new CandidateRepository(database).addClaim({
      id: 'claim-profile-change' as never,
      candidateId: candidate,
      kind: 'skill',
      value: 'TypeScript',
      state: 'SUPPORTED',
    });
    const handlers = {
      ...createEligibilityHandlers({ db: database }),
      ...createFitHandlers({ db: database }),
      ...createQualityHandlers({ db: database }),
      ...createDecisionHandlers(database),
    };
    for (let index = 0; index < 4; index += 1) {
      const next = await ledger.claimNext({
        leaseOwner: 'profile-change-chain',
        leaseDurationMs: 30_000,
      });
      expect(next).not.toBeNull();
      await handlers[next!.taskType]!(next!);
      await ledger.markSucceeded(next!.id, 'profile-change-chain');
    }

    const second = await repository.getCurrentEvaluation(candidate, snapshot);
    expect(second?.requirementSetId).toBe(first?.requirementSetId);
    expect(second?.requirementInputFingerprint).toBe(
      first?.requirementInputFingerprint,
    );
    expect(second?.fitInputFingerprint).not.toBe(first?.fitInputFingerprint);
    expect(
      database
        .sqlite!.prepare('select count(*) count from requirement_sets')
        .get(),
    ).toEqual({ count: 1 });
  });

  it('persists grounded model proposals as candidates without changing canonical requirements', async () => {
    const provider: RequirementProposalProvider = {
      id: 'synthetic-worker-provider',
      capabilityVersion: 'synthetic-worker-v1',
      propose: (request) => {
        const fragment = request.fragments.find((item) =>
          item.text.includes('Neo4j'),
        );
        if (!fragment) throw new Error('Expected unresolved public fragment');
        return Promise.resolve({
          kind: 'success',
          response: {
            schemaVersion: REQUIREMENT_PROPOSAL_SCHEMA_VERSION,
            proposals: [
              {
                category: 'TECHNICAL_SKILL',
                value: { type: 'TERM', value: 'Neo4j' },
                statement: fragment.text,
                strength: 'REQUIRED',
                polarity: 'REQUIRES',
                evaluationUse: 'FIT',
                assertionBasis: 'EXPLICIT_TEXT',
                actionabilityCeiling: 'FIT_SIGNAL_SAFE',
                confidence: 'MODERATE',
                fragmentIds: [fragment.id],
                excerpts: [{ fragmentId: fragment.id, excerpt: fragment.text }],
                rationale: 'The supplied listing fragment names Neo4j.',
              },
            ],
          },
        });
      },
    };
    const handler = createRequirementHandlers({
      db: database,
      proposalProvider: provider,
    })['requirements.extract']!;

    await handler(task(snapshot, candidate));
    await handler(task(snapshot, candidate));

    expect(
      database
        .sqlite!.prepare('select count(*) count from requirement_candidates')
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database
        .sqlite!.prepare(
          'select count(*) count from requirement_candidate_sources',
        )
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database
        .sqlite!.prepare(
          'select status, unsafe_promotion_attempts unsafePromotionAttempts from requirement_assistance_runs',
        )
        .get(),
    ).toEqual({ status: 'SUCCEEDED', unsafePromotionAttempts: 0 });
    expect(
      database
        .sqlite!.prepare(
          "select count(*) count from canonical_requirements where normalized_key = 'technical:neo4j'",
        )
        .get(),
    ).toEqual({ count: 0 });

    const setRow = database
      .sqlite!.prepare('select id from requirement_sets')
      .get() as { id: string };
    const persisted = await new RequirementSetRepository(database).getById(
      requirementSetId(setRow.id),
    );
    expect(persisted?.candidates?.[0]).toMatchObject({
      normalizedKey: 'technical:neo4j',
      validationStatus: 'ACCEPTED_FOR_REVIEW',
      actionabilityCeiling: 'FIT_SIGNAL_SAFE',
    });
    expect(persisted?.requirements).toHaveLength(1);

    await runEvaluationChain();
    const evaluation = await new EvaluationRepository(
      database,
    ).getCurrentEvaluation(candidate, snapshot);
    expect(evaluation).toMatchObject({
      requirementInputMode: 'CANONICAL',
      fitAssessmentStatus: 'INSUFFICIENT_CANDIDATE_EVIDENCE',
      fitLevel: null,
    });
    expect(
      await new EvaluationRepository(database).getFitFindings(evaluation!.id),
    ).toHaveLength(1);
  });
});
