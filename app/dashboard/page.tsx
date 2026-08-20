'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import { useWallet } from '@/components/wallet/WalletProvider';
import { ProjectCard } from '@/components/escrow/ProjectCard';
import type { Milestone, Project } from '@/lib/types';

interface ProjectWithMilestones extends Project {
  milestones: Milestone[];
}

export default function DashboardPage() {
  const { address, connected } = useWallet();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectWithMilestones[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connected) {
      router.replace('/');
    }
  }, [connected, router]);

  useEffect(() => {
    if (!address) return;

    const supabase = getSupabaseClient();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('projects')
        .select('*, milestones(*)')
        .or(`client_wallet.eq.${address},freelancer_wallet.eq.${address}`)
        .order('created_at', { ascending: false });
      if (!cancelled && data) {
        setProjects(data as ProjectWithMilestones[]);
      }
      setLoading(false);
    }
    load();

    // Live status changes across every project this wallet is party to, per
    // spec section 7 ("Dashboard can subscribe more broadly...").
    const channel = supabase
      .channel(`dashboard-${address}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects', filter: `client_wallet=eq.${address}` },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects', filter: `freelancer_wallet=eq.${address}` },
        () => load(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'milestones' }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [address]);

  if (!address) return null;

  const asClient = projects.filter((p) => p.client_wallet === address);
  const asFreelancer = projects.filter((p) => p.freelancer_wallet === address);

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link
          href="/projects/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          New Escrow
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading projects…</p>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-lg font-medium text-slate-700 dark:text-slate-300">As Client</h2>
            {asClient.length === 0 ? (
              <p className="text-sm text-slate-500">No escrows created yet.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {asClient.map((p) => (
                  <ProjectCard key={p.id} project={p} milestones={p.milestones} viewerRole="client" />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-medium text-slate-700 dark:text-slate-300">
              As Freelancer
            </h2>
            {asFreelancer.length === 0 ? (
              <p className="text-sm text-slate-500">No escrows to work on yet.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {asFreelancer.map((p) => (
                  <ProjectCard key={p.id} project={p} milestones={p.milestones} viewerRole="freelancer" />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
