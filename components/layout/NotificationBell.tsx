'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { useWallet } from '@/components/wallet/WalletProvider';

interface NotificationRow {
  id: string;
  type: string;
  project_id: string | null;
  milestone_index: number | null;
  read: boolean;
  created_at: string;
}

const LABELS: Record<string, string> = {
  milestone_funded: 'A milestone was funded',
  milestone_submitted: 'A milestone was submitted for review',
  milestone_approved: 'A milestone was approved',
  funds_released: 'Funds were released',
  dispute_raised: 'A dispute was raised',
  milestone_refunded: 'A milestone was refunded',
};

export function NotificationBell() {
  const { address, connected } = useWallet();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!connected || !address) {
      setNotifications([]);
      return;
    }

    const supabase = getSupabaseClient();
    let cancelled = false;

    supabase
      .from('notifications')
      .select('id, type, project_id, milestone_index, read, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!cancelled && data) setNotifications(data as NotificationRow[]);
      });

    const channel = supabase
      .channel(`notifications-${address}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_wallet=eq.${address}` },
        (payload) => {
          setNotifications((prev) => [payload.new as NotificationRow, ...prev]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [connected, address]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await getSupabaseClient().from('notifications').update({ read: true }).eq('id', id);
  }

  if (!connected) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {notifications.length === 0 && (
            <p className="p-3 text-sm text-slate-500">No notifications yet.</p>
          )}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => markRead(n.id)}
                  className={`w-full px-3 py-2 text-left text-sm ${
                    n.read ? 'text-slate-500' : 'font-medium text-slate-900 dark:text-slate-50'
                  } hover:bg-slate-50 dark:hover:bg-slate-800`}
                >
                  {LABELS[n.type] ?? n.type}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
