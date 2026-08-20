'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/components/wallet/WalletProvider';
import { CreateEscrowForm } from '@/components/escrow/CreateEscrowForm';

export default function NewProjectPage() {
  const { connected } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (!connected) router.replace('/');
  }, [connected, router]);

  if (!connected) return null;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold">New Escrow</h1>
      <CreateEscrowForm />
    </div>
  );
}
