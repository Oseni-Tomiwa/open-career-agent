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

async function openCapture(page: Page) {
  await page.goto('/overview');
  await page.getByRole('button', { name: 'Create my workspace' }).click();
  await page.getByRole('button', { name: 'Open my workspace' }).click();
  await page
    .getByRole('link', { name: 'Add an opportunity', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Add opportunity', exact: true }),
  ).toBeFocused();
}
async function fillCapture(page: Page, title: string, category = 'Job') {
  await page.getByLabel('Category').selectOption({ label: category });
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page
    .getByLabel('Organization', { exact: true })
    .fill('Example foundation');
  await page
    .getByLabel('Source context', { exact: true })
    .fill('Fictional email referral');
}

test('manual capture preserves categories, source context, dates and revisions', async ({
  page,
}, info) => {
  await openCapture(page);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', {
      name: 'Back to saved opportunities',
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  const category = page.getByLabel('Category');
  await expect(category).toBeFocused();
  const focus = await category.evaluate((node) => ({
    style: getComputedStyle(node).outlineStyle,
    width: getComputedStyle(node).outlineWidth,
    keyboard: node.matches(':focus-visible'),
  }));
  expect(focus).toEqual({ style: 'solid', width: '3px', keyboard: true });
  await page.screenshot({
    path: info.outputPath('saved-keyboard-focus.png'),
    fullPage: true,
  });
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
  await fillCapture(page, 'Fictional Job');
  await page.getByLabel('Deadline (optional)').fill('2020-02-29');
  await expect(page.getByText(/This deadline has passed/)).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('saved-capture.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Save opportunity', exact: true })
    .press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Fictional Job' }),
  ).toBeFocused();
  await expect(
    page.getByText('Manually entered · unverified', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Not evaluated', { exact: true })).toBeVisible();
  await expect(page.getByText('2020-02-29', { exact: true })).toBeVisible();
  await expect(page.getByText('No source URL', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Edit opportunity' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Updated Job');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('heading', { name: 'Updated Job' }),
  ).toBeFocused();
  await page.reload();
  await expect(page.getByText('2020-02-29', { exact: true })).toBeVisible();
  await page.getByText('Revision history', { exact: true }).click();
  await expect(page.getByText(/Revision 1 ·/)).toBeVisible();
  await expect(page.getByText(/Revision 2 ·/)).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('saved-detail.png'),
    fullPage: true,
  });
  for (const kind of [
    'Internship',
    'Freelance contract',
    'Fellowship',
    'Grant',
    'Competition',
    'Hackathon',
  ]) {
    await page
      .getByRole('link', { name: 'Back to saved opportunities', exact: true })
      .click();
    await page
      .getByRole('link', { name: 'Add opportunity', exact: true })
      .click();
    await fillCapture(page, 'Fictional ' + kind, kind);
    if (kind === 'Grant') {
      await page
        .getByLabel('Source URL (optional)')
        .fill('https://example.invalid/grant');
      await page.getByLabel('Source context', { exact: true }).fill('');
    }
    await page
      .getByRole('button', { name: 'Save opportunity', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Fictional ' + kind }),
    ).toBeVisible();
    await expect(page.getByText('No deadline', { exact: true })).toBeVisible();
    if (kind === 'Grant')
      await expect(
        page.getByRole('link', { name: 'https://example.invalid/grant' }),
      ).toHaveAttribute('href', 'https://example.invalid/grant');
  }
  await page
    .getByRole('link', { name: 'Back to saved opportunities', exact: true })
    .click();
  await expect(page.locator('.saved-list > li')).toHaveCount(7);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('saved-list.png'),
    fullPage: true,
  });
});

test('manual retry keeps the exact request, handles duplicates and recovers stale drafts', async ({
  page,
}) => {
  await openCapture(page);
  await fillCapture(page, 'Retry example');
  const requests: { key: string | undefined; body: string | null }[] = [];
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const endpoint =
    'http://127.0.0.1:4311/candidates/e2e-personal/manual-opportunities';
  await page.route(endpoint, async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    requests.push({
      key: req.headers()['idempotency-key'],
      body: req.postData(),
    });
    if (requests.length === 1) {
      await barrier;
      const result = await route.fetch();
      expect(result.status()).toBe(201);
      return route.abort();
    }
    return route.continue();
  });
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  const signOut = page.getByRole('dialog', {
    name: 'Sign out with this draft?',
  });
  await expect(signOut.getByRole('button', { name: 'Go back' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Retry example',
  );
  const save = page.getByRole('button', {
    name: 'Save opportunity',
    exact: true,
  });
  await save.click();
  await expect(save).toBeDisabled();
  await expect(page.getByText('Saving opportunity…')).toBeVisible();
  release();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Retry example',
  );
  await expect(page.getByLabel('Title', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry same save' }).click();
  await expect(
    page.getByRole('heading', { name: 'Retry example' }),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]?.key).toBeTruthy();
  expect(requests[0]).toEqual(requests[1]);
  await page.unroute(endpoint);
  const recordId = page.url().split('/').at(-1)!;
  await page
    .getByRole('link', { name: 'Back to saved opportunities', exact: true })
    .click();
  await expect(page.locator('.saved-list > li')).toHaveCount(1);
  await page
    .getByRole('link', { name: 'Add opportunity', exact: true })
    .click();
  await fillCapture(page, 'Retry example');
  await save.click();
  await expect(
    page.getByRole('region', { name: 'Possible duplicates' }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Open existing Retry example/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'Leave this draft?' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('dialog', { name: 'Leave this draft?' })
      .getByRole('button', { name: 'Go back' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Retry example',
  );
  await page.getByRole('link', { name: /Open existing Retry example/ }).click();
  await page.getByRole('button', { name: 'Discard draft and leave' }).click();
  await expect(page).toHaveURL(
    new RegExp('/saved-opportunities/' + recordId + '$'),
  );
  await page
    .getByRole('link', { name: 'Back to saved opportunities', exact: true })
    .click();
  await page
    .getByRole('link', { name: 'Add opportunity', exact: true })
    .click();
  await fillCapture(page, 'Retry example');
  await save.click();
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await save.click();
  await page
    .getByRole('button', { name: 'Save as separate', exact: true })
    .click();
  await expect(
    page
      .getByRole('dialog', { name: 'Save as separate?' })
      .getByRole('button', { name: 'Go back' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Confirm separate capture' }).click();
  await expect(
    page.getByRole('heading', { name: 'Retry example' }),
  ).toBeVisible();
  expect(page.url().split('/').at(-1)).not.toBe(recordId);
  await page.goto('/saved-opportunities/' + recordId + '/edit');
  await page.getByLabel('Title', { exact: true }).fill('My draft');
  const concurrent = await page.request.patch(endpoint + '/' + recordId, {
    headers: { 'If-Match': '"v1"' },
    data: {
      category: 'JOB',
      title: 'Concurrent edit',
      organization: 'Example foundation',
      sourceContext: 'Another fictional email',
    },
  });
  expect(concurrent.status()).toBe(200);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('changed elsewhere');
  await page.getByRole('button', { name: 'Reload latest revision' }).click();
  await expect(page.getByText(/Revision 2 · Concurrent edit/)).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'My draft',
  );
  await page.getByRole('button', { name: 'Reapply my draft' }).click();
  await expect(page.getByLabel('Source context', { exact: true })).toHaveValue(
    'Another fictional email',
  );
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'My draft' })).toBeFocused();
});

test('manual empty, loading, unavailable and invalid states stay in personal mode', async ({
  page,
}) => {
  await openCapture(page);
  await page
    .getByRole('link', { name: 'Back to saved opportunities', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'No saved opportunities yet' }),
  ).toBeVisible();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const endpoint =
    'http://127.0.0.1:4311/candidates/e2e-personal/manual-opportunities';
  await page.route(endpoint, async (route) => {
    await wait;
    await route.abort();
  });
  await page.reload();
  await expect(
    page.getByText('Loading saved opportunities…', { exact: true }),
  ).toBeVisible();
  release();
  await expect(page.getByRole('alert')).toHaveText(
    'Saved opportunities are unavailable.',
  );
  await expect(
    page.getByRole('heading', { name: 'No saved opportunities yet' }),
  ).toHaveCount(0);
  await page.unroute(endpoint);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No saved opportunities yet' }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Add opportunity', exact: true })
    .click();
  await fillCapture(page, 'Validation example');
  await page.getByLabel('Deadline (optional)').fill('10000-01-01');
  await page
    .getByRole('button', { name: 'Save opportunity', exact: true })
    .click();
  expect(
    await page
      .getByLabel('Deadline (optional)')
      .evaluate((node) => (node as HTMLInputElement).validity.rangeOverflow),
  ).toBe(true);
  await expect(page.getByLabel('Deadline (optional)')).toBeFocused();
  await page.getByLabel('Deadline (optional)').fill('');
  await page.getByLabel('Source URL (optional)').fill('javascript:alert(1)');
  await page
    .getByRole('button', { name: 'Save opportunity', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    'Enter a valid HTTP or HTTPS source URL.',
  );
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Validation example',
  );
});
