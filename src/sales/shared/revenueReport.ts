import type { BillingPlan, RevenueMonth } from '../api/contract'
import { wallFromMs } from '../data/tz'
import type { Deal, Goal } from '../data/types'
import { approvedVariations } from './billing'

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
 * The Ardorio won value goal for a period, in dollars like deal.value: the team goals added up, or when there is no team
 * goal the individual ones (adding both would count the same people twice). Null with no won_value goal in the period.
 */
export function wonValueTarget(goals: readonly Goal[], period: string): number | null {
  const mine = goals.filter(g => g.businessId === 'ard' && g.metric === 'won_value' && g.period === period && g.target > 0)
  const team = mine.filter(g => g.ownerType === 'team')
  const use = team.length ? team : mine
  return use.length ? use.reduce((s, g) => s + g.target, 0) : null
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
