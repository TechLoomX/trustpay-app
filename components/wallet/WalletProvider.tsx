'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as freighter from '@stellar/freighter-api';
import { signInWithWallet } from '@/lib/auth';
import { clearSession, setSession } from '@/lib/supabase';

interface WalletContextValue {
  address: string | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const { isConnected } = await freighter.isConnected();
      if (!isConnected) {
        throw new Error('Freighter is not installed or not enabled in this browser.');
      }

      const access = await freighter.requestAccess();
      if (access.error || !access.address) {
        throw new Error(access.error?.message ?? 'Wallet access was declined.');
      }

      // signMessage, not signTransaction — this step never moves funds.
      const token = await signInWithWallet(access.address);
      setSession(access.address, token);
      setAddress(access.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet.');
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    clearSession();
    setAddress(null);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({ address, connected: address !== null, connecting, error, connect, disconnect }),
    [address, connecting, error, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider.');
  return ctx;
}
