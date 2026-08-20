import { describe, expect, it } from 'vitest';
import { sha256Hex, sha256Bytes } from '@/lib/hash';

describe('lib/hash', () => {
  // Known-answer test: sha256("") is a well-known constant, which also pins
  // this down to the sha256-hex convention trustpay-api's indexer and
  // Postgres trigger assume.
  it('matches the known sha256 hex digest of the empty string', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('matches the known sha256 hex digest of a fixed string', async () => {
    expect(await sha256Hex('hello world')).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });

  it('is deterministic for the same input', async () => {
    const a = await sha256Hex('Ship the landing page redesign');
    const b = await sha256Hex('Ship the landing page redesign');
    expect(a).toBe(b);
  });

  it('produces different hashes for different descriptions', async () => {
    const a = await sha256Hex('Milestone one');
    const b = await sha256Hex('Milestone two');
    expect(a).not.toBe(b);
  });

  it('sha256Bytes returns the 32-byte digest matching sha256Hex', async () => {
    const bytes = await sha256Bytes('match me');
    const hex = await sha256Hex('match me');
    expect(bytes).toHaveLength(32);
    expect(Buffer.from(bytes).toString('hex')).toBe(hex);
  });
});
