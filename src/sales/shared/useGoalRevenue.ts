import type { RevenueReport } from '../api/contract'
import { getRevenueReport, revenueReportError } from '../api/reports'
import { F } from '../data/F'
import { useLoad } from '../data/invoicing'
import { Q } from '../data/Q'
import type { Goal } from '../data/types'
import { goalDays, isReportMetric, prevGoalDays } from './goalMetrics'

/** What an invoiced or collected goal row can show: the figures, a wait, or a dash with the reason. */
export type GoalRevenue =
  | { kind: 'value'; actual: number; prev: number | null }
  | { kind: 'loading' }
  | { kind: 'unavailable'; reason: string; retry?: () => void }

const pick = (metric: string, r: RevenueReport): number => (metric === 'collected_cents' ? r.collectedCents : r.invoicedCents)

/**
 * Invoiced and collected goals for one period, read from GET /sales/reports/revenue (source all) over the goal range
 * so far, and over the period before when `withPrev`. Business-wide for Ardorio: the goal's salesperson or team is
 * not used. Calls the server only when such a goal is in `goals` and the viewer is an Ardorio admin or super.
 * Returns a reader; it gives null for any other metric, which Q.goalActual measures.
 */
export function useGoalRevenue(goals: readonly Goal[], period: Goal['period'], withPrev = false): (g: Goal) => GoalRevenue | null {
  const allowed = Q.canBill()
  const needed = goals.some(g => isReportMetric(g.metric) && g.businessId === 'ard')
  const on = needed && allowed
  const cur = goalDays(Q.goalRange({ id: '', businessId: 'ard', ownerType: 'team', ownerId: '', metric: '', target: 1, period, createdBy: '' }), F.nowIso())
  const before = prevGoalDays(period, cur.from)
  const now = useLoad(s => (on ? getRevenueReport({ ...cur, source: 'all' }, s) : Promise.resolve(null)), on ? `goal-revenue:${cur.from}:${cur.to}` : 'goal-revenue:off')
  const prevOn = on && withPrev
  const prev = useLoad(s => (prevOn ? getRevenueReport({ ...before, source: 'all' }, s) : Promise.resolve(null)), prevOn ? `goal-revenue:${before.from}:${before.to}` : 'goal-revenue-prev:off')

  return (g: Goal): GoalRevenue | null => {
    if (!isReportMetric(g.metric)) return null
    if (g.businessId !== 'ard') return { kind: 'unavailable', reason: 'Invoiced and collected are tracked for Ardorio only.' }
    if (!allowed) return { kind: 'unavailable', reason: 'Only Ardorio admins can see invoiced and collected.' }
    if (now.error) {
      const e = revenueReportError(now.error)
      return { kind: 'unavailable', reason: e.message, retry: e.kind === 'denied' || e.kind === 'not-configured' ? undefined : now.reload }
    }
    if (!now.data) return { kind: 'loading' }
    return { kind: 'value', actual: pick(g.metric, now.data), prev: prev.data ? pick(g.metric, prev.data) : null }
  }
}
