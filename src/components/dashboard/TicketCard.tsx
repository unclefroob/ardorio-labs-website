import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Ticket, Comment } from '../../types/dashboard'
import { useDashboard } from '../../context/DashboardContext'
import TicketModal from './TicketModal'

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
  onCommentsUpdate?: (ticketId: string, comments: Comment[]) => void
}

export default function TicketCard({ ticket, index, onCommentsUpdate }: Props) {
  const { canInteract } = useDashboard()
  const [open, setOpen] = useState(false)
  const commentCount = ticket.comments?.length ?? 0
  const hasActivity = commentCount > 0 || canInteract

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: index * 0.04 }}
        onClick={() => hasActivity && setOpen(true)}
        className={`bg-cream-200 rounded-xl p-4 transition-colors ${hasActivity ? 'hover:bg-cream-300 cursor-pointer' : ''}`}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-medium text-ink leading-snug">{ticket.title}</p>
          <span className="font-mono text-xs text-stone-400 bg-cream-100 rounded px-1.5 py-0.5 shrink-0">
            {horizonBadge[ticket.horizon]}
          </span>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed mt-1 line-clamp-2">
          {ticket.description}
        </p>
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[ticket.priority]}`} />
            <span className="label">{ticket.priority}</span>
          </div>
          <div className="flex items-center gap-2">
            {commentCount > 0 && (
              <span className="font-mono text-xs text-stone-400">
                💬 {commentCount}
              </span>
            )}
            <span className="font-mono text-xs bg-cream-100 text-stone-600 rounded-full px-2 py-0.5 whitespace-nowrap">
              {ticket.category}
            </span>
          </div>
        </div>
      </motion.div>

      {open && (
        <TicketModal
          ticket={ticket}
          onClose={() => setOpen(false)}
          onCommentsUpdate={onCommentsUpdate ?? (() => {})}
        />
      )}
    </>
  )
}
