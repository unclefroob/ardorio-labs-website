import type { Ticket } from '../../types/dashboard'
import StatusColumn from './StatusColumn'

interface Props {
  tickets: Ticket[]
}

export default function StatusBoard({ tickets }: Props) {
  const backlog = tickets.filter(t => t.status === 'backlog')
  const ongoing = tickets.filter(t => t.status === 'ongoing')
  const testing = tickets.filter(t => t.status === 'testing')
  const done = tickets.filter(t => t.status === 'done')

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <p className="label mb-6">Progress Board</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
        <StatusColumn status="backlog" tickets={backlog} />
        <StatusColumn status="ongoing" tickets={ongoing} />
        <StatusColumn status="testing" tickets={testing} />
        <StatusColumn status="done" tickets={done} />
      </div>
    </div>
  )
}
