import Link from 'next/link';
import type { Milestone, Project, Role } from '@/lib/types';

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

interface Props {
  project: Project;
  milestones: Milestone[];
  viewerRole: Role;
}

export function ProjectCard({ project, milestones, viewerRole }: Props) {
  const counterparty = viewerRole === 'client' ? project.freelancer_wallet : project.client_wallet;
  const released = milestones.filter((m) => m.status === 'Released').length;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="block rounded-lg border border-slate-200 p-4 transition hover:border-brand-500 hover:shadow-sm dark:border-slate-800"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-slate-900 dark:text-slate-50">{project.title}</h3>
        {!project.confirmed ? (
          <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Confirming…
          </span>
        ) : (
          <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {project.status}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {viewerRole === 'client' ? 'Freelancer' : 'Client'}: {shortenAddress(counterparty)}
      </p>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {released} of {milestones.length} milestone{milestones.length === 1 ? '' : 's'} released
      </p>
    </Link>
  );
}
