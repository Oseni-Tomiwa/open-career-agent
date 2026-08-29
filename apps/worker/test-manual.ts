import { openDatabase, OpportunityRepository, applyMigrations, BackgroundTaskLedger } from '@oca/database';
import { EligibilityEngine } from '@oca/intelligence';
import { createTaskHandlers } from './src/ingestion/workflow.js';
import { parseWorkerConfig } from '@oca/config/server';

async function main() {
  const db = openDatabase('rolevia.sqlite');
  await applyMigrations(db, '../../packages/database/migrations');
  const repo = new OpportunityRepository(db);
  const ledger = new BackgroundTaskLedger(db);

  // Manual trigger
  const handlers = createTaskHandlers({ db, config: parseWorkerConfig({}) });
  const task = {
     id: 'test',
     taskType: 'source.greenhouse.discover',
     payload: '{"boardId":"figma"}',
     status: 'PENDING',
     createdAt: new Date(),
     updatedAt: new Date(),
     attempts: 0, maxAttempts: 3
  } as any;
  task.payload = JSON.parse(task.payload);

  console.log("Running ingestion handler...");
  await handlers['source.greenhouse.discover'](task);
  console.log("Ingestion finished!");

  const summaries = repo.getOpportunitySummaries();
  if (summaries.length === 0) {
    console.log("No real opportunities ingested yet.");
    return;
  }

  const snapshot = repo.getSnapshot(summaries[0].latestSnapshotId!);
  if (!snapshot) {
     console.log("Could not load snapshot");
     return;
  }

  const engine = new EligibilityEngine();

  const candidateClaims = [
    { kind: 'work_authorization', scope: 'us', state: 'supported' },
    { kind: 'location', scope: 'new york', state: 'supported' },
    { kind: 'sponsorship', value: 'requires_sponsorship', state: 'conflict' }
  ];

  const result = engine.evaluate(snapshot, candidateClaims);

  console.log("Real Opportunity Title: " + summaries[0].latestTitle);
  console.log("Evaluation Overall State: " + result.overallState);
  console.log("Evaluation Findings: ", JSON.stringify(result.findings, null, 2));

}
main().catch(console.error);
