import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Milestone, MilestoneStatus, Ticket, TicketHorizon } from '../../types/dashboard'
import TicketCard from './TicketCard'

const statusDot: Record<MilestoneStatus, string> = {
  paid:               'bg-green-500',
  'awaiting-approval':'bg-amber-400',
  pending:            'bg-stone-300',
}

const statusLabel: Record<MilestoneStatus, string> = {
  paid:               'Complete',
  'awaiting-approval':'Awaiting sign-off',
  pending:            'Pending',
}

const statusText: Record<MilestoneStatus, string> = {
  paid:               'text-green-600',
  'awaiting-approval':'text-amber-600',
  pending:            'text-stone-400',
}

interface Props {
  milestones: Milestone[]
  tickets: Ticket[]
}

export default function MilestoneTracker({ milestones, tickets }: Props) {
  const [active, setActive] = useState<TicketHorizon | null>(null)

  const toggle = (horizon: TicketHorizon) =>
    setActive(prev => (prev === horizon ? null : horizon))

  const activeTickets = active ? tickets.filter(t => t.horizon === active) : []

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <p className="label mb-4">Project Milestones</p>

      <div className="flex items-start gap-2 overflow-x-auto pb-2">
        {milestones.map((m, i) => (
          <div key={m.id} className="flex items-start gap-2 shrink-0">
            <button
              onClick={() => toggle(m.horizon)}
              className={`rounded-xl p-4 w-52 text-left transition-colors ${
                active === m.horizon
                  ? 'bg-cream-300'
                  : 'bg-cream-200 hover:bg-cream-300'
              }`}
            >
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
              {m.status !== 'pending' && (
                <p className="font-mono text-xs text-stone-400 mt-2 border-t border-cream-300 pt-2">
                  {m.approver}
                </p>
              )}
            </button>
            {i < milestones.length - 1 && (
              <span className="font-mono text-stone-300 text-sm mt-5 shrink-0">→</span>
            )}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {active && (
          <motion.div
            key={active}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="mt-6"
          >
            <p className="label mb-4">{active === 'infra' ? 'Infrastructure' : active} — all tickets</p>
            {activeTickets.length === 0 ? (
              <p className="text-stone-400 text-sm">No tickets for this horizon yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {activeTickets.map((t, i) => (
                  <TicketCard key={t.id} ticket={t} index={i} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
