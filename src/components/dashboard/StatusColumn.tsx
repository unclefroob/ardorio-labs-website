import type { Ticket, TicketStatus } from '../../types/dashboard'
import TicketCard from './TicketCard'

const columnConfig: Record<TicketStatus, { label: string; accent: string }> = {
  backlog: { label: 'Backlog', accent: 'border-stone-300' },
  ongoing: { label: 'In Progress', accent: 'border-amber-400' },
  done: { label: 'Done', accent: 'border-green-500' },
}

interface Props {
  status: TicketStatus
  tickets: Ticket[]
}

export default function StatusColumn({ status, tickets }: Props) {
  const { label, accent } = columnConfig[status]

  return (
    <div className={`border-t-2 ${accent} pt-4`}>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="label">{label}</span>
        <span className="font-mono text-xs text-stone-400">({tickets.length})</span>
      </div>

      {tickets.length === 0 ? (
        <div className="border border-dashed border-cream-300 rounded-xl p-6 text-center">
          <p className="text-stone-400 text-sm">Nothing here yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket, i) => (
            <TicketCard key={ticket.id} ticket={ticket} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
