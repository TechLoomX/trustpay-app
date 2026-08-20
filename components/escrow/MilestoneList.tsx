import type { Milestone, Role } from '@/lib/types';
import { MilestoneActionButton } from './MilestoneActionButton';

const STATUS_STYLES: Record<Milestone['status'], string> = {
  Pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Funded: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Released: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Disputed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  Refunded: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

interface Props {
  escrowId: number;
  milestones: Milestone[];
  role: Role;
}

export function MilestoneList({ escrowId, milestones, role }: Props) {
  const sorted = [...milestones].sort((a, b) => a.index - b.index);

  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
      {sorted.map((milestone) => (
        <li key={milestone.id} className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900 dark:text-slate-50">
                {milestone.title}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[milestone.status]}`}
              >
                {milestone.status}
              </span>
            </div>
            <p className="mt-1 truncate text-sm text-slate-500">{milestone.long_description}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{milestone.amount}</p>
          </div>
          <MilestoneActionButton escrowId={escrowId} milestone={milestone} role={role} />
        </li>
      ))}
    </ul>
  );
}
