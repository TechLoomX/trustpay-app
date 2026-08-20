// Domain types mirrored from trustpay-contract's types.rs / errors.rs and
// trustpay-api's supabase/migrations/0001_initial_schema.sql. Keep these in
// sync with those two source-of-truth files, not the other way around.

/** contracts/escrow/src/types.rs: EscrowStatus */
export type EscrowStatus = 'Active' | 'Completed' | 'Cancelled';

/**
 * contracts/escrow/src/types.rs: MilestoneStatus. `Approved` is a real
 * on-chain state emitted between the MilestoneApproved and FundsReleased
 * events, but approve_milestone fires both in the same transaction, so in
 * practice the indexer settles a milestone at `Released` immediately after.
 * `Approved` is included here for completeness/testing, not because the UI
 * needs a distinct row for it (see MilestoneActionButton).
 */
export type MilestoneStatus =
  | 'Pending'
  | 'Funded'
  | 'Submitted'
  | 'Approved'
  | 'Released'
  | 'Disputed'
  | 'Refunded';

export type Role = 'client' | 'freelancer';

export interface Project {
  id: string;
  escrow_id: number;
  contract_id: string;
  client_wallet: string;
  freelancer_wallet: string;
  title: string;
  description: string | null;
  token_address: string;
  status: EscrowStatus;
  confirmed: boolean;
  created_at: string;
  last_synced_at: string | null;
}

export interface Milestone {
  id: string;
  project_id: string;
  index: number;
  amount: string; // numeric column comes back as a string; format at the edges
  title: string;
  long_description: string;
  description_hash: string;
  status: MilestoneStatus;
  submitted_at: string | null;
  approved_at: string | null;
  last_synced_at: string | null;
}

export interface NewMilestoneInput {
  title: string;
  description: string;
  amount: string;
}
