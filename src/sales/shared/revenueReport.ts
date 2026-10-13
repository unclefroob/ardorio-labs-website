import type { BillingPlan, RevenueMonth } from '../api/contract'
import { wallFromMs } from '../data/tz'
import type { Deal, Goal } from '../data/types'
import { approvedVariations } from './billing'
import { fyDays, quarterDays, wonAt } from './goalMetrics'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-06" -> "Jun 2026" (or "June 2026" when `long`). Anything else is returned as it came. */
export function monthName(ym: string, long = false): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym)
  const i = m ? Number(m[2]) - 1 : -1
  if (!m || i < 0 || i > 11) return ym
  return `${(long ? MONTHS_LONG : MONTHS)[i]} ${m[1]}`
}

/** The org-timezone day (YYYY-MM-DD) of a stored ISO instant such as variation.decidedAt. Empty when it does not parse. */
function dayOf(instant: string | undefined): string {
  if (!instant) return ''
  const ms = Date.parse(instant)
  return Number.isNaN(ms) ? '' : wallFromMs(ms).slice(0, 10)
}

const within = (day: string, from: string, to: string): boolean => !!day && day >= from && day <= to

/**
 * Contract value signed in a range, ex GST cents: the baselines of contracts frozen in it (contract.contractedOn) plus the
 * approved variations decided in it (decidedAt), on live Ardorio deals. A variation approved in range on a contract
 * frozen earlier counts; a proposed or rejected one never does. `from` and `to` are days, both included.
 */
export function contractedInRange(plans: readonly BillingPlan[], deals: readonly Pick<Deal, 'id' | 'businessId' | 'archived'>[], from: string, to: string): number {
  const live = new Set(deals.filter(d => d.businessId === 'ard' && d.archived !== true).map(d => d.id))
  let cents = 0
  for (const p of plans) {
    if (!p.contract || !live.has(p.dealId)) continue
    if (within(p.contract.contractedOn, from, to)) cents += p.contract.baselineCents
    for (const v of approvedVariations(p)) if (within(dayOf(v.decidedAt), from, to)) cents += v.amountCents
  }
  return cents
}

/**
 * An Ardorio goal target for a metric and goal period, in the metric's stored unit (dollars for won_value, cents for
 * invoiced and collected): the team goals added up, or when there is no team goal the individual ones (adding both
 * would count the same people twice). Null with no such goal.
 */
export function goalTarget(goals: readonly Goal[], metric: string, period: string): number | null {
  const mine = goals.filter(g => g.businessId === 'ard' && g.metric === metric && g.period === period && g.target > 0)
  const team = mine.filter(g => g.ownerType === 'team')
  const use = team.length ? team : mine
  return use.length ? use.reduce((s, g) => s + g.target, 0) : null
}

/** The Ardorio won value goal for a goal period, in dollars like deal.value. Null with no won_value goal in it. */
export const wonValueTarget = (goals: readonly Goal[], period: string): number | null => goalTarget(goals, 'won_value', period)

/** The period control of the Ardorio revenue report (boards 5 and 11). */
export type ArdPeriod = 'fy' | 'prevfy' | 'quarter' | 'month'
export const ARD_PERIODS: ReadonlyArray<readonly [ArdPeriod, string]> = [
  ['fy', 'This financial year'], ['prevfy', 'Previous financial year'], ['quarter', 'Quarter'], ['month', 'Month'],
]

/**
 * The days an Ardorio revenue period covers (YYYY-MM-DD, both included), the goal period it is compared with (none
 * for a closed past year: goals are for the current one), what it is called in words, and its table total label.
 */
export interface ReportRange { from: string; to: string; goal: 'year' | 'quarter' | 'month' | null; noun: 'year' | 'quarter' | 'month'; total: string }

export function reportRange(p: ArdPeriod, today: string): ReportRange {
  if (p === 'prevfy') {
    const r = fyDays(fyDays(today).from.replace(/^(\d{4})/, y => String(Number(y) - 1)))
    return { ...r, goal: null, noun: 'year', total: `${monthName(r.from.slice(0, 7))} to ${monthName(r.to.slice(0, 7))}` }
  }
  if (p === 'quarter') return { from: quarterDays(today).from, to: today, goal: 'quarter', noun: 'quarter', total: 'Quarter to date' }
  if (p === 'month') return { from: `${today.slice(0, 8)}01`, to: today, goal: 'month', noun: 'month', total: 'Month to date' }
  return { from: fyDays(today).from, to: today, goal: 'year', noun: 'year', total: 'Year to date' }
}

/** Every month ("YYYY-MM") from the month of `from` to the month of `to`, both included. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let y = Number(from.slice(0, 4))
  let m = Number(from.slice(5, 7))
  const end = to.slice(0, 7)
  for (let i = 0; i < 480; i++) {
    const k = `${y}-${String(m).padStart(2, '0')}`
    if (k > end) break
    out.push(k)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

/** "The year is 4 of 12 months in (33%)." The month counts days; the year and quarter count months, this one included. */
export function periodProgress(r: ReportRange, today: string): string {
  if (r.noun === 'month') {
    const [y, m, d] = today.split('-').map(Number)
    const all = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return `The month is ${d} of ${all} days in (${Math.round((d / all) * 100)}%).`
  }
  const all = r.noun === 'year' ? 12 : 3
  const n = Math.min(all, monthsBetween(r.from, today).length)
  return `The ${r.noun} is ${n} of ${all} months in (${Math.round((n / all) * 100)}%).`
}

/** Per month, the won value in cents of the given won deals, and the part recorded directly as won. `amount` is in dollars. */
export function wonByMonth<D extends Pick<Deal, 'closedAt' | 'close' | 'recordedWonDirectly'>>(deals: readonly D[], amount: (d: D) => number): Map<string, { cents: number; recordedCents: number }> {
  const out = new Map<string, { cents: number; recordedCents: number }>()
  for (const d of deals) {
    const at = wonAt(d)
    if (!at) continue
    const k = at.slice(0, 7)
    const row = out.get(k) ?? { cents: 0, recordedCents: 0 }
    const c = Math.round(amount(d) * 100)
    row.cents += c
    if (d.recordedWonDirectly) row.recordedCents += c
    out.set(k, row)
  }
  return out
}

export type Coverage =
  | { kind: 'no-goal' }
  | { kind: 'met'; target: number; won: number }
  | { kind: 'ratio'; ratio: number; weighted: number; needed: number; target: number; won: number }

/** Pipeline coverage = weighted open pipeline / (won value goal - won value so far). All in dollars. */
export function pipelineCoverage(weighted: number, target: number | null, won: number): Coverage {
  if (target === null) return { kind: 'no-goal' }
  const needed = target - won
  if (needed <= 0) return { kind: 'met', target, won }
  return { kind: 'ratio', ratio: weighted / needed, weighted, needed, target, won }
}

/** 2.4 -> "2.4×". One decimal, so 0.04 reads "0.0×" rather than a rounded-up promise. */
export const coverageText = (ratio: number): string => `${(Math.floor(ratio * 10) / 10).toFixed(1)}×`

/** "June 2026 includes 2 records entered later ($12,400)". */
export function recordedLateLine(r: { month: string; count: number; cents: number }, fmt: (cents: number) => string): string {
  return `${monthName(r.month, true)} includes ${r.count} record${r.count === 1 ? '' : 's'} entered later (${fmt(r.cents)})`
}

/** The month bars: Invoiced next to Collected, in dollars for the chart axis. */
export const monthBars = (months: readonly RevenueMonth[]): { l: string; v: number[] }[] =>
  months.map(m => ({ l: monthName(m.month), v: [m.invoicedCents / 100, m.collectedCents / 100] }))
