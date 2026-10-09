import { F } from '../../../data/F'
import { S } from '../../../data/store'
import type { SeqStep, Sequence } from '../../../data/types'
import { Card, DataTable, Icon, Kpi } from '../../../kit'
import { STEP } from '../../../shared/constants'
import type { SeqStats } from '../../../shared/seqStats'

interface StepRow { i: number; x: SeqStep; reached: number; sent: number; pending: number; tasks: number; done: number }

const rate = (a: number, b: number): string => (b ? F.pct(a / b) : '—')
const isTask = (t: string): boolean => t === 'call' || t === 'linkedin' || t === 'task'

export function SeqAnalytics({ s, st }: { s: Sequence; st: SeqStats }) {
  const rows: StepRow[] = s.steps.map((x, i) => {
    const m = st.msgs.filter(mm => mm.stepId === x.id)
    const t = S.tasks.filter(tt => tt.stepId === x.id)
    const reached = st.en.filter(e => e.stepIdx > i || (e.stepIdx === i && e.status !== 'active')).length
    return { i, x, reached, sent: m.filter(mm => mm.status === 'sent').length, pending: m.filter(mm => mm.status === 'pending').length, tasks: t.length, done: t.filter(tt => tt.status === 'Completed').length }
  })
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="grid g6">
        <Kpi label="Contacts enrolled" value={st.enrolled} />
        <Kpi label="Emails sent" value={st.sent} />
        <Kpi label="Replies" value={st.replies} sub={rate(st.replies, st.enrolled) + ' of enrolled'} />
        <Kpi label="Positive replies" value={st.positive} tone="ok" sub={rate(st.positive, st.replies) + ' of replies'} />
        <Kpi label="Meetings booked" value={st.meetings} />
        <Kpi label="Unsubscribes" value={st.unsub} tone={st.unsub ? 'bad2' : undefined} />
        <Kpi label="Bounces" value={st.bounced} tone={st.bounced ? 'bad2' : undefined} />
        <Kpi label="Active" value={st.active} />
        <Kpi label="Completed" value={st.completed} />
        <Kpi label="Tasks completed" value={st.tasksDone + ' / ' + st.tasks} />
        <Kpi label="Awaiting approval" value={st.pending} />
        <Kpi label="Opens (simulated)" value={st.opens} sub="Unreliable signal" title="Email opens are simulated and not proof of human interest" />
      </div>
      <Card title="Step performance" pad={false}>
        <DataTable<StepRow>
          rows={rows} rowKey="i"
          cols={[
            { k: 'i', l: '#', r: r => r.i + 1 },
            { k: 't', l: 'Step', r: r => <span className="row"><Icon n={STEP[r.x.type]?.[0] ?? 'mail'} s={13} />{r.x.type === 'email' ? r.x.subject || 'Untitled email' : r.x.title || STEP[r.x.type]?.[1] || r.x.type}</span> },
            { k: 'reached', l: 'Reached', right: true },
            { k: 'sent', l: 'Emails sent', right: true, r: r => (r.x.type === 'email' ? r.sent : '—') },
            { k: 'pending', l: 'Pending approval', right: true, r: r => (r.x.type === 'email' ? r.pending : '—') },
            { k: 'tasks', l: 'Tasks created', right: true, r: r => (isTask(r.x.type) ? r.tasks : '—') },
            { k: 'done', l: 'Tasks done', right: true, r: r => (isTask(r.x.type) ? r.done + (r.tasks ? ' (' + F.pct(r.done / r.tasks) + ')' : '') : '—') },
          ]}
        />
      </Card>
    </div>
  )
}
