import { openDatabase, BackgroundTaskLedger, applyMigrations } from '@oca/database';

async function main() {
  const db = openDatabase('rolevia.sqlite');
  await applyMigrations(db, '../../packages/database/migrations');
  const taskLedger = new BackgroundTaskLedger(db);

  taskLedger.enqueue({
    taskType: 'source.greenhouse.discover',
    payload: { boardId: 'linear' }, // some popular startup greenhouse board
  });

  console.log("Enqueued source.greenhouse.discover for linear");
}
main().catch(console.error);
