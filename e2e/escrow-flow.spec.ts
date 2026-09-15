import { test, expect, type Page } from '@playwright/test';
import { installFreighterMock, setMockWallet } from './mocks/freighter';
import { installSorobanMock } from './mocks/soroban';
import { installSupabaseMock, installRealtimeNoop, createMockDb } from './mocks/supabase';

// Real, checksum-valid StrKeys (same ones used in test/stellar.test.ts).
const CLIENT = 'GAGDDHINRDAHGBOLGL3DGTNZTPKOEZBWCSXRS55MSWV7U66CVMWFFCGV';
const FREELANCER = 'GDIMJLOMEWH5VUZ2IKGJTMSLREQTF3FMUOG42CVUPZCBWJZVBGEUNNZI';
const TOKEN = 'CB2GMAPCUGDCCI7TY2KJJILKMAUXJYO5HO7Q23Z5PEREOYZ6EYDBT7I6';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://placeholder.supabase.co/functions/v1';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015';

/** Waits for the mocked RPC's final poll of a submitted transaction, so a
 *  reload afterward is guaranteed to see the resulting off-chain state
 *  (written synchronously by the Soroban mock's onContractCall, standing in
 *  for trustpay-api's indexer). */
async function waitForMockedTxToSettle(page: Page) {
  await page.waitForResponse((response) => {
    if (!response.url().startsWith(RPC_URL)) return false;
    try {
      const body = JSON.parse(response.request().postData() ?? '{}');
      return body.method === 'getTransaction';
    } catch {
      return false;
    }
  });
}

// The app keeps the wallet session only in React state (see lib/supabase.ts
// / WalletProvider) — no persistence across a hard navigation, by design
// (spec section 3: "stored in memory"). So this whole flow, including these
// helpers, deliberately never calls page.goto()/page.reload() after the
// very first load: a hard nav here would behave exactly like a real reload
// and bounce back to "/", same as it would for an actual user. Every
// "refetch" instead goes through the Dashboard link + a project card click,
// which is real client-side App Router navigation.
async function reconnectAs(page: Page, address: string) {
  await setMockWallet(page, address);
  await page.getByRole('button', { name: /Disconnect/ }).click();
  await expect(page).toHaveURL(`${new URL(page.url()).origin}/`);
  await page.locator('main').getByRole('button', { name: 'Connect Wallet' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function reopenProjectFromDashboard(page: Page, projectPath: string) {
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.locator(`a[href="${projectPath}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${projectPath}$`));
}

test('connect wallet -> create escrow -> deposit -> submit -> approve', async ({ page }) => {
  const db = createMockDb();

  // Stands in for trustpay-api's indexer: once a mocked contract call
  // actually submits (not just simulates), reflect the resulting milestone
  // status in the same off-chain store the UI reads from.
  const statusAfter: Record<string, string> = {
    deposit: 'Funded',
    submit_milestone: 'Submitted',
    approve_milestone: 'Released',
    raise_dispute: 'Disputed',
    refund: 'Refunded',
  };

  await installFreighterMock(page, CLIENT);
  await installSorobanMock(page, {
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    onContractCall: ({ method, args }) => {
      const newStatus = statusAfter[method];
      if (!newStatus) return;
      const escrowId = Number(args[0]);
      const milestoneIndex = Number(args[1]);
      const project = Object.values(db.projects).find((p) => Number(p.escrow_id) === escrowId);
      if (!project) return;
      const milestone = Object.values(db.milestones).find(
        (m) => m.project_id === project.id && Number(m.index) === milestoneIndex,
      );
      if (milestone) milestone.status = newStatus;
    },
  });
  await installSupabaseMock(page, { supabaseUrl: SUPABASE_URL, apiUrl: API_URL, db });
  await installRealtimeNoop(page, { supabaseUrl: SUPABASE_URL });

  let projectPath = '';

  await test.step('connect wallet as client', async () => {
    await page.goto('/');
    await page.locator('main').getByRole('button', { name: 'Connect Wallet' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  await test.step('create escrow', async () => {
    await page.getByRole('link', { name: 'New Escrow' }).click();
    await page.getByPlaceholder('G...').fill(FREELANCER);
    await page.getByPlaceholder('C...').fill(TOKEN);
    await page.getByPlaceholder('Title').fill('Design phase');
    await page.getByPlaceholder('Description').fill('Ship the mockups');
    await page.getByPlaceholder(/amount/i).fill('1000');
    await page.getByRole('button', { name: 'Create Escrow' }).click();
    // Careful: /\/projects\/[^/]+$/ also matches /projects/new itself
    // ("new" satisfies [^/]+), which would resolve this assertion
    // instantly against the pre-redirect URL. Match the uuid explicitly.
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    projectPath = new URL(page.url()).pathname;
  });

  await test.step('client deposits into the Pending milestone', async () => {
    await expect(page.getByText('Pending', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Deposit' }).click();
    await expect(page.getByText('Pending confirmation…')).toBeVisible();
    await waitForMockedTxToSettle(page);
    await reopenProjectFromDashboard(page, projectPath);
    await expect(page.getByText('Funded', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deposit' })).toHaveCount(0);
  });

  await test.step('switch to the freelancer wallet and submit the milestone', async () => {
    await reconnectAs(page, FREELANCER);
    await page.locator(`a[href="${projectPath}"]`).click();
    await expect(page.getByText('Funded', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Pending confirmation…')).toBeVisible();
    await waitForMockedTxToSettle(page);
    await reopenProjectFromDashboard(page, projectPath);
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Raise Dispute' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  });

  await test.step('switch back to the client wallet and approve', async () => {
    await reconnectAs(page, CLIENT);
    await page.locator(`a[href="${projectPath}"]`).click();
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Pending confirmation…')).toBeVisible();
    await waitForMockedTxToSettle(page);
    await reopenProjectFromDashboard(page, projectPath);
    await expect(page.getByText('Released', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Raise Dispute' })).toHaveCount(0);
  });
});
