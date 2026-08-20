'use client';

import { useRouter } from 'next/navigation';
import { useWallet } from './WalletProvider';

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function ConnectButton() {
  const { address, connected, connecting, error, connect, disconnect } = useWallet();
  const router = useRouter();

  if (connected && address) {
    return (
      <button
        type="button"
        onClick={disconnect}
        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {shortenAddress(address)} · Disconnect
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={connecting}
        onClick={async () => {
          try {
            await connect();
            router.push('/dashboard');
          } catch {
            // error state is already surfaced via useWallet().error
          }
        }}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {connecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
