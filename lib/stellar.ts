// Every function here builds a transaction invoking the deployed
// trustpay-contract escrow contract, has the connected Freighter wallet sign
// it, submits it, and resolves once it lands on-chain. Nothing in this file
// talks to trustpay-api — that boundary is intentional, see the repo README.
//
// Function names/args/errors mirror contracts/escrow/src/lib.rs and
// errors.rs exactly:
//   create_escrow(client, freelancer, token, milestone_amounts, milestone_hashes) -> u64
//   deposit(escrow_id, milestone_index)
//   submit_milestone(escrow_id, milestone_index)
//   approve_milestone(escrow_id, milestone_index)
//   raise_dispute(escrow_id, milestone_index, caller)
//   refund(escrow_id, milestone_index)
//   cancel_escrow(escrow_id)
import {
  BASE_FEE,
  Contract,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import * as freighter from '@stellar/freighter-api';
import { env } from './env';
import { sha256Bytes } from './hash';
import { decodeContractError } from './errors';
import type { NewMilestoneInput } from './types';

export interface TxResult {
  txHash: string;
}

export interface CreateEscrowResult extends TxResult {
  escrowId: number;
}

async function getConnectedAddress(): Promise<string> {
  const result = await freighter.getAddress();
  if (result.error || !result.address) {
    throw new Error('Connect your Freighter wallet first.');
  }
  return result.address;
}

function getServer(): rpc.Server {
  return new rpc.Server(env.rpcUrl());
}

/**
 * Builds, simulates, signs (via Freighter), submits, and awaits confirmation
 * of a single contract invocation. Throws a TrustPayContractError (readable
 * message) when the contract itself rejects the call, or a plain Error for
 * wallet/network failures.
 */
async function invoke<T>(
  method: string,
  args: xdr.ScVal[],
  sourcePublicKey: string,
): Promise<{ value: T | undefined; txHash: string }> {
  const server = getServer();
  const contract = new Contract(env.contractId());
  const account = await server.getAccount(sourcePublicKey);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: env.networkPassphrase(),
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  let prepared: Transaction;
  try {
    prepared = await server.prepareTransaction(tx);
  } catch (err) {
    // Business-logic errors (EscrowNotFound, InvalidStatus, ...) surface here,
    // during simulation, before the wallet is ever asked to sign.
    const message = err instanceof Error ? err.message : String(err);
    throw decodeContractError(message) ?? new Error(message);
  }

  const signResult = await freighter.signTransaction(prepared.toXDR(), {
    networkPassphrase: env.networkPassphrase(),
    address: sourcePublicKey,
  });
  if (signResult.error || !signResult.signedTxXdr) {
    throw new Error(signResult.error?.message ?? 'Wallet declined to sign the transaction.');
  }

  const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, env.networkPassphrase());
  const sendResponse = await server.sendTransaction(signedTx);

  if (sendResponse.status === 'ERROR') {
    throw new Error('The network rejected this transaction before it could run.');
  }

  const result = await server.pollTransaction(sendResponse.hash, {
    attempts: 30,
    sleepStrategy: rpc.LinearSleepStrategy,
  });

  if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
    // The contract's own validation already ran during prepareTransaction
    // above, so a failure at this stage usually means on-chain state moved
    // between simulation and submission (e.g. someone else acted on the
    // same milestone first). Decoding the exact contract error out of
    // resultXdr/diagnosticEvents at this stage isn't implemented yet —
    // flagged as a known gap, same as trustpay-api's own "known assumptions".
    throw new Error(
      `Transaction failed on-chain (hash ${sendResponse.hash}). It may have been superseded by another action on this milestone.`,
    );
  }
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(
      `Transaction is still pending after multiple checks (hash ${sendResponse.hash}). Check Stellar Expert for its final status.`,
    );
  }

  const value = result.returnValue ? (scValToNative(result.returnValue) as T) : undefined;
  return { value, txHash: sendResponse.hash };
}

function scU64(value: number): xdr.ScVal {
  return nativeToScVal(BigInt(value), { type: 'u64' });
}

function scU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: 'u32' });
}

function scAddress(address: string): xdr.ScVal {
  return nativeToScVal(address, { type: 'address' });
}

export async function createEscrow(
  freelancerAddress: string,
  tokenAddress: string,
  milestones: NewMilestoneInput[],
): Promise<CreateEscrowResult> {
  // Mirrors the contract's own validation (create_escrow in lib.rs) so users
  // get instant feedback instead of a failed transaction.
  if (milestones.length === 0) {
    throw new Error('At least one milestone is required.');
  }
  for (const m of milestones) {
    if (!(Number(m.amount) > 0)) {
      throw new Error('Milestone amounts must be positive.');
    }
  }

  const client = await getConnectedAddress();
  const hashes = await Promise.all(milestones.map((m) => sha256Bytes(m.description)));

  const args = [
    scAddress(client),
    scAddress(freelancerAddress),
    scAddress(tokenAddress),
    xdr.ScVal.scvVec(
      milestones.map((m) => nativeToScVal(BigInt(m.amount), { type: 'i128' })),
    ),
    xdr.ScVal.scvVec(hashes.map((h) => nativeToScVal(h, { type: 'bytes' }))),
  ];

  const { value, txHash } = await invoke<bigint>('create_escrow', args, client);
  if (value === undefined) {
    throw new Error('create_escrow succeeded but returned no escrow id.');
  }
  return { escrowId: Number(value), txHash };
}

export async function deposit(escrowId: number, milestoneIndex: number): Promise<TxResult> {
  const source = await getConnectedAddress();
  const { txHash } = await invoke('deposit', [scU64(escrowId), scU32(milestoneIndex)], source);
  return { txHash };
}

export async function submitMilestone(escrowId: number, milestoneIndex: number): Promise<TxResult> {
  const source = await getConnectedAddress();
  const { txHash } = await invoke(
    'submit_milestone',
    [scU64(escrowId), scU32(milestoneIndex)],
    source,
  );
  return { txHash };
}

export async function approveMilestone(escrowId: number, milestoneIndex: number): Promise<TxResult> {
  const source = await getConnectedAddress();
  const { txHash } = await invoke(
    'approve_milestone',
    [scU64(escrowId), scU32(milestoneIndex)],
    source,
  );
  return { txHash };
}

export async function raiseDispute(escrowId: number, milestoneIndex: number): Promise<TxResult> {
  const source = await getConnectedAddress();
  // The contract takes `caller` as an explicit argument (in addition to
  // requiring its auth) so it can tell whether the client or the freelancer
  // raised the dispute — that's always the connected wallet here.
  const { txHash } = await invoke(
    'raise_dispute',
    [scU64(escrowId), scU32(milestoneIndex), scAddress(source)],
    source,
  );
  return { txHash };
}

export async function refund(escrowId: number, milestoneIndex: number): Promise<TxResult> {
  const source = await getConnectedAddress();
  const { txHash } = await invoke('refund', [scU64(escrowId), scU32(milestoneIndex)], source);
  return { txHash };
}

export async function cancelEscrow(escrowId: number): Promise<TxResult> {
  const source = await getConnectedAddress();
  const { txHash } = await invoke('cancel_escrow', [scU64(escrowId)], source);
  return { txHash };
}
