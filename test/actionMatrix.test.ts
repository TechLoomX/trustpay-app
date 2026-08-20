import { describe, expect, it } from 'vitest';
import { getAvailableActions } from '@/components/escrow/actionMatrix';
import type { MilestoneStatus, Role } from '@/lib/types';

// Every cell of the table in spec section 4.4.
const CASES: Array<{ status: MilestoneStatus; role: Role; kinds: string[] }> = [
  { status: 'Pending', role: 'client', kinds: ['deposit'] },
  { status: 'Pending', role: 'freelancer', kinds: [] },
  { status: 'Funded', role: 'client', kinds: [] },
  { status: 'Funded', role: 'freelancer', kinds: ['submit'] },
  { status: 'Submitted', role: 'client', kinds: ['approve', 'dispute'] },
  { status: 'Submitted', role: 'freelancer', kinds: ['dispute'] },
  { status: 'Approved', role: 'client', kinds: [] },
  { status: 'Approved', role: 'freelancer', kinds: [] },
  { status: 'Released', role: 'client', kinds: [] },
  { status: 'Released', role: 'freelancer', kinds: [] },
  { status: 'Disputed', role: 'client', kinds: [] },
  { status: 'Disputed', role: 'freelancer', kinds: [] },
  { status: 'Refunded', role: 'client', kinds: [] },
  { status: 'Refunded', role: 'freelancer', kinds: [] },
];

describe('getAvailableActions (role/status matrix)', () => {
  it.each(CASES)('$status / $role -> $kinds', ({ status, role, kinds }) => {
    expect(getAvailableActions(status, role).map((a) => a.kind)).toEqual(kinds);
  });
});
