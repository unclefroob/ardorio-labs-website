import { F } from '../../../data/F'
import { S } from '../../../data/store'
import type { SeqStep, Sequence } from '../../../data/types'
import { Card, DataTable, Icon, Kpi } from '../../../kit'
import { STEP } from '../../../shared/constants'
import type { SeqStats } from '../../../shared/seqStats'
import { key, walk } from '../../../shared/seqFlow'

interface StepRow { i: number; k: string; label: string; x: SeqStep; reached: number; sent: number; toSend: number; tasks: number; done: number }

const rate = (a: number, b: number): string => (b ? F.pct(a / b) : '—')
const isTask = (t: string): boolean => t === 'call' || t === 'linkedin' || t === 'task'

export function SeqAnalytics({ s, st }: { s: Sequence; st: SeqStats }) {
  // Every step, paths included. Top-level steps count who got past them by position; a path step counts who reached it by its own tasks and mail.
  const rows: StepRow[] = walk(s.steps).map(({ step: x, pos }, n) => {
    const m = st.msgs.filter(mm => mm.stepId === x.id)
    const t = S.tasks.filter(tt => tt.stepId === x.id)
    const i = pos.i
    const reached = pos.lane
      ? new Set([...t.map(tt => tt.enrolmentId), ...m.map(mm => mm.enrolmentId)].filter(Boolean)).size
      : st.en.filter(e => e.stepIdx > i || (e.stepIdx === i && e.status !== 'active')).length
    const label = pos.lane ? `${i + 1} · ${pos.lane === 'yes' ? 'Yes' : 'No'} ${(pos.j ?? 0) + 1}` : String(i + 1)
    return { i: n, k: key(pos), label, x, reached, sent: m.filter(mm => mm.status === 'sent').length, toSend: t.filter(tt => tt.kind === 'email' && tt.status !== 'Completed' && tt.status !== 'Cancelled').length, tasks: t.length, done: t.filter(tt => tt.status === 'Completed').length }
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
        <Kpi label="Emails to send" value={st.emailsToSend} />
        <Kpi label="Opens (simulated)" value={st.opens} sub="Unreliable signal" title="Email opens are simulated and not proof of human interest" />
      </div>
      <Card title="Step performance" pad={false}>
        <DataTable<StepRow>
          rows={rows} rowKey="k"
          cols={[
            { k: 'i', l: '#', r: r => r.label },
            { k: 't', l: 'Step', r: r => <span className="row"><Icon n={STEP[r.x.type]?.[0] ?? 'mail'} s={13} />{r.x.type === 'email' ? r.x.subject || 'Untitled email' : r.x.title || STEP[r.x.type]?.[1] || r.x.type}</span> },
            { k: 'reached', l: 'Reached', right: true },
            { k: 'sent', l: 'Emails sent', right: true, r: r => (r.x.type === 'email' ? r.sent : '—') },
            { k: 'toSend', l: 'Waiting to send', right: true, r: r => (r.x.type === 'email' ? r.toSend : '—') },
            { k: 'tasks', l: 'Tasks created', right: true, r: r => (isTask(r.x.type) ? r.tasks : '—') },
            { k: 'done', l: 'Tasks done', right: true, r: r => (isTask(r.x.type) ? r.done + (r.tasks ? ' (' + F.pct(r.done / r.tasks) + ')' : '') : '—') },
          ]}
        />
      </Card>
    </div>
  )
}
