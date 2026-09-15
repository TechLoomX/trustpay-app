// Mocks the Soroban JSON-RPC endpoint lib/stellar.ts talks to
// (getLedgerEntries, simulateTransaction, sendTransaction, getTransaction),
// so the e2e flow exercises the real invoke path — build, simulate, sign
// (via the Freighter mock), submit, poll — without hitting a live network.
//
// The exact request/response shapes here aren't guessed: they were verified
// against the installed @stellar/stellar-sdk (16.2.x) by constructing and
// round-tripping each XDR structure in Node before writing this file (see
// PR description). In particular:
//   - getAccount() only reads `entry.seqNum()` off whatever LedgerEntryData
//     comes back — it never cross-checks the entry against the requested
//     address — so one fixed dummy Account entry answers every
//     getLedgerEntries call.
//   - prepareTransaction()'s simulate step accepts `transactionData: ""`
//     (SorobanDataBuilder treats falsy input as "build an empty default"),
//     so no footprint/resource-fee XDR needs to be hand-built.
//   - Nothing in this app reads resultXdr's operation results, only
//     resultMetaXdr's sorobanMeta().returnValue() — so resultXdr's
//     `results` array can stay empty.
import type { Page, Route } from '@playwright/test';
import {
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

const DUMMY_ACCOUNT = 'GAGDDHINRDAHGBOLGL3DGTNZTPKOEZBWCSXRS55MSWV7U66CVMWFFCGV';
const MOCK_ESCROW_ID = 7;

function buildAccountLedgerKeyXdr(): string {
  const accountId = Keypair.fromPublicKey(DUMMY_ACCOUNT).xdrAccountId();
  return xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId })).toXDR('base64');
}

function buildAccountLedgerEntryXdr(): string {
  const accountId = Keypair.fromPublicKey(DUMMY_ACCOUNT).xdrAccountId();
  const entry = new xdr.AccountEntry({
    accountId,
    balance: xdr.Int64.fromString('100000000000'),
    seqNum: xdr.Int64.fromString('1'),
    numSubEntries: 0,
    inflationDest: null,
    flags: 0,
    homeDomain: '',
    thresholds: Buffer.from([1, 1, 1, 1]),
    signers: [],
    ext: new xdr.AccountEntryExt(0),
  });
  return xdr.LedgerEntryData.account(entry).toXDR('base64');
}

function returnValueForMethod(method: string): xdr.ScVal {
  if (method === 'create_escrow') {
    return nativeToScVal(BigInt(MOCK_ESCROW_ID), { type: 'u64' });
  }
  return xdr.ScVal.scvVoid();
}

function buildSuccessResultXdr(): string {
  const result = xdr.TransactionResultResult.txSuccess([]);
  const txResult = new xdr.TransactionResult({
    feeCharged: xdr.Int64.fromString('100'),
    result,
    ext: new xdr.TransactionResultExt(0),
  });
  return txResult.toXDR('base64');
}

function buildSuccessResultMetaXdr(returnValue: xdr.ScVal): string {
  const sorobanMeta = new xdr.SorobanTransactionMeta({
    ext: new xdr.SorobanTransactionMetaExt(0),
    events: [],
    returnValue,
    diagnosticEvents: [],
  });
  const v3 = new xdr.TransactionMetaV3({
    ext: new xdr.ExtensionPoint(0),
    txChangesBefore: [],
    operations: [],
    txChangesAfter: [],
    sorobanMeta,
  });
  return new xdr.TransactionMeta(3, v3).toXDR('base64');
}

interface DecodedInvocation {
  method: string;
  args: unknown[];
}

function decodeInvocation(transactionXdr: string, networkPassphrase: string): DecodedInvocation | null {
  const tx = TransactionBuilder.fromXDR(transactionXdr, networkPassphrase);
  if (!('operations' in tx)) return null;
  const op = tx.operations[0];
  if (!op || op.type !== 'invokeHostFunction' || !op.func.invokeContract) return null;
  const invoke = op.func.invokeContract();
  return {
    method: invoke.functionName().toString(),
    args: invoke.args().map((a) => scValToNative(a)),
  };
}

export interface ContractCallEvent {
  method: string;
  args: unknown[];
}

interface PendingTx {
  method: string;
  returnValue: xdr.ScVal;
  envelopeXdr: string;
}

/**
 * Installs the mock and returns nothing — call `onContractCall` (passed in
 * options) to react to a submitted (not just simulated) transaction, e.g.
 * to update off-chain mock state the way trustpay-api's indexer would after
 * observing the real on-chain event.
 */
export async function installSorobanMock(
  page: Page,
  opts: { rpcUrl: string; networkPassphrase: string; onContractCall?: (event: ContractCallEvent) => void },
): Promise<void> {
  const pending = new Map<string, PendingTx>();
  let hashCounter = 0;

  await page.route(`${opts.rpcUrl}**`, async (route: Route) => {
    const request = route.request();
    const body = request.postDataJSON() as { id: unknown; method: string; params?: Record<string, unknown> };
    const respond = (result: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
      });

    switch (body.method) {
      case 'getLedgerEntries': {
        respond({
          entries: [{ key: buildAccountLedgerKeyXdr(), xdr: buildAccountLedgerEntryXdr(), lastModifiedLedgerSeq: 1 }],
          latestLedger: 1000,
        });
        return;
      }
      case 'simulateTransaction': {
        const transactionXdr = body.params?.transaction as string;
        const decoded = decodeInvocation(transactionXdr, opts.networkPassphrase);
        const returnValue = returnValueForMethod(decoded?.method ?? '');
        respond({
          id: '1',
          latestLedger: 1000,
          events: [],
          transactionData: '',
          minResourceFee: '100000',
          results: [{ auth: [], xdr: returnValue.toXDR('base64') }],
        });
        return;
      }
      case 'sendTransaction': {
        const transactionXdr = body.params?.transaction as string;
        const decoded = decodeInvocation(transactionXdr, opts.networkPassphrase);
        const method = decoded?.method ?? 'unknown';
        const hash = `mockhash${++hashCounter}`.padEnd(64, '0');
        pending.set(hash, {
          method,
          returnValue: returnValueForMethod(method),
          envelopeXdr: transactionXdr,
        });
        if (decoded) opts.onContractCall?.({ method: decoded.method, args: decoded.args });
        respond({
          status: 'PENDING',
          hash,
          latestLedger: 1000,
          latestLedgerCloseTime: Math.floor(Date.now() / 1000),
        });
        return;
      }
      case 'getTransaction': {
        const hash = body.params?.hash as string;
        const tx = pending.get(hash);
        if (!tx) {
          respond({
            status: 'NOT_FOUND',
            latestLedger: 1000,
            latestLedgerCloseTime: Math.floor(Date.now() / 1000),
            oldestLedger: 1,
            oldestLedgerCloseTime: 1,
          });
          return;
        }
        respond({
          status: 'SUCCESS',
          latestLedger: 1000,
          latestLedgerCloseTime: Math.floor(Date.now() / 1000),
          oldestLedger: 1,
          oldestLedgerCloseTime: 1,
          ledger: 999,
          createdAt: Math.floor(Date.now() / 1000),
          applicationOrder: 1,
          feeBump: false,
          envelopeXdr: tx.envelopeXdr,
          resultXdr: buildSuccessResultXdr(),
          resultMetaXdr: buildSuccessResultMetaXdr(tx.returnValue),
        });
        return;
      }
      default:
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -1, message: `unmocked method ${body.method}` } }),
        });
    }
  });
}
