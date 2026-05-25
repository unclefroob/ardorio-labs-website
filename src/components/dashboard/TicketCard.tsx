import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Ticket } from '../../types/dashboard'

const priorityDot: Record<Ticket['priority'], string> = {
  high:   'bg-red-400',
  medium: 'bg-amber-400',
  low:    'bg-stone-300',
}

const horizonBadge: Record<Ticket['horizon'], string> = {
  infra: 'Infra',
  H1:    'H1',
  H2:    'H2',
  H3:    'H3',
}

interface Props {
  ticket: Ticket
  index: number
}

export default function TicketCard({ ticket, index }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      onClick={() => setExpanded(!expanded)}
      className="bg-cream-200 hover:bg-cream-300 rounded-xl p-4 cursor-pointer transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-medium text-ink leading-snug">{ticket.title}</p>
        <span className="font-mono text-xs text-stone-400 bg-cream-100 rounded px-1.5 py-0.5 shrink-0">
          {horizonBadge[ticket.horizon]}
        </span>
      </div>
      <p className={`text-xs text-stone-600 leading-relaxed mt-1 ${expanded ? '' : 'line-clamp-2'}`}>
        {ticket.description}
      </p>
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[ticket.priority]}`} />
          <span className="label">{ticket.priority}</span>
        </div>
        <span className="font-mono text-xs bg-cream-100 text-stone-600 rounded-full px-2 py-0.5 text-right leading-tight">
          {ticket.category}
        </span>
      </div>
    </motion.div>
  )
}
