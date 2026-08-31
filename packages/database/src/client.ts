import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

import {
  drizzle as drizzleSqlite,
  type NodeSQLiteDatabase,
} from 'drizzle-orm/node-sqlite';
import {
  drizzle as drizzlePg,
  type NodePgDatabase,
} from 'drizzle-orm/node-postgres';
import type { DatabaseEngine } from '@oca/config/server';

export type AnyDrizzleDatabase = NodeSQLiteDatabase<any> | NodePgDatabase<any>;

export interface DatabaseHandle {
  readonly engine: DatabaseEngine;
  readonly path?: string;
  readonly url?: string;
  readonly sqlite?: DatabaseSync;
  readonly pgPool?: pg.Pool;
  readonly db: AnyDrizzleDatabase;
  close(): Promise<void> | void;
}

export interface OpenDatabaseOptions {
  readonly engine?: DatabaseEngine;
  readonly databasePath?: string;
  readonly databaseUrl?: string;
}

function assertSafeTestDatabaseUrl(url: string): void {
  const isTestEnvironment =
    process.env.VITEST === 'true' ||
    process.env.NODE_ENV === 'test' ||
    process.env.APP_ENV === 'test';

  if (!isTestEnvironment) return;
  if (process.env.ALLOW_PRODUCTION_TESTING === 'true') return;

  const lower = url.toLowerCase();
  const prodKeywords = [
    '.rds.amazonaws.com',
    '.postgres.database.azure.com',
    '.neon.tech',
    '.cloudql.google.com',
    'prod-',
    '-prod.',
    '/production',
    'rolevia_production',
  ];

  if (prodKeywords.some((keyword) => lower.includes(keyword))) {
    throw new Error(
      `CRITICAL DATABASE SAFETY GUARD: Test suite rejected connection to suspected production database URL '${url}'. Set ALLOW_PRODUCTION_TESTING=true to bypass.`,
    );
  }
}

export function openDatabase(
  optionsOrPath: OpenDatabaseOptions | string,
): DatabaseHandle {
  const options: OpenDatabaseOptions =
    typeof optionsOrPath === 'string'
      ? { engine: 'sqlite', databasePath: optionsOrPath }
      : optionsOrPath;

  const engine = options.engine ?? 'sqlite';

  if (engine === 'postgres') {
    const databaseUrl = options.databaseUrl;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required when DATABASE_ENGINE=postgres');
    }
    assertSafeTestDatabaseUrl(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 20 });
    const db = drizzlePg({ client: pool });
    let closed = false;

    return {
      engine: 'postgres',
      url: databaseUrl,
      pgPool: pool,
      db,
      async close() {
        if (!closed) {
          await pool.end();
          closed = true;
        }
      },
    };
  }

  const databasePath =
    options.databasePath ?? './data/open-career-agent.sqlite';
  const resolvedPath =
    databasePath === ':memory:' ? databasePath : resolve(databasePath);

  if (resolvedPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  }

  const sqlite = new DatabaseSync(resolvedPath);
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec('PRAGMA busy_timeout = 5000');

  const db = drizzleSqlite({ client: sqlite });
  let closed = false;

  return {
    engine: 'sqlite',
    path: resolvedPath,
    sqlite,
    db,
    close() {
      if (!closed) {
        sqlite.close();
        closed = true;
      }
    },
  };
}

export async function databaseIsReady(
  handle: DatabaseHandle,
): Promise<boolean> {
  if (handle.engine === 'postgres' && handle.pgPool) {
    try {
      const res = await handle.pgPool.query(
        "select count(*) as count from information_schema.tables where table_name in ('background_tasks', 'candidates', 'users', 'sessions', 'user_candidates')",
      );
      const count = Number.parseInt(String(res.rows[0]?.count ?? '0'), 10);
      return count === 5;
    } catch {
      return false;
    }
  }

  if (handle.sqlite) {
    const result = handle.sqlite
      .prepare(
        "select count(*) as count from sqlite_master where type = 'table' and name in ('background_tasks', 'candidates', 'users', 'sessions', 'user_candidates')",
      )
      .get() as { count: number } | undefined;
    return result?.count === 5;
  }

  return false;
}
