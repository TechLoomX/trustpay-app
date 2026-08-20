'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { useWallet } from '@/components/wallet/WalletProvider';
import type { Milestone, Project } from '@/lib/types';

interface HistoryEntry {
  key: string;
  label: string;
  at: string;
}

// trustpay-api's schema (supabase/migrations/0001_initial_schema.sql) has no
// dedicated `events` table yet — confirmed by reading that migration
// directly, per the spec's instruction to check before building this. Until
// one exists, history is derived from the timestamps milestones already
// carry (submitted_at, approved_at) plus current status. That also means
// there's no stored per-event transaction hash to link to individually, so
// each entry links out to the escrow contract's page on Stellar Expert
// instead of a specific tx — revisit once trustpay-api adds an events log.
function deriveHistory(milestones: Milestone[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const m of [...milestones].sort((a, b) => a.index - b.index)) {
    if (m.status !== 'Pending') {
      entries.push({ key: `${m.id}-funded`, label: `Milestone ${m.index + 1} funded: "${m.title}"`, at: m.last_synced_at ?? '' });
    }
    if (m.submitted_at) {
      entries.push({ key: `${m.id}-submitted`, label: `Milestone ${m.index + 1} submitted: "${m.title}"`, at: m.submitted_at });
    }
    if (m.approved_at) {
      entries.push({ key: `${m.id}-approved`, label: `Milestone ${m.index + 1} approved & released: "${m.title}"`, at: m.approved_at });
    }
    if (m.status === 'Disputed') {
      entries.push({ key: `${m.id}-disputed`, label: `Milestone ${m.index + 1} disputed: "${m.title}"`, at: m.last_synced_at ?? '' });
    }
    if (m.status === 'Refunded') {
      entries.push({ key: `${m.id}-refunded`, label: `Milestone ${m.index + 1} refunded: "${m.title}"`, at: m.last_synced_at ?? '' });
    }
  }
  return entries
    .filter((e) => e.at)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export default function ProjectHistoryPage({ params }: { params: { id: string } }) {
  const { connected } = useWallet();
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  useEffect(() => {
    if (!connected) return;
    const supabase = getSupabaseClient();
    let cancelled = false;

    async function load() {
      const { data: projectData } = await supabase.from('projects').select('*').eq('id', params.id).maybeSingle();
      const { data: milestoneData } = await supabase
        .from('milestones')
        .select('*')
        .eq('project_id', params.id)
        .order('index', { ascending: true });
      if (!cancelled) {
        setProject(projectData as Project | null);
        setMilestones((milestoneData as Milestone[]) ?? []);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [connected, params.id]);

  if (!connected || !project) return <p className="text-sm text-slate-500">Loading…</p>;

  const history = deriveHistory(milestones);
  const explorerUrl = `https://stellar.expert/explorer/testnet/contract/${project.contract_id}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Transaction History</h1>
      {history.length === 0 ? (
        <p className="text-sm text-slate-500">No on-chain activity yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {history.map((entry) => (
            <li key={entry.key} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm text-slate-900 dark:text-slate-50">{entry.label}</p>
                <p className="text-xs text-slate-500">{new Date(entry.at).toLocaleString()}</p>
              </div>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View on Stellar Expert →
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
