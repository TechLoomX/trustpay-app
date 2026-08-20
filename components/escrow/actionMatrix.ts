// Pure, unit-testable implementation of the role/status action matrix from
// spec section 4.4. MilestoneActionButton is a thin rendering layer over
// getAvailableActions — keep the decision logic here so it's covered by
// tests without needing to mount React.
import type { MilestoneStatus, Role } from '@/lib/types';

export type ActionKind = 'deposit' | 'submit' | 'approve' | 'dispute';

export interface ActionSpec {
  kind: ActionKind;
  label: string;
}

const ACTIONS: Record<ActionKind, ActionSpec> = {
  deposit: { kind: 'deposit', label: 'Deposit' },
  submit: { kind: 'submit', label: 'Submit' },
  approve: { kind: 'approve', label: 'Approve' },
  dispute: { kind: 'dispute', label: 'Raise Dispute' },
};

/**
 * Spec table (4.4):
 *   Pending     | client: —* | freelancer: —
 *   Funded      | client: —  | freelancer: Submit
 *   Submitted   | client: Approve, Raise Dispute | freelancer: Raise Dispute
 *   Approved/Released | client: — (view only) | freelancer: — (view only)
 *   Disputed    | frozen — informational only in v1, both roles
 *   Refunded    | client: — (view only) | freelancer: — (view only)
 *
 * *Pending is the one row the table shows as "—" but the prose right below
 * it calls out separately: "'Deposit' affordance for Pending milestones
 * lives with the client, since only they can fund." Treated here as the
 * client's action for that row.
 */
export function getAvailableActions(status: MilestoneStatus, role: Role): ActionSpec[] {
  if (status === 'Pending') {
    return role === 'client' ? [ACTIONS.deposit] : [];
  }
  if (status === 'Funded') {
    return role === 'freelancer' ? [ACTIONS.submit] : [];
  }
  if (status === 'Submitted') {
    return role === 'client' ? [ACTIONS.approve, ACTIONS.dispute] : [ACTIONS.dispute];
  }
  // Approved, Released, Disputed, Refunded: view-only for both roles.
  return [];
}
