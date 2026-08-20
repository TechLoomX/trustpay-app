// Must match trustpay-api's hash function exactly:
//   - indexer/src/hash.ts (sha256Hex, Node's crypto)
//   - the Postgres trigger in supabase/migrations/0001_initial_schema.sql
//     (`encode(digest(long_description, 'sha256'), 'hex')`)
// Both assume sha256-hex over the UTF-8 description text. That's the
// convention this file follows too — if the contract or API repo's hash
// function changes, this must change with it.

/** Lowercase hex sha256 of `input`, computed with the browser's Web Crypto API. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** The same digest, as the 32-byte array the contract's BytesN<32> expects. */
export async function sha256Bytes(input: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}
