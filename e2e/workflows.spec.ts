import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function login(page: import('@playwright/test').Page, persona: string) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp('^' + persona) }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
}
test('request creation, independent review, audit, and notification flow', async ({ browser }) => {
  const title = `Incident workspace ${crypto.randomUUID().slice(0, 8)}`;
  const authorContext = await browser.newContext();
  const reviewerContext = await browser.newContext();
  const author = await authorContext.newPage();
  const reviewer = await reviewerContext.newPage();
  await login(author, 'Casey');
  await author.getByRole('button', { name: 'New request', exact: true }).click();
  await author.getByLabel('Request title').fill(title);
  await author
    .getByLabel('Description')
    .fill('The support team needs a shared workspace for incident coordination.');
  await author.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(author.getByRole('heading', { name: title })).toBeVisible();
  await author.getByRole('button', { name: 'Submit for review' }).click();
  await expect(author.getByText('Your request needs review by someone else.')).toBeVisible();
  await author.getByRole('button', { name: 'Close panel' }).click();
  await login(reviewer, 'Jordan');
  await reviewer.getByRole('button', { name: 'Requests', exact: true }).click();
  await reviewer.getByRole('textbox', { name: 'Search requests' }).fill(title);
  await reviewer.getByRole('button', { name: `Open ${title}`, exact: true }).click();
  await reviewer.getByLabel('Review note').fill('Confirmed the access requirements with support.');
  await reviewer.getByRole('button', { name: 'Approve request' }).click();
  await expect(
    reviewer.getByText('This request is resolved. The decision is recorded in the audit trail.'),
  ).toBeVisible();
  await reviewer.getByRole('button', { name: 'Close panel' }).click();
  await reviewer.getByRole('button', { name: 'Audit trail', exact: true }).click();
  await expect(
    reviewer.getByText('Confirmed the access requirements with support.', { exact: true }),
  ).toBeVisible();
  await author.getByRole('button', { name: /^Notifications/ }).click();
  await expect(author.getByRole('button').filter({ hasText: title })).toBeVisible({
    timeout: 15000,
  });
  await authorContext.close();
  await reviewerContext.close();
});
test('workspace switch clears the visible records and the app remains usable on mobile', async ({
  page,
}) => {
  await login(page, 'Sam');
  await page.getByLabel('Active workspace').selectOption({ label: 'Northstar Labs' });
  await expect(page.getByText('No requests yet')).toBeVisible();
  await page.getByLabel('Active workspace').selectOption({ label: 'Meridian Studio' });
  await expect(
    page.getByRole('button', { name: 'Open Additional analytics subscription', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Requests', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Requests', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New request', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
test('registration, workspace onboarding, and logout work without demo shortcuts', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Full name').fill('Independent evaluator');
  await page.getByLabel('Email address').fill(`evaluator-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('AnEvaluatorPassword!2026');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Your first workspace starts here')).toBeVisible();
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByLabel('Workspace name').fill('Evaluator workspace');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByLabel('Active workspace')).toHaveValue(/.+/);
  await expect(page.getByText('No requests yet')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('sign-in, workspace, and request dialog pass automated accessibility checks', async ({
  page,
}) => {
  const scan = async () => {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({ rule: v.id, targets: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  };
  await page.goto('/');
  await scan();
  await login(page, 'Sam');
  await scan();
  await page.getByRole('button', { name: 'New request', exact: true }).click();
  await scan();
});
