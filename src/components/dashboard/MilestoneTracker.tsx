import type { Milestone, MilestoneStatus } from '../../types/dashboard'

const statusDot: Record<MilestoneStatus, string> = {
  paid: 'bg-green-500',
  'awaiting-approval': 'bg-amber-400',
  pending: 'bg-stone-300',
}

const statusLabel: Record<MilestoneStatus, string> = {
  paid: 'Payment received',
  'awaiting-approval': 'Awaiting sign-off',
  pending: 'Pending',
}

const statusText: Record<MilestoneStatus, string> = {
  paid: 'text-green-600',
  'awaiting-approval': 'text-amber-600',
  pending: 'text-stone-400',
}

interface Props {
  milestones: Milestone[]
}

export default function MilestoneTracker({ milestones }: Props) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <p className="label mb-4">Payment Milestones</p>
      <div className="flex items-start gap-2 overflow-x-auto pb-2">
        {milestones.map((m, i) => (
          <div key={m.id} className="flex items-start gap-2 shrink-0">
            <div className="bg-cream-200 rounded-xl p-4 w-52">
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[m.status]}`} />
                <span className="label">{m.label}</span>
              </div>
              <p className="text-sm font-medium text-ink leading-snug">{m.description}</p>
              <p className={`font-mono text-xs mt-2 ${statusText[m.status]}`}>
                {statusLabel[m.status]}
              </p>
              {m.date && (
                <p className="font-mono text-xs text-stone-400 mt-0.5">{m.date}</p>
              )}
              <p className="font-mono text-xs text-stone-400 mt-2 border-t border-cream-300 pt-2">
                Approver: {m.approver}
              </p>
            </div>
            {i < milestones.length - 1 && (
              <span className="font-mono text-stone-300 text-sm mt-5 shrink-0">→</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
