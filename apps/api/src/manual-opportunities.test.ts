import { applyMigrations, openDatabase } from '@oca/database';
import type { ApiConfig } from '@oca/config/server';
import { expect, it } from 'vitest';
import { createApiApp } from './app.js';

const path = '/candidates/personal/manual-opportunities';
const config: ApiConfig = {
  environment: 'development',
  databaseEngine: 'sqlite',
  databasePath: ':memory:',
  migrationMode: 'manual',
  identityMode: 'development',
  host: '127.0.0.1',
  port: 3000,
  webOrigin: 'http://localhost:5173',
  sessionTtlHours: 24,
  localWorkspaceSetupEnabled: false,
};
const body = {
  category: 'HACKATHON',
  title: 'Example',
  organization: 'Team',
  sourceContext: 'Referral',
  deadline: '2028-02-29',
};
const key = '12d66ad9-769c-40ae-9899-f3537138bf02';

it('fails closed without a trusted candidate and rejects spoofed ownership', async () => {
  const database = openDatabase(':memory:');
  await applyMigrations(database);
  database.sqlite!.exec(
    "INSERT INTO candidates (id,created_at,updated_at) VALUES ('personal',0,0)",
  );
  const app = await createApiApp({
    config,
    database,
    closeDatabaseOnClose: false,
  });
  const trusted = await createApiApp({
    config: { ...config, trustedCandidateId: 'personal' },
    database,
    closeDatabaseOnClose: false,
  });
  try {
    expect((await app.inject({ url: path })).statusCode).toBe(403);
    const create = (payload: object, idempotency = key) =>
      trusted.inject({
        method: 'POST',
        url: path,
        headers: { 'idempotency-key': idempotency },
        payload,
      });
    expect(
      (await create({ ...body, ownerCandidateId: 'other' })).statusCode,
    ).toBe(422);
    expect((await create({ ...body, deadline: '2027-02-29' })).statusCode).toBe(
      422,
    );
    expect(
      (
        await create({
          ...body,
          sourceContext: null,
          sourceUrl: 'javascript:alert(1)',
        })
      ).statusCode,
    ).toBe(422);
    expect((await create({ ...body, sourceContext: null })).statusCode).toBe(
      422,
    );
    const saved = await create(body);
    expect(saved.statusCode).toBe(201);
    expect(saved.headers.etag).toBe('"v1"');
    expect(saved.headers['cache-control']).toBe('no-store');
    expect((await create(body)).statusCode).toBe(200);
    expect((await create({ ...body, title: 'Different' })).statusCode).toBe(
      409,
    );
    const duplicate = await create(
      body,
      '46436c29-e3d8-446f-9ca1-2c3887e883e1',
    );
    expect(duplicate.statusCode).toBe(409);
    const separate = await create(
      { ...body, acknowledgement: duplicate.json().error.acknowledgement },
      '46436c29-e3d8-446f-9ca1-2c3887e883e1',
    );
    expect(separate.statusCode).toBe(201);
    const id = saved.json().record.id as string;
    const url = path + '/' + id;
    expect((await trusted.inject({ url })).json().revisions).toHaveLength(1);
    expect(
      (await trusted.inject({ url: '/opportunities/' + id })).statusCode,
    ).toBe(404);
    expect(
      (await trusted.inject({ url: path.replace('personal', 'other') }))
        .statusCode,
    ).toBe(403);
    expect(
      (await trusted.inject({ method: 'PATCH', url, payload: body }))
        .statusCode,
    ).toBe(428);
    expect(
      (
        await trusted.inject({
          method: 'PATCH',
          url,
          headers: { 'if-match': '"v2"' },
          payload: body,
        })
      ).statusCode,
    ).toBe(412);
    expect(
      (
        await trusted.inject({
          method: 'PATCH',
          url,
          headers: { 'if-match': '"v1"' },
          payload: body,
        })
      ).headers.etag,
    ).toBe('"v1"');
  } finally {
    await app.close();
    await trusted.close();
    await database.close();
  }
});
