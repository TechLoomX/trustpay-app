import type { Metadata } from 'next';
import { WalletProvider } from '@/components/wallet/WalletProvider';
import { Header } from '@/components/layout/Header';
import './globals.css';

export const metadata: Metadata = {
  title: 'TrustPay',
  description: 'Milestone-based crypto escrow for clients and freelancers, on Stellar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <Header />
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
