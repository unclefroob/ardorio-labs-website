import type { Ticket, Milestone } from '../../types/dashboard'
import StatusColumn from './StatusColumn'
import MilestoneTracker from './MilestoneTracker'

interface Props {
  tickets: Ticket[]
  milestones: Milestone[]
}

export default function StatusBoard({ tickets, milestones }: Props) {
  const backlog    = tickets.filter(t => t.status === 'backlog')
  const inProgress = tickets.filter(t => t.status === 'in-progress')
  const testing    = tickets.filter(t => t.status === 'testing')
  const signOff    = tickets.filter(t => t.status === 'sign-off')
  const done       = tickets.filter(t => t.status === 'done')

  return (
    <>
      <div className="divider" />
      <MilestoneTracker milestones={milestones} />
      <div className="divider" />
      <div className="max-w-7xl mx-auto px-6 py-10">
        <p className="label mb-6">Progress Board</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          <StatusColumn status="backlog"      tickets={backlog}    />
          <StatusColumn status="in-progress"  tickets={inProgress} />
          <StatusColumn status="testing"      tickets={testing}    />
          <StatusColumn status="sign-off"     tickets={signOff}    />
          <StatusColumn status="done"         tickets={done}       />
        </div>
      </div>
    </>
  )
}
