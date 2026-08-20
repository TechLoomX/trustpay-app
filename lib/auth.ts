// Orchestrates the challenge/verify flow described in the frontend spec's
// "Auth Flow" section, against trustpay-api's actual Edge Functions:
//   POST {API_URL}/auth-challenge  { walletAddress } -> { message }
//   POST {API_URL}/auth-verify     { walletAddress, signedMessage (base64) } -> { token }
// The returned token is a Supabase-compatible JWT (role: authenticated,
// wallet_address custom claim) — see supabase/functions/_shared/jwt.ts in
// trustpay-api. Money-moving actions never go through this path; only
// lib/stellar.ts talks to the contract.
import * as freighter from '@stellar/freighter-api';
import { env } from './env';

interface ApiErrorBody {
  error?: { code: string; message: string };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.apiUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & ApiErrorBody;
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Request to ${path} failed (${res.status}).`);
  }
  return json;
}

async function requestChallenge(walletAddress: string): Promise<string> {
  const { message } = await postJson<{ message: string }>('/auth-challenge', { walletAddress });
  return message;
}

async function verifyChallenge(walletAddress: string, signedMessage: string): Promise<string> {
  const { token } = await postJson<{ token: string }>('/auth-verify', {
    walletAddress,
    signedMessage,
  });
  return token;
}

/** Freighter's signMessage may hand back raw bytes (older API) or an already-base64 string (newer API). */
function toBase64(signedMessage: Buffer | Uint8Array | string): string {
  if (typeof signedMessage === 'string') return signedMessage;
  return Buffer.from(signedMessage).toString('base64');
}

/**
 * Full challenge -> sign -> verify round trip. Signs a message with
 * Freighter (`signMessage`), never a transaction — no funds move and no
 * wallet "confirm payment" screen appears.
 */
export async function signInWithWallet(walletAddress: string): Promise<string> {
  const message = await requestChallenge(walletAddress);

  const signResult = await freighter.signMessage(message, {
    address: walletAddress,
    networkPassphrase: env.networkPassphrase(),
  });
  if (signResult.error || !signResult.signedMessage) {
    throw new Error(signResult.error?.message ?? 'Wallet declined to sign the login message.');
  }

  return verifyChallenge(walletAddress, toBase64(signResult.signedMessage));
}

interface JwtPayload {
  exp?: number;
  wallet_address?: string;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/** True once the token is within `bufferSeconds` of expiring (or already expired/unparseable). */
export function isTokenStale(token: string | null, bufferSeconds = 60): boolean {
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 - bufferSeconds * 1000 <= Date.now();
}

/**
 * Called before any Supabase call: re-runs the lightweight challenge/verify
 * signature (no transaction) if the current token is missing or about to
 * expire, otherwise returns the token unchanged.
 */
export async function ensureFreshToken(
  walletAddress: string,
  currentToken: string | null,
): Promise<string> {
  if (!isTokenStale(currentToken)) return currentToken as string;
  return signInWithWallet(walletAddress);
}
