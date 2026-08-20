// A single Supabase client, created once, using only the anon key (RLS-scoped
// — never the service role key, which belongs to trustpay-api). Auth is
// wired through the `accessToken` option rather than supabase.auth, since
// our session is a wallet-signature JWT minted by trustpay-api's
// auth-verify function, not Supabase's own auth system. Every REST call and
// Realtime subscription made through this client is automatically scoped by
// the RLS policies in trustpay-api/supabase/migrations/0002_rls_policies.sql.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import { ensureFreshToken, isTokenStale } from './auth';

interface Session {
  walletAddress: string;
  token: string;
}

let session: Session | null = null;
let client: SupabaseClient | null = null;

/** Called by the auth flow once sign-in succeeds, and again on silent refresh. */
export function setSession(walletAddress: string, token: string): void {
  session = { walletAddress, token };
}

export function clearSession(): void {
  session = null;
}

export function getSession(): Session | null {
  return session;
}

/**
 * The Supabase client's `accessToken` callback fires before every request.
 * If the stored token is missing or about to expire, it silently re-runs
 * the challenge/verify signature (no transaction, no funds affected) before
 * the request goes out, per the spec's session-expiry behavior.
 */
async function getAccessToken(): Promise<string | null> {
  if (!session) return null;
  if (isTokenStale(session.token)) {
    const token = await ensureFreshToken(session.walletAddress, session.token);
    session = { walletAddress: session.walletAddress, token };
  }
  return session.token;
}

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
      accessToken: getAccessToken,
    });
  }
  return client;
}
