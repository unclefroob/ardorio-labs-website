import type { RosterioAccount } from '../api/contract'
import type { Deal } from '../data/types'
import { accountTab, isPriced } from './customers'
import { fyLabel, fyOf, type FcSummary } from './forecast'
import { splitBucket } from './revenueOutlook'

// Reports > Revenue: what every business is expected to bring in, month by month, ex GST, in cents. Each business comes from the source it
// really has: Ardorio's contracts (the forecast), Rosterio's live paying accounts at the prices Rosterio returns, and won subscription deals
// for the rest. Subscriptions are held flat at today's prices: no churn, price rise or new customer is assumed. The weighted pipeline is kept
// apart from contracted money everywhere. A business whose source is not available says why and is left out of the totals, never counted as 0.

export type SourceState = 'ok' | 'loading' | 'locked' | 'error'

export interface BizRevenue {
  id: string
  name: string
  accent: string
  state: SourceState
  /** Why the contracted figures are not shown, when state is not ok. */
  reason?: string
  /** What the row is based on, in words, when state is ok. */
  basis?: string
  /** Chips about the quality of the figures: "2 without a price". */
  notes: string[]
  /** Recurring revenue a year, cents: Ardorio's run-rate, or a subscription business's ARR. */
  recurring: number
  /** Whether `recurring` is ARR (subscriptions) or Ardorio's run-rate, which is never called ARR. */
  isArr: boolean
  /** Contracted money, cents, one number a month of the model's months. */
  contracted: number[]
  /** Weighted pipeline, cents, a number a month, from open deals by close month. */
  pipeline: number[]
  /** Weighted pipeline with a close date after the last month, or none. */
  pipelineLater: number
  pipelineNoDate: number
  /** Rosterio only: paying accounts that came with no price (counted as 0), and trials ending within 14 days (not counted). */
  unpriced?: number
  trialsEnding?: number
}

export const sum = (xs: readonly number[]): number => xs.reduce((a, n) => a + n, 0)
export const rowContracted = (r: Pick<BizRevenue, 'contracted'>): number => sum(r.contracted)
export const rowPipeline = (r: Pick<BizRevenue, 'pipeline' | 'pipelineLater' | 'pipelineNoDate'>): number => sum(r.pipeline) + r.pipelineLater + r.pipelineNoDate

const monthIndex = (months: readonly string[], day: string): number | 'later' | 'none' => {
  if (!day) return 'none'
  const ym = day.slice(0, 7)
  if (ym < months[0]) return 0
  if (ym > months[months.length - 1]) return 'later'
  return months.indexOf(ym)
}

/** Open deals of a business weighted by stage probability, spread over the months by close date. Dollars in, cents out. */
export function pipelineOf(deals: readonly Deal[], business: string, months: readonly string[], prob: (d: Deal) => number): Pick<BizRevenue, 'pipeline' | 'pipelineLater' | 'pipelineNoDate'> {
  const pipeline = months.map(() => 0)
  let later = 0
  let none = 0
  for (const d of deals) {
    if (d.businessId !== business || d.status !== 'open' || d.archived === true) continue
    const cents = Math.round((d.value || 0) * prob(d))
    if (cents <= 0) continue
    const at = monthIndex(months, d.close)
    if (at === 'none') none += cents
    else if (at === 'later') later += cents
    else pipeline[at] += cents
  }
  return { pipeline, pipelineLater: later, pipelineNoDate: none }
}

/** Won subscription deals read as a yearly value, held flat over the months. */
export function dealsRow(o: { id: string; name: string; accent: string; deals: readonly Deal[]; months: readonly string[]; prob: (d: Deal) => number }): BizRevenue {
  const won = o.deals.filter(d => d.businessId === o.id && d.status === 'won' && d.recurring && d.archived !== true)
  const yearly = Math.round(won.reduce((a, d) => a + (d.value || 0), 0) * 100)
  const noValue = won.filter(d => !(d.value > 0)).length
  return {
    id: o.id, name: o.name, accent: o.accent, state: 'ok', basis: `Won subscription deals · ${won.length} ${won.length === 1 ? 'deal' : 'deals'}`,
    notes: noValue ? [`${noValue} won ${noValue === 1 ? 'deal has' : 'deals have'} no value`] : [],
    recurring: yearly, isArr: true, contracted: o.months.map(() => Math.round(yearly / 12)), ...pipelineOf(o.deals, o.id, o.months, o.prob),
  }
}

/** Rosterio's paying accounts at the monthly cost Rosterio returned, held flat. Without prices the row is locked or failed, never zero. */
export function rosterioRow(o: {
  name: string; accent: string; deals: readonly Deal[]; months: readonly string[]; prob: (d: Deal) => number
  accounts: readonly RosterioAccount[] | undefined; tests: ReadonlySet<string>; isAdmin: boolean; failed: boolean; now?: number
}): BizRevenue {
  const base = { id: 'ros', name: o.name, accent: o.accent, notes: [] as string[], recurring: 0, isArr: true, contracted: o.months.map(() => 0), ...pipelineOf(o.deals, 'ros', o.months, o.prob) }
  if (!o.isAdmin) return { ...base, state: 'locked', reason: 'Rosterio prices are shown to Rosterio admins.' }
  if (!o.accounts) return o.failed ? { ...base, state: 'error', reason: 'Rosterio accounts could not be read.' } : { ...base, state: 'loading', reason: 'Reading Rosterio accounts…' }
  const paying = o.accounts.filter(a => accountTab(a, o.now ?? Date.now(), o.tests) === 'paid')
  const priced = paying.filter(isPriced)
  if (!priced.length) return { ...base, state: 'locked', reason: paying.length ? 'Rosterio sent no prices for its paying accounts.' : 'No paying Rosterio accounts.' }
  const monthly = Math.round(priced.reduce((a, x) => a + x.monthlyCost, 0) * 100)
  const unpriced = paying.length - priced.length
  const notes: string[] = []
  if (unpriced) notes.push(`${unpriced} without a price`)
  const now = o.now ?? Date.now()
  const soon = o.accounts.filter(a => accountTab(a, now, o.tests) === 'trials' && !!a.trialEndDate && Date.parse(a.trialEndDate) - now <= 14 * 86_400_000).length
  return {
    ...base, state: 'ok', basis: `Live paying accounts at Rosterio's prices · ${paying.length} ${paying.length === 1 ? 'account' : 'accounts'}`, notes,
    recurring: monthly * 12, contracted: o.months.map(() => monthly), trialsEnding: soon, unpriced,
  }
}

/** Ardorio from its forecast: invoiced milestones, instalments and retainers by month, and the run-rate of what recurs. */
export function ardorioRow(o: { name: string; accent: string; s: FcSummary; runRate: number; contracts: number; deals: readonly Deal[]; prob: (d: Deal) => number }): BizRevenue {
  const months = o.s.months
  const contracted = months.map(m => { const p = splitBucket(o.s.byMonth.get(m)!, 'invoiced'); return p.project + p.recurring })
  // The forecast already weighted the Ardorio pipeline by stage; read it from there so this row matches Reports > Ardorio revenue.
  const pipeline = months.map(m => o.s.byMonth.get(m)!.pipeline)
  return {
    id: 'ard', name: o.name, accent: o.accent, state: 'ok', basis: `Contracts, milestones, term agreements, retainers · ${o.contracts} ${o.contracts === 1 ? 'contract' : 'contracts'}`, notes: [],
    recurring: o.runRate, isArr: false, contracted, pipeline, pipelineLater: o.s.later.pipeline, pipelineNoDate: o.s.noDate.pipeline,
  }
}

/** Ardorio when its numbers cannot be shown: its pipeline still comes from the deals, which any member can read. */
export function ardorioPlaceholder(o: { name: string; accent: string; months: readonly string[]; deals: readonly Deal[]; prob: (d: Deal) => number; state: Exclude<SourceState, 'ok'>; reason: string }): BizRevenue {
  return { id: 'ard', name: o.name, accent: o.accent, state: o.state, reason: o.reason, notes: [], recurring: 0, isArr: false, contracted: o.months.map(() => 0), ...pipelineOf(o.deals, 'ard', o.months, o.prob) }
}

export interface Bar { key: string; label: string; parts: Array<{ id: string; name: string; accent: string; cents: number }>; pipeline: number }

/** The chart's bars: a month each, or a financial year each; one part a business that is ok, and the pipeline of every business. */
export function barsOf(rows: readonly BizRevenue[], months: readonly string[], range: 'm12' | 'm24' | 'fy', monthLabel: (ym: string) => string): Bar[] {
  const part = (r: BizRevenue, at: number[]): Bar['parts'][number] => ({ id: r.id, name: r.name, accent: r.accent, cents: r.state === 'ok' ? at.reduce((a, i) => a + r.contracted[i], 0) : 0 })
  const groups: Array<{ key: string; label: string; at: number[] }> = []
  if (range === 'fy') {
    for (let i = 0; i < months.length; i++) {
      const fy = fyOf(months[i])
      const g = groups.find(x => x.key === `fy${fy}`)
      if (g) g.at.push(i)
      else groups.push({ key: `fy${fy}`, label: fyLabel(fy), at: [i] })
    }
  } else months.forEach((m, i) => groups.push({ key: m, label: monthLabel(m), at: [i] }))
  return groups.map(g => ({ key: g.key, label: g.label, parts: rows.map(r => part(r, g.at)), pipeline: sum(rows.map(r => g.at.reduce((a, i) => a + r.pipeline[i], 0))) }))
}

export interface Totals { contracted: number; recurring: number; arr: number; ardorioRunRate: number; pipeline: number; complete: boolean }

/** Totals over the businesses whose figures are shown. `complete` is false when any row is locked, loading or failed. */
export function totalsOf(rows: readonly BizRevenue[]): Totals {
  const ok = rows.filter(r => r.state === 'ok')
  return {
    contracted: sum(ok.map(rowContracted)),
    recurring: sum(ok.map(r => r.recurring)),
    arr: sum(ok.filter(r => r.isArr).map(r => r.recurring)),
    ardorioRunRate: sum(ok.filter(r => !r.isArr).map(r => r.recurring)),
    pipeline: sum(rows.map(rowPipeline)),
    complete: ok.length === rows.length,
  }
}
