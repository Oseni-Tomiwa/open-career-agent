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

test('Career Profile batch, development, history, and retirement workflows remain usable', async ({
  page,
}) => {
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { name: 'What Rolevia knows about you' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add multiple facts' }).click();
  await page.getByRole('button', { name: 'Add another fact' }).click();
  const categories = page.getByLabel('Profile category');
  const facts = page.getByLabel('Fact', { exact: true });
  await categories.nth(0).fill('language');
  await facts.nth(0).fill('Synthetic acceptance language');
  await categories.nth(1).fill('project');
  await facts.nth(1).fill('Synthetic acceptance project');
  await page.getByLabel('What Rolevia knows').nth(1).selectOption('SUPPORTED');
  await page
    .getByLabel('Your supporting statement')
    .fill('Synthetic browser-only supporting Evidence.');
  await page.getByRole('button', { name: 'Review facts' }).click();
  await expect(
    page.getByRole('heading', { name: 'Review facts before saving' }),
  ).toBeVisible();
  await expect(page.getByText('Synthetic acceptance language')).toBeVisible();
  await expect(page.getByText('Synthetic acceptance project')).toBeVisible();
  await page.getByRole('button', { name: 'Save 2 facts' }).click();
  await expect(page.getByText('Synthetic acceptance language')).toBeVisible();

  const nodeCard = page
    .getByText('Node.js', { exact: true })
    .locator('xpath=ancestor::article');
  await nodeCard.getByRole('button', { name: 'Correct or update' }).click();
  await nodeCard
    .getByLabel(/Professional development — the previous information was true/)
    .check();
  await nodeCard.getByLabel('Updated scope').fill('Synthetic newer scope');
  await nodeCard
    .getByLabel('Supporting statement for the updated fact')
    .fill('Synthetic browser-only development Evidence.');
  await nodeCard.getByRole('button', { name: 'Confirm update' }).click();
  await expect(page.getByText(/Profile history \(1\)/)).toBeVisible();

  const kubernetesCard = page
    .getByText('Kubernetes', { exact: true })
    .locator('xpath=ancestor::article');
  await kubernetesCard
    .getByRole('button', { name: 'No longer current' })
    .click();
  await kubernetesCard
    .getByRole('button', { name: 'Confirm no longer current' })
    .click();
  await expect(
    page
      .getByText('Kubernetes', { exact: true })
      .locator('xpath=ancestor::article'),
  ).toHaveCount(1);

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test('authors, edits, removes, and runs a multi-source Search Preference', async ({
  page,
}) => {
  await page.goto('/discover?tab=preferences');
  await page.getByLabel('greenhouse identifier 1').fill('company-greenhouse');
  await page.getByRole('button', { name: '+ Add job source' }).click();
  await page.getByLabel('Job source 2').selectOption('lever');
  await page.getByLabel('lever identifier 2').fill('company-lever');
  await page.getByRole('button', { name: '+ Add job source' }).click();
  await page.getByLabel('Job source 3').selectOption('ashby');
  await page.getByLabel('ashby identifier 3').fill('company-ashby');
  await page.getByRole('button', { name: 'Save Search Preference' }).click();
  await expect(page.getByText(/updated successfully/i)).toBeVisible();

  await page.getByLabel('lever identifier 2').fill('company-lever-edited');
  await page.getByRole('button', { name: 'Remove source 1' }).click();
  await page.getByRole('button', { name: 'Save Search Preference' }).click();
  await expect(
    page.locator('input[value="company-lever-edited"]'),
  ).toBeVisible();
  await expect(page.locator('input[value="company-ashby"]')).toBeVisible();
  await expect(page.locator('input[value="company-greenhouse"]')).toHaveCount(
    0,
  );

  await page.getByRole('button', { name: 'Run Discovery Now' }).click();
  await expect(page.getByText(/Discovery completed/i)).toBeVisible();
});

test('anonymous browser context starts from root / and can discover, navigate to Sign In, Create Account, authenticate, and sign out', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: 'See your career with greater clarity.',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Create account' }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Sign in' }).first(),
  ).toBeVisible();

  // Navigate to Sign In via link
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible();

  // Navigate to Create Account via link
  await page.getByRole('link', { name: 'Create account' }).first().click();
  await expect(page).toHaveURL(/\/create-account$/);
  await expect(
    page.getByRole('heading', { name: 'Create your Rolevia account' }),
  ).toBeVisible();

  // Navigate to Forgot Password
  await page.goto('/forgot-password');
  await expect(
    page.getByRole('heading', { name: 'Reset your password' }),
  ).toBeVisible();

  // Navigate to Verify Email
  await page.goto('/verify-email');
  await expect(
    page.getByRole('heading', { name: 'Verify your email' }),
  ).toBeVisible();

  // Authenticate into Overview
  await page.goto('/sign-in');
  await page
    .getByRole('button', { name: 'Continue with development profile' })
    .click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(
    page.getByRole('heading', { name: /Good afternoon|Overview/i }),
  ).toBeVisible();

  // Authenticated user navigating to public entry routes redirects to Overview
  await page.goto('/');
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto('/sign-in');
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto('/create-account');
  await expect(page).toHaveURL(/\/overview$/);

  // Authenticated user signs out and returns to anonymous Sign In
  const openNav = page.getByRole('button', { name: 'Open navigation' });
  if (await openNav.isVisible()) {
    await openNav.click();
  }
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible();
});

test('public landing page showcases all core sections, interface tabs, and informational routes without horizontal overflow', async ({
  page,
}) => {
  await page.goto('/');

  // Verify Hero
  await expect(
    page.getByRole('heading', {
      name: 'See your career with greater clarity.',
    }),
  ).toBeVisible();

  // Verify visual opportunity preview card
  await expect(
    page.getByRole('heading', {
      name: 'Staff Distributed Systems Engineer',
    }),
  ).toBeVisible();
  await expect(page.getByText('High-priority recommendation')).toBeVisible();

  // Verify and switch preview tabs
  await expect(
    page.getByRole('heading', {
      name: 'Inspect real evidence, not decorative summaries.',
    }),
  ).toBeVisible();
  const overviewTab = page.getByRole('tab', {
    name: 'Daily Overview & Decisions',
  });
  await overviewTab.click();
  await expect(
    page.getByRole('heading', { name: 'Daily Overview & Decisions Ledger' }),
  ).toBeVisible();

  // Verify 6-stage workflow
  await expect(
    page.getByRole('heading', { name: 'How Rolevia Works' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Build your Career Profile' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Track Your Pipeline' }),
  ).toBeVisible();

  // Verify Principles
  await expect(
    page.getByRole('heading', {
      name: 'Principles of Evidence-Led Intelligence',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No Mystery Percentages' }),
  ).toBeVisible();

  // Verify dedicated routes
  const informationalRoutes = [
    {
      url: '/how-it-works',
      expected: 'How Rolevia Evaluates Opportunities',
    },
    { url: '/features', expected: 'Rolevia Features' },
    { url: '/pricing', expected: 'Rolevia Developer Preview' },
    { url: '/about', expected: 'About Rolevia' },
    { url: '/privacy', expected: 'Privacy Notice' },
    { url: '/terms', expected: 'Terms of Service' },
  ];

  for (const { url, expected } of informationalRoutes) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: expected })).toBeVisible();
  }

  // Verify zero horizontal overflow on public root
  await page.goto('/');
  const hasOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);
});

test('auth split-panel provides password visibility toggle and dynamic requirements indicator', async ({
  page,
}) => {
  await page.goto('/create-account');

  const passwordInput = page.locator('#auth-password');
  await expect(passwordInput).toHaveAttribute('type', 'password');

  // Toggle to show password
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(passwordInput).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(passwordInput).toHaveAttribute('type', 'password');

  // Requirements checklist updates as user types
  const reqIndicator = page.locator('.requirement-indicator');
  await expect(reqIndicator).toHaveClass(/unmet/);

  await passwordInput.fill('short');
  await expect(reqIndicator).toHaveClass(/unmet/);

  await passwordInput.fill('sufficiently-long-secure-password');
  await expect(reqIndicator).toHaveClass(/met/);
});
