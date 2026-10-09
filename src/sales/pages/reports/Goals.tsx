import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { Goal } from '../../data/types'
import { Banner, BizDot, Btn, Card, DataTable, Empty, Icon, Owner, Prog, Seg, type Col } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { UI } from '../../ui/store'

type Period = Goal['period']
export const METRIC_LABEL: Record<string, string> = { calls: 'Calls', emails: 'Emails sent', meetings: 'Meetings booked', meetings_held: 'Meetings completed' }

function prevActual(g: Goal): number {
  const [f, t] = Q.goalRange(g)
  const len = g.period === 'day' ? 1 : g.period === 'week' ? 7 : 30
  const ids = g.ownerType === 'team' ? (Q.team(g.ownerId)?.members ?? []) : [g.ownerId]
  return Q.metric(ids, g.metric, F.addDays(f, -len), F.addDays(t, -len), g.businessId)
}

function remaining(per: Period): string {
  const [f, t] = Q.goalRange({ id: '', businessId: Q.myBiz()[0] ?? 'ard', ownerType: 'user', ownerId: '', metric: '', target: 1, period: per, createdBy: '' })
  const tot = Math.max(1, F.days(f, t))
  const rem = Math.max(0, F.days(F.nowIso(), t))
  return `${rem} of ${tot} day${tot > 1 ? 's' : ''} remaining`
}

interface GoalRow extends Goal { actual: number; prev: number }

function GoalTable({ title, rows, period }: { title: string; rows: GoalRow[]; period: Period }) {
  const team = title.startsWith('Team')
  const cols: Col<GoalRow>[] = [
    {
      k: 'o', l: team ? 'Team' : 'Salesperson', nosort: true,
      r: g => (g.ownerType === 'team'
        ? <span className="row"><Icon n="users" s={14} /><b>{Q.team(g.ownerId)?.name ?? 'Removed team'}</b></span>
        : <Owner id={g.ownerId} />),
    },
    { k: 'b', l: 'Business', nosort: true, r: g => <span className="row" style={{ gap: 6 }}><BizDot b={g.businessId} />{Q.biz(g.businessId)?.name}</span> },
    { k: 'metric', l: 'Metric', nosort: true, r: g => METRIC_LABEL[g.metric] ?? g.metric },
    { k: 'target', l: 'Target', right: true, r: g => <span className="num">{g.target}</span> },
    { k: 'actual', l: 'Actual', right: true, r: g => <span className="num b">{g.actual}</span> },
    {
      k: 'p', l: 'Progress', w: 200, nosort: true,
      r: g => {
        const p = (g.actual / g.target) * 100
        return (
          <div className="row" style={{ gap: 8 }}>
            <div style={{ flex: 1 }}><Prog v={p} tone={p >= 100 ? 'ok' : p < 50 ? 'warn' : undefined} /></div>
            <span className="num xs" style={{ width: 36 }}>{Math.round(p)}%</span>
          </div>
        )
      },
    },
    { k: 'rem', l: 'Remaining', right: true, nosort: true, r: g => <span className="num">{Math.max(0, g.target - g.actual)}</span> },
    {
      k: 'prev', l: 'Prev. period', right: true,
      r: g => (
        <>
          <span className="num">{g.prev}</span>{' '}
          <span className="xs" style={{ color: g.actual >= g.prev ? 'var(--ok)' : 'var(--bad2)' }}>{g.actual >= g.prev ? '▲' : '▼'}{Math.abs(g.actual - g.prev)}</span>
        </>
      ),
    },
    {
      k: 'a', l: '', nosort: true,
      r: g => Q.canManage(g.businessId) && (
        <span className="row" style={{ gap: 2 }}>
          <Btn size="xs" kind="ghost" icon="edit" aria-label="Edit goal" onClick={() => UI.open('goal', { id: g.id })} />
          <Btn size="xs" kind="ghost" icon="trash" aria-label="Delete goal" onClick={() => UI.confirm({
            title: 'Delete this goal?', body: 'Progress history is not stored on the goal, so only the target is removed.', confirm: 'Delete', danger: true,
            onConfirm: () => { Act.deleteGoal(g.id); UI.toast('Goal deleted') },
          })} />
        </span>
      ),
    },
  ]
  return (
    <Card title={title} pad={false}>
      <DataTable
        rows={rows}
        cols={cols}
        empty={
          <Empty
            icon="target"
            title={`No ${team ? 'team' : 'individual'} goals for this period`}
            body={Q.anyManage() ? 'Set a target to track recorded activity against it.' : 'A manager can set targets for the team.'}
            action={Q.anyManage() ? <Btn size="sm" icon="plus" onClick={() => UI.open('goal', { period, ownerType: team ? 'team' : 'user' })}>Set goal</Btn> : undefined}
          />
        }
      />
    </Card>
  )
}

export function Goals() {
  const [per, setPer] = useState<Period>('week')
  const sc = Q.scope()
  const canSet = Q.anyManage()
  const gs: GoalRow[] = S.goals.filter(g => sc.includes(g.businessId) && g.period === per).map(g => ({ ...g, actual: Q.goalActual(g), prev: prevActual(g) }))
  return (
    <div className="page">
      <PageHead title="Sales goals" sub={`Measured from recorded activity only · ${remaining(per)}`}>
        <Seg value={per} onChange={v => setPer(v as Period)} opts={[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']]} />
        {canSet && <Btn kind="pri" icon="plus" onClick={() => UI.open('goal', { period: per })}>Set goal</Btn>}
      </PageHead>
      <Banner tone="info">Drafts, scheduled emails, cancelled calls and duplicates are not counted. Simulated sends count as sent. Meetings booked are tracked separately from meetings completed.</Banner>
      <div className="col" style={{ gap: 14, marginTop: 14 }}>
        <GoalTable title="Individual targets" rows={gs.filter(g => g.ownerType === 'user')} period={per} />
        <GoalTable title="Team targets" rows={gs.filter(g => g.ownerType === 'team')} period={per} />
      </div>
    </div>
  )
}
