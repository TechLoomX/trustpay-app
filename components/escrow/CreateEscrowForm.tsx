'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StrKey } from '@stellar/stellar-sdk';
import { createEscrow } from '@/lib/stellar';
import { getSupabaseClient } from '@/lib/supabase';
import { sha256Hex } from '@/lib/hash';
import { describeError } from '@/lib/errors';
import { useWallet } from '@/components/wallet/WalletProvider';
import type { NewMilestoneInput } from '@/lib/types';

function emptyMilestone(): NewMilestoneInput {
  return { title: '', description: '', amount: '' };
}

/**
 * Client-side mirror of create_escrow's own validation (lib.rs): at least
 * one milestone, and every amount strictly positive. Catches bad input
 * before it ever reaches the wallet, instead of failing the transaction.
 */
function validate(freelancerAddress: string, tokenAddress: string, milestones: NewMilestoneInput[]): string | null {
  if (!StrKey.isValidEd25519PublicKey(freelancerAddress)) {
    return "Freelancer address isn't a valid Stellar public key.";
  }
  if (!StrKey.isValidContract(tokenAddress)) {
    return "Token address isn't a valid Soroban contract address.";
  }
  if (milestones.length === 0) {
    return 'Add at least one milestone.';
  }
  for (const m of milestones) {
    if (!m.title.trim()) return 'Every milestone needs a title.';
    if (!m.description.trim()) return 'Every milestone needs a description.';
    if (!(Number(m.amount) > 0)) return 'Milestone amounts must be positive.';
  }
  return null;
}

export function CreateEscrowForm() {
  const { address } = useWallet();
  const router = useRouter();
  const [freelancerAddress, setFreelancerAddress] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [milestones, setMilestones] = useState<NewMilestoneInput[]>([emptyMilestone()]);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'idle' | 'awaiting-wallet' | 'saving-metadata'>('idle');
  const [error, setError] = useState<string | null>(null);

  function updateMilestone(index: number, patch: Partial<NewMilestoneInput>) {
    setMilestones((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  const validationError = validate(freelancerAddress, tokenAddress, milestones);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) {
      setError('Connect your wallet first.');
      return;
    }
    const validationMessage = validate(freelancerAddress, tokenAddress, milestones);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      setStep('awaiting-wallet');
      const { escrowId } = await createEscrow(freelancerAddress, tokenAddress, milestones);

      setStep('saving-metadata');
      const supabase = getSupabaseClient();

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          escrow_id: escrowId,
          contract_id: process.env.NEXT_PUBLIC_CONTRACT_ID,
          client_wallet: address,
          freelancer_wallet: freelancerAddress,
          title: milestones[0]?.title ? `Escrow with ${freelancerAddress.slice(0, 6)}…` : 'Untitled escrow',
          token_address: tokenAddress,
        })
        .select()
        .single();

      if (projectError || !project) {
        throw new Error(projectError?.message ?? 'Failed to save project metadata.');
      }

      const milestoneRows = await Promise.all(
        milestones.map(async (m, index) => ({
          project_id: project.id as string,
          index,
          amount: m.amount,
          title: m.title,
          long_description: m.description,
          description_hash: await sha256Hex(m.description),
        })),
      );

      const { error: milestonesError } = await supabase.from('milestones').insert(milestoneRows);
      if (milestonesError) {
        throw new Error(milestonesError.message);
      }

      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
      setStep('idle');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Freelancer wallet address
        </label>
        <input
          type="text"
          value={freelancerAddress}
          onChange={(e) => setFreelancerAddress(e.target.value.trim())}
          placeholder="G..."
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Token contract address
        </label>
        <input
          type="text"
          value={tokenAddress}
          onChange={(e) => setTokenAddress(e.target.value.trim())}
          placeholder="C..."
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Milestones</h3>
          <button
            type="button"
            onClick={() => setMilestones((prev) => [...prev, emptyMilestone()])}
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            + Add milestone
          </button>
        </div>

        <div className="mt-2 space-y-4">
          {milestones.map((m, index) => (
            <div key={index} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Milestone {index + 1}</span>
                {milestones.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setMilestones((prev) => prev.filter((_, i) => i !== index))}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                type="text"
                value={m.title}
                onChange={(e) => updateMilestone(index, { title: e.target.value })}
                placeholder="Title"
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <textarea
                value={m.description}
                onChange={(e) => updateMilestone(index, { description: e.target.value })}
                placeholder="Description"
                rows={2}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="number"
                min="0"
                step="any"
                value={m.amount}
                onChange={(e) => updateMilestone(index, { amount: e.target.value })}
                placeholder="Amount (smallest token unit)"
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          ))}
        </div>
      </div>

      {(error || (validationError && milestones.some((m) => m.title || m.description || m.amount))) && (
        <p className="text-sm text-red-600">{error ?? validationError}</p>
      )}

      <button
        type="submit"
        disabled={submitting || !address}
        className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {step === 'awaiting-wallet'
          ? 'Confirm in wallet…'
          : step === 'saving-metadata'
            ? 'Saving details…'
            : 'Create Escrow'}
      </button>
    </form>
  );
}
