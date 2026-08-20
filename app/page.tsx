'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { useWallet } from '@/components/wallet/WalletProvider';

export default function LandingPage() {
  const { connected } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (connected) router.replace('/dashboard');
  }, [connected, router]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-16 text-center">
      <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-50">TrustPay</h1>
      <p className="text-slate-600 dark:text-slate-400">
        Milestone-based crypto escrow for clients and freelancers. Funds are held by a Stellar
        smart contract and only released when a client approves each milestone — neither side can
        unilaterally change the deal once it&apos;s funded.
      </p>
      <ConnectButton />
    </div>
  );
}
