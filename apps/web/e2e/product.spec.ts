import { expect, test } from '@playwright/test';

test.beforeEach(({ page }) => {
  page.on('pageerror', (error) => {
    throw new Error(`Uncaught page error: ${error.message}`);
  });
});

test('all seven primary navigation routes render successfully in the browser runtime', async ({
  page,
}) => {
  const routes = [
    { url: '/overview', expectedHeading: /Good afternoon|Overview/i },
    { url: '/discover', expectedHeading: /Discover Jobs/i },
    { url: '/matches', expectedHeading: /^Matches$/i },
    { url: '/applications', expectedHeading: /^Applications$/i },
    { url: '/insights', expectedHeading: /^Career Insights$/i },
    { url: '/activity', expectedHeading: /^Agent Activity$/i },
    { url: '/settings', expectedHeading: /^Settings$/i },
  ];

  for (const { url, expectedHeading } of routes) {
    await page.goto(url);
    await expect(
      page.getByRole('link', { name: 'Rolevia Overview' }),
    ).toHaveCount(1);
    await expect(
      page.getByText('Open Career Agent', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: expectedHeading }),
    ).toBeVisible();
    await expect(page.locator('.route-error-page')).not.toBeVisible();
  }
});

test('legacy route aliases redirect to canonical V1 destinations and render content', async ({
  page,
}) => {
  const redirects = [
    {
      from: '/today',
      to: /\/overview$/,
      expectedHeading: /Good afternoon|Overview/i,
    },
    {
      from: '/opportunities',
      to: /\/discover$/,
      expectedHeading: /^Discover Jobs$/i,
    },
    {
      from: '/signals',
      to: /\/insights$/,
      expectedHeading: /^Career Insights$/i,
    },
    { from: '/profile', to: /\/settings$/, expectedHeading: /^Settings$/i },
    {
      from: '/search',
      to: /\/discover\?tab=preferences$/,
      expectedHeading: /^Discover Jobs$/i,
    },
  ];

  for (const { from, to, expectedHeading } of redirects) {
    await page.goto(from);
    await expect(page).toHaveURL(to);
    await expect(
      page.getByRole('heading', { name: expectedHeading }),
    ).toBeVisible();
    if (from === '/search') {
      await expect(
        page.getByRole('button', { name: 'Search Preferences' }),
      ).toHaveClass(/button-primary/);
    }
  }
});

test('opens a priority opportunity and inspects Eligibility evidence', async ({
  page,
}) => {
  await page.goto('/overview');
  await expect(
    page.getByRole('heading', { name: 'Priority matches' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'View analysis' }).first().click();
  await expect(
    page.getByRole('heading', {
      name: /Platform Engineer, Developer Experience/i,
    }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Eligibility' }).click();
  await expect(
    page.getByRole('heading', { name: /Can I realistically pursue/i }),
  ).toBeVisible();
  await expect(
    page.getByText(/Work authorization and geography/i),
  ).toBeVisible();
});

test('filters for conflicting sponsorship and opens the result in Discover Jobs', async ({
  page,
}) => {
  await page.goto('/discover');
  await page.getByLabel('Filter by sponsorship').selectOption('Conflicting');
  await expect(page.getByText('of 16 jobs')).toBeVisible();
  await page.getByRole('link', { name: 'Full-stack Engineer' }).click();
  await expect(
    page.getByText('This is unknown, not a negative answer'),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Evidence' }).click();
  await expect(page.getByText('Role-specific policy')).toBeVisible();
  await expect(page.getByText('General engineering policy')).toBeVisible();
});

test('navigates Applications and inspects activity history', async ({
  page,
}, testInfo) => {
  await page.goto('/overview');
  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page.getByRole('link', { name: 'Applications' }).click();
  await expect(
    page.getByRole('heading', { name: 'Applications' }),
  ).toBeVisible();
  await expect(
    page.getByText('Candidate marked submitted').first(),
  ).toBeVisible();
  await expect(page.getByText('Recorded by Candidate').first()).toBeVisible();
  await expect(page.getByText(/2026/).first()).toBeVisible();
  await expect(page.getByText(/2001/)).toHaveCount(0);
});

test('navigates Matches, Career Insights, Agent Activity, and Settings', async ({
  page,
}, testInfo) => {
  await page.goto('/overview');

  const openNavIfNeeded = async () => {
    if (testInfo.project.name === 'mobile-chromium') {
      await page.getByRole('button', { name: 'Open navigation' }).click();
    }
  };

  await openNavIfNeeded();
  await page.getByRole('link', { name: 'Matches' }).click();
  await expect(
    page.getByRole('heading', { name: 'Matches', exact: true }),
  ).toBeVisible();

  await openNavIfNeeded();
  await page.getByRole('link', { name: 'Career Insights' }).click();
  await expect(
    page.getByRole('heading', { name: 'Career Insights', exact: true }),
  ).toBeVisible();

  await openNavIfNeeded();
  await page.getByRole('link', { name: 'Agent Activity' }).click();
  await expect(
    page.getByRole('heading', { name: 'Agent Activity', exact: true }),
  ).toBeVisible();

  await openNavIfNeeded();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible();
});

test('mobile navigation and dark theme remain usable', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-chromium',
    'Mobile-specific interaction',
  );
  await page.goto('/overview');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});
