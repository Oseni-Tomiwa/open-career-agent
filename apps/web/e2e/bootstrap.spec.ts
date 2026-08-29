import { expect, test } from '@playwright/test';

test('renders the development bootstrap surface', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: 'Open Career Agent development environment',
    }),
  ).toBeVisible();
  await expect(page.getByText(/not the product dashboard/i)).toBeVisible();
});
