import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WalletProvider, useWallet } from '@/components/wallet/WalletProvider';
import { getSession } from '@/lib/supabase';

process.env.NEXT_PUBLIC_API_URL = 'https://project.supabase.co/functions/v1';
process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

const ADDRESS = 'GAGDDHINRDAHGBOLGL3DGTNZTPKOEZBWCSXRS55MSWV7U66CVMWFFCGV';

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(async () => ({ isConnected: true })),
  requestAccess: vi.fn(async () => ({ address: ADDRESS })),
  signMessage: vi.fn(async () => ({ signedMessage: 'c2lnbmF0dXJl', signerAddress: ADDRESS })),
}));

// A minimal JWT: header.payload.signature, with an exp far in the future so
// isTokenStale() treats it as fresh.
function fakeJwt(walletAddress: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ role: 'authenticated', wallet_address: walletAddress, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url');
  return `${header}.${payload}.signature`;
}

function TestHarness() {
  const { address, connected, connect } = useWallet();
  return (
    <div>
      <span data-testid="address">{connected ? address : 'disconnected'}</span>
      <button onClick={() => connect()}>Connect Wallet</button>
    </div>
  );
}

describe('wallet connect flow', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        if (String(url).endsWith('/auth-challenge')) {
          expect(body.walletAddress).toBe(ADDRESS);
          return new Response(JSON.stringify({ message: 'Sign in to TrustPay — nonce: abc' }), { status: 200 });
        }
        if (String(url).endsWith('/auth-verify')) {
          expect(body.walletAddress).toBe(ADDRESS);
          expect(body.signedMessage).toBe('c2lnbmF0dXJl');
          return new Response(JSON.stringify({ token: fakeJwt(ADDRESS) }), { status: 200 });
        }
        throw new Error(`Unexpected fetch to ${url}`);
      }),
    );
  });

  it('connects the wallet, runs the challenge/verify flow, and stores a session for the Supabase client', async () => {
    const user = userEvent.setup();
    render(
      <WalletProvider>
        <TestHarness />
      </WalletProvider>,
    );

    expect(screen.getByTestId('address').textContent).toBe('disconnected');

    await user.click(screen.getByText('Connect Wallet'));

    await waitFor(() => {
      expect(screen.getByTestId('address').textContent).toBe(ADDRESS);
    });

    const session = getSession();
    expect(session?.walletAddress).toBe(ADDRESS);
    expect(session?.token).toBeTruthy();
  });
});
