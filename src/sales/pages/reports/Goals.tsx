import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { Goal } from '../../data/types'
import { Banner, BizDot, Btn, Card, DataTable, Empty, Icon, Owner, Prog, Seg, type Col } from '../../kit'
import { formatGoalValue, GOAL_METRIC_LABEL, GOAL_PERIODS, isMoneyMetric, prevGoalDays } from '../../shared/goalMetrics'
import { PageHead } from '../../shared/PageHead'
import { useGoalRevenue, type GoalRevenue } from '../../shared/useGoalRevenue'
import { UI } from '../../ui/store'

type Period = Goal['period']
export const METRIC_LABEL: Record<string, string> = GOAL_METRIC_LABEL

function prevActual(g: Goal): number {
  const [f, t] = Q.goalRange(g)
  if (g.metric === 'won_value' || g.period === 'quarter' || g.period === 'year') {
    // Money goals, and every quarter and year goal, compare with the whole period before: yesterday, last week, or
    // the last calendar month, quarter or financial year.
    const p = prevGoalDays(g.period, f.slice(0, 10))
    const ids = g.ownerType === 'team' ? (Q.team(g.ownerId)?.members ?? []) : [g.ownerId]
    if (g.metric === 'won_value') return Q.wonValue(ids, `${p.from}T00:00`, `${p.to}T23:59`, g.businessId)
    return Q.metric(ids, g.metric, `${p.from}T00:00`, `${p.to}T23:59`, g.businessId)
  }
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

/** actual and prev are null for an invoiced or collected goal whose report is loading or not available; `wait` says which. */
interface GoalRow extends Goal { actual: number | null; prev: number | null; wait?: Exclude<GoalRevenue, { kind: 'value' }> }

const show = (g: GoalRow, n: number): string => formatGoalValue(g.metric, n)

/** The Progress cell of a goal whose actual is not known: the wait or the reason, in words. */
function NoActual({ wait }: { wait?: GoalRow['wait'] }) {
  if (!wait || wait.kind === 'loading') return <span className="faint xs" role="status">Loading invoiced and collected…</span>
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="faint xs">{wait.reason}</span>
      {wait.retry && <Btn size="xs" kind="ghost" onClick={wait.retry}>Try again</Btn>}
    </span>
  )
}

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
    { k: 'target', l: 'Target', right: true, r: g => <span className="num">{show(g, g.target)}</span> },
    {
      k: 'actual', l: 'Actual', right: true, sort: g => g.actual ?? -1,
      r: g => (g.actual === null
        ? <span className="num b">{g.wait?.kind === 'loading' ? '…' : '—'}</span>
        : <span className="num b">{show(g, g.actual)}</span>),
    },
    {
      k: 'p', l: 'Progress', w: 200, nosort: true,
      r: g => {
        if (g.actual === null) return <NoActual wait={g.wait} />
        const p = (g.actual / g.target) * 100
        return (
          <div className="row" style={{ gap: 8 }}>
            <div style={{ flex: 1 }}><Prog v={p} tone={p >= 100 ? 'ok' : p < 50 ? 'warn' : undefined} /></div>
            <span className="num xs" style={{ width: 36 }}>{Math.round(p)}%</span>
          </div>
        )
      },
    },
    { k: 'rem', l: 'Remaining', right: true, nosort: true, r: g => <span className="num">{g.actual === null ? '—' : show(g, Math.max(0, g.target - g.actual))}</span> },
    {
      k: 'prev', l: 'Prev. period', right: true, sort: g => g.prev ?? -1,
      r: g => {
        if (g.prev === null || g.actual === null) return <span className="num">—</span>
        const up = g.actual >= g.prev
        return (
          <>
            <span className="num">{show(g, g.prev)}</span>{' '}
            <span className="xs num" style={{ color: up ? 'var(--ok)' : 'var(--bad2)' }}>{up ? '▲' : '▼'}{show(g, Math.abs(g.actual - g.prev))}</span>
          </>
        )
      },
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
  const inView = S.goals.filter(g => sc.includes(g.businessId) && g.period === per)
  const revenue = useGoalRevenue(inView, per, true)
  const gs: GoalRow[] = inView.map(g => {
    const r = revenue(g)
    if (!r) return { ...g, actual: Q.goalActual(g), prev: prevActual(g) }
    return r.kind === 'value' ? { ...g, actual: r.actual, prev: r.prev } : { ...g, actual: null, prev: null, wait: r }
  })
  const money = inView.some(g => isMoneyMetric(g.metric))
  return (
    <div className="page">
      <PageHead title="Sales goals" sub={`Measured from recorded activity only · ${remaining(per)}`}>
        <Seg value={per} onChange={v => setPer(v as Period)} opts={GOAL_PERIODS} />
        {sc.includes('ard') && Q.canBill() && <Btn onClick={() => UI.nav('reports', { q: { tab: 'ardorio' } })}>Ardorio revenue report</Btn>}
        {canSet && <Btn kind="pri" icon="plus" onClick={() => UI.open('goal', { period: per })}>Set goal</Btn>}
      </PageHead>
      <Banner tone="info">Drafts, scheduled emails, cancelled calls and duplicates are not counted. Simulated sends and replies are not counted, because no real email has left SalesOS. Meetings booked are tracked separately from meetings completed: a booking still counts if the meeting is later cancelled, and a meeting marked cancelled or no-show never counts as completed.{money && ' Won value counts contracted amounts on the day a deal is won, for deals won in the period by the salesperson or team; a deal with no contract recorded counts its deal value. Invoiced and collected are for all of Ardorio, ex GST, as recorded in SalesOS: void and test invoices are left out.'}</Banner>
      <div className="col" style={{ gap: 14, marginTop: 14 }}>
        <GoalTable title="Individual targets" rows={gs.filter(g => g.ownerType === 'user')} period={per} />
        <GoalTable title="Team targets" rows={gs.filter(g => g.ownerType === 'team')} period={per} />
      </div>
    </div>
  )
}
