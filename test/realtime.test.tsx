import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import ProjectDetailPage from '@/app/projects/[id]/page';
import type { Milestone, Project } from '@/lib/types';

const CLIENT = 'GAGDDHINRDAHGBOLGL3DGTNZTPKOEZBWCSXRS55MSWV7U66CVMWFFCGV';
const FREELANCER = 'GDIMJLOMEWH5VUZ2IKGJTMSLREQTF3FMUOG42CVUPZCBWJZVBGEUNNZI';

const project: Project = {
  id: 'project-uuid',
  escrow_id: 7,
  contract_id: 'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2',
  client_wallet: CLIENT,
  freelancer_wallet: FREELANCER,
  title: 'Landing page redesign',
  description: 'Redesign the marketing site',
  token_address: 'CB2GMAPCUGDCCI7TY2KJJILKMAUXJYO5HO7Q23Z5PEREOYZ6EYDBT7I6',
  status: 'Active',
  confirmed: true,
  created_at: new Date().toISOString(),
  last_synced_at: new Date().toISOString(),
};

const milestone: Milestone = {
  id: 'milestone-uuid',
  project_id: 'project-uuid',
  index: 0,
  amount: '1000',
  title: 'Design phase',
  long_description: 'Ship the mockups',
  description_hash: 'deadbeef',
  status: 'Funded',
  submitted_at: null,
  approved_at: null,
  last_synced_at: null,
};

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/components/wallet/WalletProvider', () => ({
  useWallet: () => ({ address: CLIENT, connected: true }),
}));

let capturedMilestoneHandler: ((payload: { new: Milestone }) => void) | null = null;

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    channel: () => {
      const chain = {
        on: (
          _event: string,
          filter: { table: string },
          cb: (payload: { new: Milestone }) => void,
        ) => {
          if (filter.table === 'milestones') capturedMilestoneHandler = cb;
          return chain;
        },
        subscribe: () => chain,
      };
      return chain;
    },
    removeChannel: () => {},
    from: (table: string) => {
      if (table === 'projects') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: project }) }) }) };
      }
      if (table === 'milestones') {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: [milestone] }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

describe('Realtime milestone updates', () => {
  it('updates the displayed milestone status when a postgres_changes UPDATE payload arrives, with no reload', async () => {
    render(<ProjectDetailPage params={{ id: 'project-uuid' }} />);

    expect(await screen.findByText('Funded')).toBeInTheDocument();
    expect(capturedMilestoneHandler).not.toBeNull();

    act(() => {
      capturedMilestoneHandler?.({ new: { ...milestone, status: 'Submitted', submitted_at: new Date().toISOString() } });
    });

    await waitFor(() => {
      expect(screen.queryByText('Funded')).not.toBeInTheDocument();
      expect(screen.getByText('Submitted')).toBeInTheDocument();
    });
  });
});
