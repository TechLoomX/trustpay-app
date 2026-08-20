// Mirrors contracts/escrow/src/errors.rs exactly (variant name -> discriminant).
// Keep this in sync with that file, not the other way around.
export enum ContractErrorCode {
  EscrowNotFound = 1,
  MilestoneNotFound = 2,
  NotAuthorized = 3,
  InvalidStatus = 4,
  InvalidAmount = 5,
  MismatchedLengths = 6,
  EscrowNotActive = 7,
}

const MESSAGES: Record<ContractErrorCode, string> = {
  [ContractErrorCode.EscrowNotFound]: "This escrow doesn't exist.",
  [ContractErrorCode.MilestoneNotFound]: "That milestone doesn't exist on this escrow.",
  [ContractErrorCode.NotAuthorized]: "Your wallet isn't authorized to do that on this escrow.",
  [ContractErrorCode.InvalidStatus]:
    "This milestone isn't in the right state for that action — someone may have already acted on it.",
  [ContractErrorCode.InvalidAmount]: 'Milestone amounts must be greater than zero.',
  [ContractErrorCode.MismatchedLengths]:
    'Every milestone needs both an amount and a description.',
  [ContractErrorCode.EscrowNotActive]: 'This escrow is no longer active (completed or cancelled).',
};

/** A contract error decoded into a message safe to show a user, plus the raw code for logging. */
export class TrustPayContractError extends Error {
  code: ContractErrorCode | null;
  raw: string;

  constructor(code: ContractErrorCode | null, raw: string) {
    super(code !== null ? MESSAGES[code] : 'The transaction failed. Please try again.');
    this.name = 'TrustPayContractError';
    this.code = code;
    this.raw = raw;
  }
}

const CONTRACT_ERROR_PATTERN = /Error\(Contract,\s*#(\d+)\)/;

/**
 * Pulls a `Error(Contract, #N)` code out of a raw error string (as thrown by
 * `server.prepareTransaction` on simulation failure, or found in a failed
 * transaction's diagnostic events) and maps it to a TrustPayContractError.
 * Returns null if the string doesn't contain a recognizable contract error
 * (network errors, wallet rejections, etc. should be handled separately).
 */
export function decodeContractError(raw: string): TrustPayContractError | null {
  const match = raw.match(CONTRACT_ERROR_PATTERN);
  if (!match) return null;
  const code = Number(match[1]);
  const isKnown = Object.values(ContractErrorCode).includes(code);
  return new TrustPayContractError(isKnown ? (code as ContractErrorCode) : null, raw);
}

/**
 * Best-effort human message for any error thrown out of lib/stellar.ts —
 * decodes contract errors, and falls back to readable copy for the other
 * failure modes a wallet-signed transaction can hit.
 */
export function describeError(err: unknown): string {
  if (err instanceof TrustPayContractError) return err.message;

  const raw = err instanceof Error ? err.message : String(err);
  const decoded = decodeContractError(raw);
  if (decoded) return decoded.message;

  if (/User declined access|Freighter is locked|not connected/i.test(raw)) {
    return 'Wallet action was declined or Freighter is locked.';
  }
  if (/insufficient/i.test(raw)) {
    return "Your wallet doesn't have enough balance to cover this.";
  }
  return 'Something went wrong sending that transaction. Please try again.';
}
