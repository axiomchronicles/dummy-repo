import { test, expect, type Page } from '@playwright/test';
import { sample } from '../integration/helpers';

const prompt =
  'Call Pawan Kumar on the supplied contact number to ask whether he will attend the CyberCube interview scheduled for 27 October 2026. Simulate without dialing.';

async function signIn(page: Page, who: string) {
  await page.goto('/');
  await page.getByLabel('Demo email').fill(`${who}-${Date.now()}@demo.invalid`);
  await page.getByLabel('Your name').fill(`${who} operator`);
  await page.getByRole('button', { name: 'Enter demo workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'Operations overview' }),
  ).toBeVisible();
}
// Seeds the contact through the real import API; fixture numbers only (+1202555xxxx).
async function seedPawan(page: Page) {
  const imported = await page.request.post('/api/v1/imports', {
    data: {
      filename: 'chat-fixture.csv',
      synthetic: true,
      contentBase64: Buffer.from(
        sample.replace('Alice,', 'Pawan Kumar,'),
      ).toString('base64'),
      mapping: {
        name: 'name',
        phone: 'phone',
        consent: 'consent',
        outcome: 'outcome',
      },
    },
  });
  expect(imported.ok()).toBe(true);
  const id = (await imported.json()).id;
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/v1/imports/${id}`)).json()).status,
    )
    .toBe('ready');
}
const composer = (page: Page) =>
  page.getByRole('textbox', { name: 'Message outreach assistant' });
const noOverflow = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );

test('example prompt: one target, simulation reaches a terminal state, reopen preserves target and mode at 375px', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await signIn(page, 'chat');
  await seedPawan(page);
  await page.goto('/chat');
  await composer(page).fill(prompt);
  await composer(page).press('Enter');
  const review = page.getByRole('button', { name: 'Review call plan' });
  await expect(review).toBeVisible();
  // Exactly one target is prepared and shown.
  await expect(page.locator('.plan-summary')).toHaveCount(1);
  await expect(page.locator('.plan-summary strong').first()).toHaveText(
    'Pawan Kumar',
  );
  await expect(page.locator('.plan-summary')).toContainText('1 eligible');
  await expect(page.locator('.plan-summary')).toContainText('••••0101');
  expect(await noOverflow(page)).toBe(true);

  await review.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toHaveAccessibleName('Review simulation');
  const recipient = drawer.locator('[data-recipient] dd');
  await expect(recipient).toContainText('Pawan Kumar');
  await expect(drawer.locator('[data-recipient]')).toHaveCount(1);
  await expect(drawer.locator('.mode-pill')).toHaveText('SIMULATION');
  await expect(drawer).toContainText('Caller ID (outbound)');
  await expect(drawer).toContainText('2026-10-27');
  await expect(drawer).toContainText('1 eligible');
  // Mode label never wraps mid-word at 375px.
  const pill = await drawer.locator('.mode-pill').boundingBox();
  expect(pill!.height).toBeLessThan(30);
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('review-375.png'),
    animations: 'disabled',
  });

  const cta = drawer.getByRole('button', {
    name: 'Launch simulation',
    exact: true,
  });
  await cta.click();
  await expect(drawer.locator('.review-operation')).toContainText(
    /Operation [0-9a-f-]{36}/,
  );
  await expect(drawer.locator('.review-operation .op-state')).toHaveText(
    /Completed|Failed/,
    {
      timeout: 60000,
    },
  );
  await expect(drawer.getByRole('button', { name: 'Launched' })).toBeDisabled();

  // Close and reopen: target and mode come from the persisted plan, unchanged.
  await drawer.getByRole('button', { name: 'Back to conversation' }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.locator('.operation .op-state')).toHaveText('Completed', {
    timeout: 60000,
  });
  await review.click();
  await expect(recipient).toContainText('Pawan Kumar');
  await expect(drawer.locator('.mode-pill')).toHaveText('SIMULATION');
  await expect(drawer.getByRole('button', { name: 'Launched' })).toBeDisabled();
  await drawer.getByRole('button', { name: 'Back to conversation' }).click();

  await page
    .getByRole('link', { name: 'Transcript and result' })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Structured analysis' }),
  ).toBeVisible();
  await expect(
    page.getByText('Synthetic mock analysis — development only.'),
  ).toBeVisible();
  await expect(page.locator('.transcript-turn').first()).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  // Live monitor: stat row is computed from persisted counts.
  await page.getByRole('link', { name: 'Back to campaign' }).click();
  const stats = page.getByLabel('Campaign counts');
  await expect(stats).toContainText('Attempted');
  await expect(stats).toContainText('Connected');
  await expect(
    stats.locator('div', { hasText: 'Eligible' }).locator('strong'),
  ).toHaveText('1');
  await expect(
    page.getByRole('row').filter({ hasText: 'Pawan Kumar' }),
  ).toContainText('••••0101');
  expect(await noOverflow(page)).toBe(true);
});

test('Agents & Voices shows readiness diagnostics and a truthful voice catalog state at 375px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, 'voices');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('link', { name: 'Agents & Voices', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Sarvam Agents & Voices' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Provider configuration' }),
  ).toBeVisible();
  await page.getByText('Voice', { exact: true }).first().click();
  // Either a real catalog or the server's actual error, never fabricated voices.
  await expect(
    page
      .getByText(/Voice catalog unavailable · |\d+ voices for bulbul/)
      .first(),
  ).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  const small = await page.evaluate(
    () =>
      [...document.querySelectorAll('main .tap')]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width && r.height < 44).length,
  );
  expect(small).toBe(0);
});

test('first streamed delta renders before completion; Stop aborts and Retry recovers', async ({
  page,
}) => {
  await signIn(page, 'stream');
  await page.goto('/chat');
  const prose = page.locator('.chat-message.assistant .chat-prose');
  await composer(page).fill('stream probe');
  await page.getByRole('button', { name: 'Send message' }).click();
  // Stop is shown (stream still open) while only the first chunk is present.
  await expect(prose).toHaveText('First visible delta.');
  await expect(
    page.getByRole('button', { name: 'Stop generation' }),
  ).toBeVisible();
  await expect(composer(page)).toBeDisabled();
  await expect(prose).toHaveText('First visible delta. Generation finished.');
  await expect(
    page.getByRole('button', { name: 'Send message' }),
  ).toBeVisible();

  await composer(page).fill('stream probe');
  await composer(page).press('Enter');
  await expect(prose.last()).toHaveText('First visible delta.');
  await page.getByRole('button', { name: 'Stop generation' }).click();
  await expect(
    page.getByText('Stopped. Saved progress is kept; nothing was launched.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(prose.last()).toHaveText(
    'First visible delta. Generation finished.',
  );
});

test('real call needs explicit confirmation; mode edit persists across drawer reopen', async ({
  page,
}) => {
  await signIn(page, 'edit');
  await seedPawan(page);
  await page.goto('/chat');
  await composer(page).fill(
    'Call Pawan Kumar on the supplied contact number about the CyberCube interview on 27 October 2026.',
  );
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'Review call plan' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toHaveAccessibleName('Confirm a real phone call');
  await expect(drawer.locator('.mode-pill')).toHaveText('REAL CALL');
  const confirm = drawer.getByRole('button', {
    name: 'Confirm real call',
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await expect(
    drawer.getByLabel(/I confirm a real call to Pawan Kumar/),
  ).toBeVisible();

  await drawer.getByRole('button', { name: 'Edit plan', exact: true }).click();
  await drawer.getByLabel('Execution mode').selectOption('simulation');
  await drawer.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(drawer.locator('.mode-pill')).toHaveText('SIMULATION');
  await drawer.getByRole('button', { name: 'Back to conversation' }).click();
  await expect(drawer).not.toBeVisible();
  await page.getByRole('button', { name: 'Review call plan' }).click();
  await expect(drawer.locator('[data-recipient] dd')).toContainText(
    'Pawan Kumar',
  );
  await expect(drawer.locator('.mode-pill')).toHaveText('SIMULATION');
  await expect(drawer).toContainText('2026-10-27');
  await expect(drawer).toContainText('1 eligible');
  await expect(
    drawer.getByRole('button', { name: 'Launch simulation' }),
  ).toBeEnabled();
});
