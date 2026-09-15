'use client';

import Link from 'next/link';
import { useWallet } from '@/components/wallet/WalletProvider';

export function DashboardLink() {
  const { connected } = useWallet();
  if (!connected) return null;

  return (
    <Link
      href="/dashboard"
      className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50"
    >
      Dashboard
    </Link>
  );
}
