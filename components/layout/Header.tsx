import Link from 'next/link';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { NotificationBell } from './NotificationBell';

export function Header() {
  return (
    <header className="border-b border-slate-200 dark:border-slate-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          TrustPay
        </Link>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
