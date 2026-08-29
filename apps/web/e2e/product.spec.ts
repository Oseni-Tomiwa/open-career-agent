import { expect, test } from '@playwright/test';

test('opens a priority opportunity and inspects Eligibility evidence', async ({
  page,
}) => {
  await page.goto('/today');
  await expect(
    page.getByRole('heading', { name: 'Priority opportunities' }),
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

test('filters for conflicting sponsorship and opens the result', async ({
  page,
}) => {
  await page.goto('/opportunities');
  await page.getByLabel('Filter by sponsorship').selectOption('Conflicting');
  await expect(page.getByText('1 of 16 opportunities')).toBeVisible();
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
  await page.goto('/today');
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
});

test('mobile navigation and dark theme remain usable', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-chromium',
    'Mobile-specific interaction',
  );
  await page.goto('/today');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('link', { name: 'Career Profile' }).click();
  await expect(
    page.getByRole('heading', { name: 'Career Profile' }),
  ).toBeVisible();
});
