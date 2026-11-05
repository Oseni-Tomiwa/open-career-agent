import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
let child: ChildProcess;
let sequence = 0;
interface Inspection {
  candidate: { id: string; createdAt: string; updatedAt: string } | null;
  count: number;
  records: Record<string, number>;
}
interface FixtureMessage {
  id?: number;
  error?: string;
  ready?: boolean;
  result?: unknown;
}
function call(command: 'inspect'): Promise<Inspection>;
function call(command: string, mode?: string): Promise<unknown>;
function call(command: string, mode?: string): Promise<unknown> {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off('message', message);
      reject(new Error('Fixture response timed out'));
    }, 10000);
    function message(value: FixtureMessage) {
      if (value.id !== id) return;
      clearTimeout(timer);
      child.off('message', message);
      if (value.error) reject(new Error(value.error));
      else resolve(value.result);
    }
    child.on('message', message);
    child.send({ id, command, mode });
  });
}
test.beforeEach(async () => {
  const env = Object.fromEntries(
    ['PATH', 'HOME', 'TMPDIR', 'LANG', 'TERM']
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  Object.assign(env, { NODE_ENV: 'test', TSX_DISABLE_CACHE: '1' });
  child = fork(resolve('scripts/workspace-fixture.ts'), [], {
    execArgv: ['--conditions=development', '--import', 'tsx'],
    env,
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let stderr = '';
  child.stderr?.on('data', (value: Buffer) => {
    stderr += value.toString();
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Fixture startup timed out: ${stderr}`)),
      15000,
    );
    child.once('error', reject);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Fixture exited ${code}: ${stderr}`));
    });
    child.once('message', (message: FixtureMessage) => {
      clearTimeout(timer);
      if (message.ready) resolve();
      else reject(new Error('Fixture was not ready'));
    });
  });
});
test.afterEach(async () => {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Fixture cleanup timed out'));
    }, 10000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
});
async function empty(page: Page) {
  await expect(
    page.getByRole('heading', { name: 'Your personal workspace is ready' }),
  ).toBeVisible();
  await expect(
    page.getByText('0 opportunities', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('0 applications', { exact: true })).toBeVisible();
  await expect(page.getByText('Fictional development dataset')).toHaveCount(0);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test('fresh setup, keyboard confirmation, reload and API restart retain one identity', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/overview');
  const create = page.getByRole('button', { name: 'Create my workspace' });
  await expect(create).toBeVisible();
  expect((await call('inspect')).count).toBe(0);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('first-run.png'),
    fullPage: true,
  });
  let releaseSetup!: () => void;
  const pendingSetup = new Promise<void>((resolve) => {
    releaseSetup = resolve;
  });
  await page.route('**/local-workspace', async (route) => {
    if (route.request().method() === 'POST') await pendingSetup;
    await route.continue();
  });
  await create.focus();
  expect(
    await create.evaluate((el) => getComputedStyle(el).outlineStyle),
  ).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Creating workspace…' }),
  ).toBeDisabled();
  await expect(page.locator('main.local-workspace')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await page.screenshot({
    path: info.outputPath('initializing.png'),
    fullPage: true,
  });
  releaseSetup();
  const open = page.getByRole('button', { name: 'Open my workspace' });
  await expect(open).toBeFocused();
  await page.screenshot({
    path: info.outputPath('initialized.png'),
    fullPage: true,
  });
  await page.keyboard.press('Enter');
  await empty(page);
  const before = await call('inspect');
  expect(before.count).toBe(1);
  expect(before.candidate?.id).toBe('e2e-personal');
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('empty-light.png'),
    fullPage: true,
  });
  await page.evaluate(() => {
    localStorage.setItem('oca-theme', 'dark');
  });
  await page.reload();
  await empty(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    path: info.outputPath('empty-dark.png'),
    fullPage: true,
  });
  await call('restart');
  await page.reload();
  await empty(page);
  expect(await call('inspect')).toEqual(before);
  expect(errors).toEqual([]);
  await page.getByRole('link', { name: 'Career Profile', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible();
  await page.goto('/overview');
  await page
    .getByRole('link', { name: 'Search Preferences', exact: true })
    .click();
  await expect(page).toHaveURL(/\/discover\?tab=preferences$/);
});
test('two first-run tabs initialize concurrently and a repeated request stays idempotent', async ({
  page,
  context,
}) => {
  const second = await context.newPage();
  await Promise.all([page.goto('/overview'), second.goto('/overview')]);
  await expect(
    page.getByRole('button', { name: 'Create my workspace' }),
  ).toBeVisible();
  await expect(
    second.getByRole('button', { name: 'Create my workspace' }),
  ).toBeVisible();
  expect((await call('inspect')).count).toBe(0);
  let arrivals = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  await context.route('**/local-workspace', async (route) => {
    if (route.request().method() === 'POST') {
      arrivals++;
      if (arrivals === 2) release();
      await barrier;
    }
    await route.continue();
  });
  await Promise.all([
    page.getByRole('button', { name: 'Create my workspace' }).click(),
    second.getByRole('button', { name: 'Create my workspace' }).click(),
  ]);
  await expect(
    page.getByRole('button', { name: 'Open my workspace' }),
  ).toBeVisible();
  await expect(
    second.getByRole('button', { name: 'Open my workspace' }),
  ).toBeVisible();
  const before = await call('inspect');
  expect(before.count).toBe(1);
  const replay = await page.evaluate(async () => {
    const response = await fetch('http://127.0.0.1:4311/local-workspace', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return {
      status: response.status,
      body: (await response.json()) as unknown,
    };
  });
  expect(replay.status).toBe(200);
  expect(replay.body).toMatchObject({ candidate: { id: 'e2e-personal' } });
  expect(await call('inspect')).toEqual(before);
});
test('returning populated workspace preserves claims, opportunities and applications without setup POST', async ({
  page,
}) => {
  await call('populate');
  const before = await call('inspect');
  expect(before.records).toEqual({
    candidate_claims: 1,
    opportunities: 1,
    applications: 1,
  });
  const methods: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/local-workspace'))
      methods.push(request.method());
  });
  await page.goto('/overview');
  await expect(
    page.getByRole('heading', { name: 'Today', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create my workspace' }),
  ).toHaveCount(0);
  await page.goto('/discover');
  await expect(
    page.getByText('Existing workspace role', { exact: true }).first(),
  ).toBeVisible();
  await page.goto('/applications');
  await expect(
    page.getByText('Existing workspace role', { exact: true }).first(),
  ).toBeVisible();
  await page.goto('/settings');
  await expect(
    page.getByText('Existing profile skill', { exact: true }).first(),
  ).toBeVisible();
  expect(methods.every((method) => method === 'GET')).toBe(true);
  expect(await call('inspect')).toEqual(before);
});
test('API unavailable is distinct from first-run and retry recovers', async ({
  page,
}, info) => {
  await page.route('**/local-workspace', (route) =>
    route.abort('connectionrefused'),
  );
  await page.goto('/overview');
  await expect(page.getByRole('alert')).toContainText('could not read');
  await expect(
    page.getByRole('button', { name: 'Create my workspace' }),
  ).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('api-unavailable.png'),
    fullPage: true,
  });
  await page.unroute('**/local-workspace');
  await page.getByRole('button', { name: 'Retry connection' }).click();
  await expect(
    page.getByRole('button', { name: 'Create my workspace' }),
  ).toBeVisible();
  expect((await call('inspect')).count).toBe(0);
});
test('storage failure during initialization stays honest and retry succeeds', async ({
  page,
}, info) => {
  await page.goto('/overview');
  await expect(
    page.getByRole('button', { name: 'Create my workspace' }),
  ).toBeVisible();
  await call('restart', 'broken');
  await page.getByRole('button', { name: 'Create my workspace' }).click();
  await expect(page.getByRole('alert')).toContainText('safe to retry');
  await page.screenshot({
    path: info.outputPath('setup-failure.png'),
    fullPage: true,
  });
  await call('restart');
  await page.getByRole('button', { name: 'Retry setup' }).click();
  await page.getByRole('button', { name: 'Open my workspace' }).click();
  await empty(page);
  expect((await call('inspect')).count).toBe(1);
});
test('disabled and unauthorized initialization never show personal data', async ({
  page,
}, info) => {
  await call('restart', 'disabled');
  await page.goto('/overview');
  await expect(
    page.getByRole('heading', { name: 'Local setup is disabled' }),
  ).toBeVisible();
  expect((await call('inspect')).count).toBe(0);
  await page.screenshot({
    path: info.outputPath('setup-disabled.png'),
    fullPage: true,
  });
  await call('restart');
  await page.route('**/local-workspace', (route) =>
    route.continue({
      headers: { ...route.request().headers(), 'x-forwarded-for': '127.0.0.1' },
    }),
  );
  await page.getByRole('button', { name: 'Retry connection' }).click();
  await expect(
    page.getByRole('heading', { name: 'Local setup is not authorized' }),
  ).toBeVisible();
  expect((await call('inspect')).count).toBe(0);
  await noOverflow(page);
});

test('setup and failure states support the dark theme and keyboard retry', async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem('oca-theme', 'dark'));
  await page.goto('/overview');
  await expect(
    page.getByRole('button', { name: 'Create my workspace' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('setup-dark.png'),
    fullPage: true,
  });
  await call('restart', 'broken');
  await page.getByRole('button', { name: 'Create my workspace' }).click();
  await expect(page.getByRole('alert')).toContainText('safe to retry');
  const retry = page.getByRole('button', { name: 'Retry setup' });
  await expect(retry).toBeFocused();
  await page.screenshot({
    path: info.outputPath('failure-dark.png'),
    fullPage: true,
  });
  await call('restart');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Open my workspace' }),
  ).toBeFocused();
});
