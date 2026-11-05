import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candidateId } from '@oca/domain';
import { describe, expect, it, vi } from 'vitest';
import { openDatabase } from './client.js';
import { applyMigrations } from './migrate.js';
import { CandidateRepository } from './repositories/candidate-repository.js';

describe('local candidate initialization', () => {
  it('creates one candidate, preserves existing state on replay, and survives reopening', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'rolevia-workspace-'));
    const path = join(directory, 'workspace.sqlite');
    const db = openDatabase(path);
    try {
      await applyMigrations(db);
      const repository = new CandidateRepository(db);
      await repository.createCandidate(candidateId('unrelated'), 1000);
      const first = await repository.ensureCandidate(
        candidateId('personal'),
        2000,
      );
      expect(first).toEqual({
        id: 'personal',
        createdAt: new Date(2000),
        updatedAt: new Date(2000),
      });
      expect(
        await repository.ensureCandidate(candidateId('personal'), 9000),
      ).toEqual(first);
      expect(
        db.sqlite!.prepare('select count(*) as total from candidates').get()!
          .total,
      ).toBe(2);
      expect(
        db
          .sqlite!.prepare('select count(*) as total from candidate_claims')
          .get()!.total,
      ).toBe(0);
      await db.close();
      const reopened = openDatabase(path);
      try {
        expect(
          await new CandidateRepository(reopened).ensureCandidate(
            candidateId('personal'),
            12000,
          ),
        ).toEqual(first);
      } finally {
        await reopened.close();
      }
    } finally {
      await db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('recovers a committed insert after the response read fails', async () => {
    const db = openDatabase(':memory:');
    try {
      await applyMigrations(db);
      const repository = new CandidateRepository(db);
      vi.spyOn(repository, 'getCandidate').mockRejectedValueOnce(
        new Error('read interrupted'),
      );
      await expect(
        repository.ensureCandidate(candidateId('personal'), 1000),
      ).rejects.toThrow('read interrupted');
      expect(
        await repository.ensureCandidate(candidateId('personal'), 9000),
      ).toEqual({
        id: 'personal',
        createdAt: new Date(1000),
        updatedAt: new Date(1000),
      });
      expect(
        db.sqlite!.prepare('select count(*) as total from candidates').get()!
          .total,
      ).toBe(1);
    } finally {
      await db.close();
    }
  });

  it('serializes separate processes released together into one durable identity', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'rolevia-workspace-race-'));
    const path = join(directory, 'race.sqlite');
    const db = openDatabase(path);
    const children: ReturnType<typeof spawn>[] = [];
    try {
      await applyMigrations(db);
      const code = `
        import { openDatabase } from ${JSON.stringify(new URL('./client.ts', import.meta.url).href)};
        import { CandidateRepository } from ${JSON.stringify(new URL('./repositories/candidate-repository.ts', import.meta.url).href)};
        const db = openDatabase(process.argv[1]);
        process.send({ ready: true });
        process.once('message', async () => {
          try { const result = await new CandidateRepository(db).ensureCandidate('personal', Number(process.argv[2])); process.send({ result }); }
          catch (error) { process.send({ error: error.message }); process.exitCode = 1; }
          finally { await db.close(); process.disconnect(); }
        });`;
      const results: Promise<unknown>[] = [];
      const ready: Promise<void>[] = [];
      for (let i = 0; i < 4; i++) {
        const child = spawn(
          process.execPath,
          [
            '--conditions=development',
            '--import',
            'tsx',
            '--input-type=module',
            '-e',
            code,
            path,
            String(1000 + i),
          ],
          { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
        );
        children.push(child);
        let stderr = '';
        child.stderr!.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        ready.push(
          new Promise((resolve, reject) => {
            child.on('message', (message: { ready?: boolean }) => {
              if (message.ready) resolve();
            });
            child.on('error', reject);
            child.on('exit', (code) => {
              if (code) reject(new Error(stderr));
            });
          }),
        );
        results.push(
          new Promise((resolve, reject) => {
            let result: unknown;
            child.on(
              'message',
              (message: { result?: unknown; error?: string }) => {
                if (message.error) reject(new Error(message.error));
                if (message.result) result = message.result;
              },
            );
            child.on('error', reject);
            child.on('exit', (code) => {
              if (code !== 0 || !result)
                reject(new Error(stderr || 'initializer did not return'));
              else resolve(result);
            });
          }),
        );
      }
      await Promise.all(ready);
      for (const child of children) child.send('start');
      const values = await Promise.all(results);
      expect(values).toHaveLength(4);
      for (const value of values) expect(value).toEqual(values[0]);
      expect(
        db.sqlite!.prepare('select count(*) as total from candidates').get()!
          .total,
      ).toBe(1);
    } finally {
      for (const child of children) if (child.exitCode === null) child.kill();
      await db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 20000);
});
