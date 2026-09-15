// Mocks trustpay-api's off-chain surface: the auth-challenge/auth-verify
// Edge Functions and a minimal PostgREST-shaped in-memory store standing in
// for Supabase's REST API, covering exactly the calls this app's code
// actually makes (see lib/auth.ts, lib/supabase.ts, and every `.from(...)`
// call site under app/ and components/).
//
// Deliberately does not replicate Supabase Realtime's Phoenix-channel
// websocket protocol — `installRealtimeNoop` just accepts the socket so the
// app's `.subscribe()` calls don't attempt a real network connection, and
// this test suite verifies state by navigating/reloading (a real signal:
// "did the write actually persist and come back correctly on refetch?")
// rather than by asserting on a live push. Live-push behavior already has
// dedicated coverage in test/realtime.test.tsx.
import type { Page, Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export interface MockDb {
  projects: Record<string, Record<string, unknown>>;
  milestones: Record<string, Record<string, unknown>>;
  notifications: Record<string, Record<string, unknown>>;
}

export function createMockDb(): MockDb {
  return { projects: {}, milestones: {}, notifications: {} };
}

function base64url(input: object | string): string {
  const json = typeof input === 'string' ? input : JSON.stringify(input);
  return Buffer.from(json).toString('base64url');
}

function fakeJwt(walletAddress: string): string {
  const header = base64url({ alg: 'HS256', typ: 'JWT' });
  const payload = base64url({
    role: 'authenticated',
    wallet_address: walletAddress,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `${header}.${payload}.mock-signature`;
}

// Mirrors the DEFAULT clauses in supabase/migrations/0001_initial_schema.sql
// — the mock store doesn't have Postgres applying these for us.
const COLUMN_DEFAULTS: Partial<Record<keyof MockDb, Record<string, unknown>>> = {
  projects: { status: 'Active', confirmed: false },
  milestones: { status: 'Pending' },
  notifications: { read: false },
};

function wantsSingleObject(route: Route): boolean {
  const accept = route.request().headers()['accept'] ?? '';
  return accept.includes('vnd.pgrst.object');
}

function matchesEqFilters(row: Record<string, unknown>, params: URLSearchParams): boolean {
  for (const [key, value] of params.entries()) {
    if (['select', 'order', 'limit', 'or'].includes(key)) continue;
    if (value.startsWith('eq.')) {
      const expected = value.slice(3);
      if (String(row[key]) !== expected) return false;
    }
  }
  return true;
}

function matchesOr(row: Record<string, unknown>, params: URLSearchParams): boolean {
  const or = params.get('or');
  if (!or) return true;
  // e.g. "(client_wallet.eq.G...,freelancer_wallet.eq.G...)"
  const clauses = or.replace(/^\(|\)$/g, '').split(',');
  return clauses.some((clause) => {
    const [column, op, value] = clause.split('.');
    if (!column || op !== 'eq') return false;
    return String(row[column]) === value;
  });
}

export async function installSupabaseMock(
  page: Page,
  opts: { supabaseUrl: string; apiUrl: string; db: MockDb },
): Promise<void> {
  const { db } = opts;

  await page.route(`${opts.apiUrl}/auth-challenge`, async (route) => {
    const body = route.request().postDataJSON() as { walletAddress: string };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: `Sign in to TrustPay — nonce: mock-nonce-${body.walletAddress}` }),
    });
  });

  await page.route(`${opts.apiUrl}/auth-verify`, async (route) => {
    const body = route.request().postDataJSON() as { walletAddress: string };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: fakeJwt(body.walletAddress) }),
    });
  });

  await page.route(`${opts.supabaseUrl}/rest/v1/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.replace('/rest/v1/', '') as keyof MockDb;
    const store = db[table];
    if (!store) {
      await route.fulfill({ status: 404, body: JSON.stringify({ error: `unmocked table ${table}` }) });
      return;
    }

    const params = url.searchParams;

    if (request.method() === 'GET') {
      let rows = Object.values(store).filter((r) => matchesEqFilters(r, params) && matchesOr(r, params));
      const select = params.get('select') ?? '';
      if (table === 'projects' && select.includes('milestones(')) {
        rows = rows.map((project) => ({
          ...project,
          milestones: Object.values(db.milestones).filter((m) => m.project_id === project.id),
        }));
      }
      if (wantsSingleObject(route)) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows[0] ?? null) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
      }
      return;
    }

    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      const rowsIn = Array.isArray(body) ? body : [body];
      const inserted = rowsIn.map((row) => {
        const withId = {
          id: randomUUID(),
          created_at: new Date().toISOString(),
          ...COLUMN_DEFAULTS[table],
          ...row,
        };
        store[withId.id as string] = withId;
        return withId;
      });
      const responseBody = wantsSingleObject(route) ? inserted[0] : inserted;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(responseBody) });
      return;
    }

    if (request.method() === 'PATCH') {
      const body = request.postDataJSON();
      const matches = Object.values(store).filter((r) => matchesEqFilters(r, params));
      for (const row of matches) Object.assign(row, body);
      const responseBody = wantsSingleObject(route) ? matches[0] : matches;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseBody) });
      return;
    }

    await route.fulfill({ status: 405, body: 'unsupported method in mock' });
  });
}

export async function installRealtimeNoop(page: Page, opts: { supabaseUrl: string }): Promise<void> {
  const wsUrl = opts.supabaseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
  await page.routeWebSocket(`${wsUrl}/realtime/v1/websocket**`, () => {
    // Accept the connection and do nothing — see file header for why this
    // is sufficient for this suite's assertions.
  });
}
