import { describe, expect, it } from 'vitest';
import {
  ContractErrorCode,
  decodeContractError,
  describeError,
  TrustPayContractError,
} from '@/lib/errors';

// Cover every variant in contracts/escrow/src/errors.rs.
describe('decodeContractError', () => {
  it.each([
    [ContractErrorCode.EscrowNotFound, "This escrow doesn't exist."],
    [ContractErrorCode.MilestoneNotFound, "That milestone doesn't exist on this escrow."],
    [ContractErrorCode.NotAuthorized, "Your wallet isn't authorized to do that on this escrow."],
    [
      ContractErrorCode.InvalidStatus,
      "This milestone isn't in the right state for that action — someone may have already acted on it.",
    ],
    [ContractErrorCode.InvalidAmount, 'Milestone amounts must be greater than zero.'],
    [ContractErrorCode.MismatchedLengths, 'Every milestone needs both an amount and a description.'],
    [ContractErrorCode.EscrowNotActive, 'This escrow is no longer active (completed or cancelled).'],
  ])('decodes contract error code %i into a readable message', (code, expectedMessage) => {
    const raw = `HostError: Error(Contract, #${code})\nHost: contract failed with code #${code}`;
    const decoded = decodeContractError(raw);
    expect(decoded).toBeInstanceOf(TrustPayContractError);
    expect(decoded?.code).toBe(code);
    expect(decoded?.message).toBe(expectedMessage);
  });

  it('returns null for strings without a contract error pattern', () => {
    expect(decodeContractError('some unrelated network failure')).toBeNull();
  });

  it('returns an error with a null code for an unrecognized contract error number', () => {
    const decoded = decodeContractError('Error(Contract, #99)');
    expect(decoded).toBeInstanceOf(TrustPayContractError);
    expect(decoded?.code).toBeNull();
  });
});

describe('describeError', () => {
  it('unwraps a TrustPayContractError message as-is', () => {
    const err = new TrustPayContractError(ContractErrorCode.NotAuthorized, 'raw');
    expect(describeError(err)).toBe("Your wallet isn't authorized to do that on this escrow.");
  });

  it('decodes a contract error embedded in a plain Error', () => {
    const err = new Error('simulation failed: Error(Contract, #4)');
    expect(describeError(err)).toBe(
      "This milestone isn't in the right state for that action — someone may have already acted on it.",
    );
  });

  it('gives a readable message for a declined wallet signature', () => {
    expect(describeError(new Error('User declined access'))).toMatch(/declined|locked/i);
  });

  it('falls back to a generic message for unknown errors', () => {
    expect(describeError(new Error('totally unexpected'))).toMatch(/went wrong/i);
  });
});
