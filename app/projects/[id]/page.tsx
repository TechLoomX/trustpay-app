'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import { useWallet } from '@/components/wallet/WalletProvider';
import { MilestoneList } from '@/components/escrow/MilestoneList';
import type { Milestone, Project } from '@/lib/types';

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const { address, connected } = useWallet();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connected) router.replace('/');
  }, [connected, router]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;

    async function load() {
      const { data: projectData } = await supabase
        .from('projects')
        .select('*')
        .eq('id', params.id)
        .maybeSingle();
      if (cancelled) return;
      setProject(projectData as Project | null);

      const { data: milestoneData } = await supabase
        .from('milestones')
        .select('*')
        .eq('project_id', params.id)
        .order('index', { ascending: true });
      if (!cancelled && milestoneData) setMilestones(milestoneData as Milestone[]);
      setLoading(false);
    }
    load();

    // Subscribe on mount, unsubscribe on unmount, per spec section 7 — wired
    // exactly to the milestones table filtered by this project.
    const channel = supabase
      .channel('project-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'milestones', filter: `project_id=eq.${params.id}` },
        (payload) => {
          const updated = payload.new as Milestone;
          setMilestones((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${params.id}` },
        (payload) => setProject(payload.new as Project),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [params.id]);

  if (!connected || loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }
  if (!project) {
    return <p className="text-sm text-slate-500">Project not found, or you don&apos;t have access to it.</p>;
  }

  const role = project.client_wallet === address ? 'client' : 'freelancer';
  const counterparty = role === 'client' ? project.freelancer_wallet : project.client_wallet;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{project.title}</h1>
          <Link
            href={`/projects/${project.id}/history`}
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Transaction History →
          </Link>
        </div>
        {project.description && <p className="mt-1 text-slate-600 dark:text-slate-400">{project.description}</p>}
        <p className="mt-2 text-sm text-slate-500">
          You are the {role} · {role === 'client' ? 'Freelancer' : 'Client'}: {shortenAddress(counterparty)} ·
          Status: {project.confirmed ? project.status : 'Confirming…'}
        </p>
      </div>

      <MilestoneList escrowId={project.escrow_id} milestones={milestones} role={role} />
    </div>
  );
}
