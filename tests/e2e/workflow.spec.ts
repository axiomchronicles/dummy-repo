import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';

async function signIn(page: Page, purpose: string) {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Enter demo workspace' }),
  ).toBeVisible();
  await page.getByLabel('Your name').fill('Browser acceptance operator');
  await page
    .getByLabel('Demo email')
    .fill(`${purpose}-${Date.now()}@outreach.local`);
  await page.getByRole('button', { name: 'Enter demo workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'Operations overview' }),
  ).toBeVisible();
}

async function json<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/v1${path}`);
  expect(response.ok()).toBe(true);
  return response.json() as Promise<T>;
}

test('reviewed campaign runs through persisted simulation, call inspection and both reports', async ({
  page,
}, testInfo) => {
  const runtimeErrors: string[] = [];
  const externalRequests: string[] = [];
  const liveLaunchCommands: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/launch'))
      liveLaunchCommands.push(request.method());
    if (
      new URL(request.url()).origin !==
      new URL(testInfo.project.use.baseURL!).origin
    )
      externalRequests.push(new URL(request.url()).origin);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'full-flow');
  await expect(
    page.getByText('SIMULATION', { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('desktop-overview.png'),
    fullPage: true,
  });

  const starters = await json<{
    items: {
      id: string;
      name: string;
      description: string;
      currentVersion: number;
    }[];
  }>(page, '/agents');
  expect(starters.items).toHaveLength(5);
  const selectedAgent = starters.items[0]!;
  await page.getByRole('link', { name: 'Agents', exact: true }).click();
  await page
    .getByRole('button', { name: 'Edit persona', exact: true })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByLabel('Description', { exact: true })
    .fill(`${selectedAgent.description} Browser-verified revision.`);
  await page
    .getByRole('button', { name: 'Save persona version', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await json<{ currentVersion: number }>(
            page,
            `/agents/${selectedAgent.id}`,
          )
        ).currentVersion,
    )
    .toBe(selectedAgent.currentVersion + 1);

  await page.getByRole('link', { name: 'Contacts', exact: true }).click();
  const imported = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/imports') &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Use synthetic sample', exact: true })
    .click();
  const importId = ((await (await imported).json()) as { id: string }).id;
  await expect
    .poll(
      async () =>
        (await json<{ validCount: number }>(page, `/imports/${importId}`))
          .validCount,
    )
    .toBe(4);
  await expect(
    page.getByText('Duplicate phone within this import.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Provide a valid phone number and known source region.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Explicit consent evidence is required.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('row')
    .filter({ hasText: 'Invalid Example' })
    .getByRole('button', { name: 'Correct row', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel('phone', { exact: true })
    .fill('+12025550106');
  await page
    .getByRole('button', { name: 'Save and revalidate', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (await json<{ validCount: number }>(page, `/imports/${importId}`))
          .validCount,
    )
    .toBe(5);
  await expect(
    page.getByRole('row').filter({ hasText: 'Invalid Example' }).first(),
  ).toContainText('Valid');
  await page.screenshot({
    path: testInfo.outputPath('desktop-import-validation.png'),
    fullPage: true,
  });

  await page.getByRole('link', { name: 'Campaigns', exact: true }).click();
  await page.getByRole('link', { name: 'New campaign', exact: true }).click();
  await page
    .getByLabel('Campaign name', { exact: true })
    .fill('Browser acceptance simulation');
  await page
    .getByLabel('What should this campaign achieve?')
    .fill(
      'Collect genuine recorded answers from synthetic customer research contacts.',
    );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByLabel('Validated contact import').locator('option').nth(1),
  ).toBeAttached();
  await page.getByLabel('Validated contact import').selectOption(importId);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Calling timezone').fill('UTC');
  await page.getByLabel('Budget cap (₹)').fill('12.34');
  await page.getByLabel('Estimated reserve per call (₹)').fill('2.50');
  await page.getByLabel('Window starts').fill('00:00');
  await page.getByLabel('Window ends').fill('23:59');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page
    .getByRole('button', { name: 'Save and build plan', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Run simulation', exact: true }),
  ).toBeVisible();
  const campaignId = new URL(page.url()).pathname.split('/').at(-1)!;
  const planned = await json<{
    status: string;
    mode: string;
    plan: { eligibleCount: number; agentVersionId: string; planner: string };
  }>(page, `/campaigns/${campaignId}`);
  expect(planned).toMatchObject({
    status: 'planned',
    mode: 'simulation',
    plan: { eligibleCount: 5, planner: 'deterministic-local' },
    policy: { budgetMinor: 1234, estimatedCostPerCallMinor: 250 },
  });
  const versions = await json<{ items: { id: string; version: number }[] }>(
    page,
    `/agents/${selectedAgent.id}/versions`,
  );
  expect(planned.plan.agentVersionId).toBe(versions.items[0]!.id);
  expect(
    (
      await json<{ items: unknown[] }>(
        page,
        `/campaigns/${campaignId}/attempts`,
      )
    ).items,
  ).toHaveLength(0);
  await page.screenshot({
    path: testInfo.outputPath('desktop-plan-review.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Run simulation', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('No phone is called.');
  expect(
    (
      await json<{ items: unknown[] }>(
        page,
        `/campaigns/${campaignId}/attempts`,
      )
    ).items,
  ).toHaveLength(0);
  await page
    .getByRole('button', { name: 'Confirm simulation', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByText('Live feed connected', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: 'Browser acceptance simulation',
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await json<{ status: string }>(page, `/campaigns/${campaignId}`))
          .status,
    )
    .toBe('completed');
  await expect(
    page.getByRole('button', { name: 'Generate CSV', exact: true }),
  ).toBeEnabled();
  const attempts = await json<{
    items: { id: string; outcome: string; mode: string }[];
  }>(page, `/campaigns/${campaignId}/attempts`);
  expect(attempts.items).toHaveLength(5);
  expect(new Set(attempts.items.map((attempt) => attempt.outcome))).toEqual(
    new Set(['connected', 'no_answer', 'busy', 'failed']),
  );
  expect(attempts.items.every((attempt) => attempt.mode === 'simulation')).toBe(
    true,
  );
  const persistedEvents = await json<{ items: { id: string }[] }>(
    page,
    `/campaigns/${campaignId}/events`,
  );
  expect(persistedEvents.items.length).toBeGreaterThan(5);
  expect(
    await page.evaluate(
      (id) => sessionStorage.getItem(`outreach-event-cursor:${id}`),
      campaignId,
    ),
  ).not.toBeNull();
  await page.screenshot({
    path: testInfo.outputPath('desktop-campaign-outcomes.png'),
    fullPage: true,
  });
  await page
    .getByRole('tab', { name: 'Execution activity', exact: true })
    .click();
  await expect(
    page.getByRole('tabpanel', { name: 'Execution activity', exact: true }),
  ).toContainText(/Campaign.*completed/i);
  await page.screenshot({
    path: testInfo.outputPath('desktop-execution-activity.png'),
    fullPage: true,
  });
  await page
    .getByRole('tab', { name: 'Contact outcomes', exact: true })
    .click();

  await page
    .getByRole('row')
    .filter({ hasText: 'Avery Example' })
    .getByRole('link', { name: 'Inspect call' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Structured analysis', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Synthetic mock analysis — development only.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.transcript-turn').first()).toBeVisible();
  const callId = new URL(page.url()).pathname.split('/').at(-1)!;
  const call = await json<{
    analysis: {
      synthetic: boolean;
      transcript: unknown[] | null;
      extractedFields: Record<string, unknown>;
    };
  }>(page, `/calls/${callId}`);
  expect(call.analysis.synthetic).toBe(true);
  expect(call.analysis.transcript?.length).toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath('desktop-call-inspector.png'),
    fullPage: true,
  });
  await page
    .getByRole('link', { name: 'Back to campaign', exact: true })
    .click();
  await page.getByRole('button', { name: 'Generate CSV', exact: true }).click();
  await expect(page.getByText('Report request saved.')).toBeVisible();
  await page
    .getByRole('button', { name: 'Generate XLSX', exact: true })
    .click();
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Download CSV', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Download XLSX', exact: true }),
  ).toBeVisible();
  const csvEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download CSV', exact: true }).click();
  const csvDownload = await csvEvent;
  const csvPath = testInfo.outputPath('accepted-report.csv');
  await csvDownload.saveAs(csvPath);
  const csv = await readFile(csvPath, 'utf8');
  expect(csv).toContain('Avery Example');
  expect(csv).toContain('no_answer');
  expect(csv).toContain('busy');
  expect(csv).toContain('simulation');
  const xlsxEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download XLSX', exact: true }).click();
  const xlsxDownload = await xlsxEvent;
  const xlsxPath = testInfo.outputPath('accepted-report.xlsx');
  await xlsxDownload.saveAs(xlsxPath);
  const xlsx = await readFile(xlsxPath);
  expect(xlsx.subarray(0, 2).toString()).toBe('PK');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  expect(workbook.worksheets[0]!.rowCount).toBeGreaterThanOrEqual(
    attempts.items.length + 1,
  );
  expect(
    (
      await json<{ items: { rowCount: number; status: string }[] }>(
        page,
        '/reports',
      )
    ).items.every(
      (report) =>
        report.status === 'completed' &&
        report.rowCount >= attempts.items.length,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('desktop-report-downloads.png'),
    fullPage: true,
  });
  expect(
    (await json<{ liveReady: boolean }>(page, '/integrations')).liveReady,
  ).toBe(false);
  const liveDraftResponse = await page.request.post('/api/v1/campaigns', {
    data: {
      name: 'Unconfigured live review',
      objective: 'Review a live plan without launching any call.',
      importId,
      agentId: selectedAgent.id,
      mode: 'live',
      policy: {
        timezone: 'UTC',
        windowStart: '00:00',
        windowEnd: '23:59',
        concurrency: 1,
        budgetMinor: 1234,
        currency: 'INR',
        estimatedCostPerCallMinor: 250,
      },
    },
  });
  expect(liveDraftResponse.ok()).toBe(true);
  const liveDraftId = ((await liveDraftResponse.json()) as { id: string }).id;
  await page.goto(`/campaigns/${liveDraftId}`);
  await expect(page.getByText('LIVE', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText('SIMULATION DEFAULT', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Build plan', exact: true }).click();
  await page
    .getByRole('button', { name: 'Review live launch', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Confirm live calling');
  await page.screenshot({
    path: testInfo.outputPath('desktop-live-review-no-launch.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(
    (
      await json<{ items: unknown[] }>(
        page,
        `/campaigns/${liveDraftId}/attempts`,
      )
    ).items,
  ).toHaveLength(0);
  expect(liveLaunchCommands).toEqual([]);
  expect(runtimeErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('mobile navigation, persona dialog keyboard behavior and reduced motion', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, 'mobile');
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  const navigationTrigger = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
  });
  await navigationTrigger.click();
  const navigation = page.getByRole('dialog', {
    name: 'Navigation',
    exact: true,
  });
  await expect(navigation).toBeVisible();
  await page.keyboard.press('Tab');
  await expect
    .poll(() =>
      navigation.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    )
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(navigation).not.toBeVisible();
  await expect(navigationTrigger).toBeFocused();
  await navigationTrigger.click();
  await page.screenshot({
    path: testInfo.outputPath('mobile-navigation-sheet.png'),
    fullPage: true,
  });
  await navigation.getByRole('link', { name: 'Agents', exact: true }).click();
  await expect(navigation).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Agent personas', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Close navigation', exact: true }),
  ).not.toBeVisible();
  const trigger = page
    .getByRole('button', { name: 'Edit persona', exact: true })
    .first();
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(/Edit /);
  await page.keyboard.press('Tab');
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('mobile-persona-dialog.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('mobile-agents.png'),
    fullPage: true,
  });
});

test('XLSX contact upload uses explicit column mapping and authoritative row validation', async ({
  page,
}) => {
  await signIn(page, 'xlsx-import');
  await page.getByRole('link', { name: 'Contacts', exact: true }).click();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Contacts');
  sheet.addRow(['Full name', 'Phone', 'Permission', 'Result']);
  sheet.addRow(['Spreadsheet Example', '+12025550109', 'true', 'connected']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  await page.getByLabel('Phone column *', { exact: true }).fill('Phone');
  await page.getByLabel('Name column', { exact: true }).fill('Full name');
  await page.getByLabel('Consent column', { exact: true }).fill('Permission');
  await page.getByLabel('Outcome column', { exact: true }).fill('Result');
  await page.locator('input[type=file]').setInputFiles({
    name: 'acceptance-contacts.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  const imported = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/imports') &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Import and validate', exact: true })
    .click();
  const importId = ((await (await imported).json()) as { id: string }).id;
  await expect
    .poll(
      async () =>
        (await json<{ status: string }>(page, `/imports/${importId}`)).status,
    )
    .toBe('ready');
  await expect(
    page.getByRole('row').filter({ hasText: 'Spreadsheet Example' }).first(),
  ).toContainText('Validated');
  const rows = await json<{
    items: {
      sourceCells: Record<string, unknown>;
      normalizedPhone: string;
      issues: unknown[];
    }[];
  }>(page, `/imports/${importId}/rows`);
  expect(rows.items[0]).toMatchObject({
    normalizedPhone: '+12025550109',
    issues: [],
    sourceCells: { 'Full name': 'Spreadsheet Example' },
  });
  expect(
    (await json<{ items: unknown[] }>(page, '/campaigns')).items,
  ).toHaveLength(0);
});
