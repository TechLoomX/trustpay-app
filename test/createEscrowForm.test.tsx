import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ADDRESS = 'GAGDDHINRDAHGBOLGL3DGTNZTPKOEZBWCSXRS55MSWV7U66CVMWFFCGV';
const FREELANCER = 'GDIMJLOMEWH5VUZ2IKGJTMSLREQTF3FMUOG42CVUPZCBWJZVBGEUNNZI';
const TOKEN = 'CB2GMAPCUGDCCI7TY2KJJILKMAUXJYO5HO7Q23Z5PEREOYZ6EYDBT7I6';

const createEscrow = vi.fn(
  async (_freelancerAddress: string, _tokenAddress: string, _milestones: unknown[]) => ({
    escrowId: 1,
    txHash: 'hash',
  }),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/wallet/WalletProvider', () => ({
  useWallet: () => ({ address: ADDRESS, connected: true }),
}));

vi.mock('@/lib/stellar', () => ({
  createEscrow: (freelancerAddress: string, tokenAddress: string, milestones: unknown[]) =>
    createEscrow(freelancerAddress, tokenAddress, milestones),
}));

const single = vi.fn(async () => ({ data: { id: 'project-uuid' }, error: null }));
const insert = vi.fn(() => ({ select: () => ({ single }) }));
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table === 'projects') return { insert };
      return { insert: vi.fn(async () => ({ error: null })) };
    },
  }),
}));

import { CreateEscrowForm } from '@/components/escrow/CreateEscrowForm';

beforeEach(() => {
  createEscrow.mockClear();
});

describe('CreateEscrowForm validation', () => {
  it('blocks submission and never calls the wallet when the form is empty', async () => {
    const user = userEvent.setup();
    render(<CreateEscrowForm />);

    await user.click(screen.getByRole('button', { name: /create escrow/i }));

    expect(createEscrow).not.toHaveBeenCalled();
    expect(await screen.findByText(/valid stellar public key/i)).toBeInTheDocument();
  });

  it('blocks submission when a milestone amount is not positive', async () => {
    const user = userEvent.setup();
    render(<CreateEscrowForm />);

    await user.type(screen.getByPlaceholderText('G...'), FREELANCER);
    await user.type(screen.getByPlaceholderText('C...'), TOKEN);
    await user.type(screen.getByPlaceholderText('Title'), 'Design phase');
    await user.type(screen.getByPlaceholderText('Description'), 'Ship the mockups');
    await user.type(screen.getByPlaceholderText(/amount/i), '0');

    await user.click(screen.getByRole('button', { name: /create escrow/i }));

    expect(createEscrow).not.toHaveBeenCalled();
    expect(await screen.findByText(/must be positive/i)).toBeInTheDocument();
  });

  it('calls the wallet only once every field is valid', async () => {
    const user = userEvent.setup();
    render(<CreateEscrowForm />);

    await user.type(screen.getByPlaceholderText('G...'), FREELANCER);
    await user.type(screen.getByPlaceholderText('C...'), TOKEN);
    await user.type(screen.getByPlaceholderText('Title'), 'Design phase');
    await user.type(screen.getByPlaceholderText('Description'), 'Ship the mockups');
    await user.type(screen.getByPlaceholderText(/amount/i), '1000');

    await user.click(screen.getByRole('button', { name: /create escrow/i }));

    expect(createEscrow).toHaveBeenCalledTimes(1);
    expect(createEscrow).toHaveBeenCalledWith(
      FREELANCER,
      TOKEN,
      expect.arrayContaining([
        expect.objectContaining({ title: 'Design phase', description: 'Ship the mockups', amount: '1000' }),
      ]),
    );
  });
});
