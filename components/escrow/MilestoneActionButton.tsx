'use client';

import { useEffect, useState } from 'react';
import * as stellar from '@/lib/stellar';
import { describeError } from '@/lib/errors';
import type { Milestone, Role } from '@/lib/types';
import { getAvailableActions, type ActionKind } from './actionMatrix';

interface Props {
  escrowId: number;
  milestone: Milestone;
  role: Role;
}

const RUNNERS: Record<ActionKind, (escrowId: number, index: number) => Promise<{ txHash: string }>> = {
  deposit: stellar.deposit,
  submit: stellar.submitMilestone,
  approve: stellar.approveMilestone,
  dispute: stellar.raiseDispute,
};

/**
 * Role+status aware action buttons for one milestone. Every click signs and
 * submits a transaction directly via lib/stellar.ts. The chain is the
 * source of truth — this never optimistically flips the milestone's
 * displayed status. Instead, once a transaction is sent it shows a "pending
 * confirmation" state until the milestone prop itself changes (which
 * happens via the Realtime subscription on the parent once the indexer
 * observes the event).
 */
export function MilestoneActionButton({ escrowId, milestone, role }: Props) {
  const [pendingAction, setPendingAction] = useState<ActionKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The milestone's status changed (Realtime pushed an update) — whatever we
  // fired has been confirmed on-chain and mirrored off-chain, so clear the
  // pending state.
  useEffect(() => {
    setPendingAction(null);
  }, [milestone.status]);

  const actions = getAvailableActions(milestone.status, role);

  if (pendingAction) {
    return (
      <p className="text-sm text-slate-500" role="status">
        Pending confirmation…
      </p>
    );
  }

  if (actions.length === 0) {
    if (milestone.status === 'Disputed') {
      return <p className="text-sm text-amber-600">Frozen — pending dispute resolution</p>;
    }
    return null;
  }

  async function run(kind: ActionKind) {
    setError(null);
    setPendingAction(kind);
    try {
      await RUNNERS[kind](escrowId, milestone.index);
      // Left in "pending confirmation" until the Realtime update above
      // clears it — do not flip local state to the target status here.
    } catch (err) {
      setPendingAction(null);
      setError(describeError(err));
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {actions.map((action) => (
          <button
            key={action.kind}
            type="button"
            onClick={() => run(action.kind)}
            className={
              action.kind === 'dispute'
                ? 'rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50'
                : 'rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700'
            }
          >
            {action.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
