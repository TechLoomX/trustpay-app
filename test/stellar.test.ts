import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NEXT_PUBLIC_CONTRACT_ID = 'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2';
process.env.NEXT_PUBLIC_RPC_URL = 'https://soroban-testnet.stellar.org';
process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

// Real, checksum-valid StrKeys (generated once via Keypair.random() /
// StrKey.encodeContract) — nativeToScVal(..., {type: 'address'}) round-trips
// through the real Address class in these tests, which rejects anything
// that doesn't check out.
const SOURCE = 'GAGDDHINRDAHGBOLGL3DGTNZTPKOEZBWCSXRS55MSWV7U66CVMWFFCGV';
const FREELANCER = 'GDIMJLOMEWH5VUZ2IKGJTMSLREQTF3FMUOG42CVUPZCBWJZVBGEUNNZI';
const TOKEN = 'CB2GMAPCUGDCCI7TY2KJJILKMAUXJYO5HO7Q23Z5PEREOYZ6EYDBT7I6';

vi.mock('@stellar/freighter-api', () => ({
  getAddress: vi.fn(async () => ({ address: SOURCE })),
  signTransaction: vi.fn(async () => ({ signedTxXdr: 'SIGNED_XDR', signerAddress: SOURCE })),
}));

interface RecordedCall {
  method: string;
  args: unknown[];
}

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>();
  const calls: RecordedCall[] = [];

  class MockContract {
    constructor(public contractId: string) {}
    call(method: string, ...args: unknown[]) {
      calls.push({ method, args: args.map((a) => actual.scValToNative(a as never)) });
      return { __op: 'invokeHostFunction', method };
    }
  }

  class MockTransactionBuilder {
    constructor(_account: unknown, _opts: unknown) {}
    addOperation() {
      return this;
    }
    setTimeout() {
      return this;
    }
    build() {
      return { toXDR: () => 'UNSIGNED_XDR' };
    }
    static fromXDR(xdr: string) {
      return { __signed: true, xdr };
    }
  }

  class MockServer {
    async getAccount(pubkey: string) {
      return { accountId: () => pubkey };
    }
    async prepareTransaction(tx: { toXDR: () => string }) {
      return tx;
    }
    async sendTransaction() {
      return { status: 'PENDING', hash: 'deadbeef' };
    }
    async pollTransaction() {
      return {
        status: actual.rpc.Api.GetTransactionStatus.SUCCESS,
        returnValue: actual.nativeToScVal(BigInt(42), { type: 'u64' }),
      };
    }
  }

  return {
    ...actual,
    Contract: MockContract,
    TransactionBuilder: MockTransactionBuilder,
    rpc: { ...actual.rpc, Server: MockServer },
    __getCalls: () => calls,
    __resetCalls: () => {
      calls.length = 0;
    },
  };
});

import * as stellar from '@/lib/stellar';
import { sha256Bytes } from '@/lib/hash';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sdkMock = (await import('@stellar/stellar-sdk')) as any;

beforeEach(() => {
  sdkMock.__resetCalls();
});

describe('lib/stellar', () => {
  it('createEscrow invokes create_escrow with client/freelancer/token/amounts/hashes', async () => {
    const milestones = [
      { title: 'Design', description: 'Ship the mockups', amount: '1000' },
      { title: 'Build', description: 'Ship the build', amount: '2000' },
    ];
    const expectedHashes = await Promise.all(milestones.map((m) => sha256Bytes(m.description)));

    const result = await stellar.createEscrow(FREELANCER, TOKEN, milestones);

    expect(result).toEqual({ escrowId: 42, txHash: 'deadbeef' });

    const [call] = sdkMock.__getCalls();
    expect(call.method).toBe('create_escrow');
    expect(call.args[0]).toBe(SOURCE);
    expect(call.args[1]).toBe(FREELANCER);
    expect(call.args[2]).toBe(TOKEN);
    expect(call.args[3]).toEqual([1000n, 2000n]);
    expect((call.args[4] as Buffer[]).map((b) => Buffer.from(b))).toEqual(
      expectedHashes.map((h) => Buffer.from(h)),
    );
  });

  it('rejects createEscrow client-side when there are no milestones', async () => {
    await expect(stellar.createEscrow(FREELANCER, TOKEN, [])).rejects.toThrow(/at least one milestone/i);
    expect(sdkMock.__getCalls()).toHaveLength(0);
  });

  it('rejects createEscrow client-side when an amount is not positive', async () => {
    await expect(
      stellar.createEscrow(FREELANCER, TOKEN, [{ title: 't', description: 'd', amount: '0' }]),
    ).rejects.toThrow(/positive/i);
    expect(sdkMock.__getCalls()).toHaveLength(0);
  });

  it('deposit invokes deposit(escrow_id, milestone_index)', async () => {
    await stellar.deposit(7, 1);
    expect(sdkMock.__getCalls()).toEqual([{ method: 'deposit', args: [7n, 1] }]);
  });

  it('submitMilestone invokes submit_milestone(escrow_id, milestone_index)', async () => {
    await stellar.submitMilestone(7, 1);
    expect(sdkMock.__getCalls()).toEqual([{ method: 'submit_milestone', args: [7n, 1] }]);
  });

  it('approveMilestone invokes approve_milestone(escrow_id, milestone_index)', async () => {
    await stellar.approveMilestone(7, 1);
    expect(sdkMock.__getCalls()).toEqual([{ method: 'approve_milestone', args: [7n, 1] }]);
  });

  it('raiseDispute invokes raise_dispute(escrow_id, milestone_index, caller)', async () => {
    await stellar.raiseDispute(7, 1);
    expect(sdkMock.__getCalls()).toEqual([
      { method: 'raise_dispute', args: [7n, 1, SOURCE] },
    ]);
  });

  it('refund invokes refund(escrow_id, milestone_index)', async () => {
    await stellar.refund(7, 1);
    expect(sdkMock.__getCalls()).toEqual([{ method: 'refund', args: [7n, 1] }]);
  });

  it('cancelEscrow invokes cancel_escrow(escrow_id)', async () => {
    await stellar.cancelEscrow(7);
    expect(sdkMock.__getCalls()).toEqual([{ method: 'cancel_escrow', args: [7n] }]);
  });
});
