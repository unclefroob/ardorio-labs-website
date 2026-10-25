import type { BillingPlan } from '../api/contract'
import type { Deal } from '../data/types'
import { byFinancialYear, type FcBucket, type FcEntry, type FcSummary, type Forecast } from './forecast'
import { termSummary } from './termMoney'

// The dashboard's Revenue outlook, as pure functions over the Ardorio forecast (shared/forecast.ts). It adds nothing of its own to
// the money: every figure is the forecast's, regrouped. Contracted money and the weighted pipeline are never added together.

export type OutlookBasis = 'invoiced' | 'collected'
export type OutlookRange = 'm6' | 'm12' | 'fy'
export const OUTLOOK_RANGES: ReadonlyArray<readonly [OutlookRange, string]> = [['m6', '6 months'], ['m12', '12 months'], ['fy', 'Financial year']]
export const OUTLOOK_BASES: ReadonlyArray<readonly [OutlookBasis, string]> = [['invoiced', 'Invoiced'], ['collected', 'Collected']]

/** One bar: contracted money in two parts, and the weighted pipeline apart. Cents. */
export interface OutlookBar { key: string; label: string; project: number; recurring: number; pipeline: number }

/** A bucket's contracted money split into one-off project money and recurring money (term instalments and retainers). */
export function splitBucket(b: Pick<FcBucket, 'items'>, basis: OutlookBasis): { project: number; recurring: number } {
  const main = basis === 'invoiced' ? 'invoiced' : 'collected'
  const retainer = basis === 'invoiced' ? 'retainer' : 'retainerCollected'
  let project = 0
  let recurring = 0
  for (const { e, role } of b.items) {
    if (role === main) {
      if (e.kind === 'instalment') recurring += e.cents
      else project += e.cents
    } else if (role === retainer) recurring += e.cents
  }
  return { project, recurring }
}

const bar = (key: string, label: string, b: FcBucket, basis: OutlookBasis): OutlookBar => ({ key, label, ...splitBucket(b, basis), pipeline: b.pipeline })

/** The bars: a month each, or a financial year each for the 'fy' range. */
export function outlookBars(s: FcSummary, range: OutlookRange, basis: OutlookBasis, monthLabel: (ym: string) => string): OutlookBar[] {
  if (range === 'fy') return byFinancialYear(s).map(r => bar(`fy${r.fy}`, r.label, r.bucket, basis))
  return s.months.map(m => bar(m, monthLabel(m), s.byMonth.get(m)!, basis))
}

export interface OutlookTotals { project: number; recurring: number; contracted: number; pipeline: number; pipelineValue: number }

/** The range's totals. `contracted` is project plus recurring and never includes the pipeline. */
export function outlookTotals(s: FcSummary, basis: OutlookBasis): OutlookTotals {
  const { project, recurring } = splitBucket(s.inRange, basis)
  return { project, recurring, contracted: project + recurring, pipeline: s.inRange.pipeline, pipelineValue: s.inRange.pipelineValue }
}

/**
 * What recurs in a year, from the contracts in force today: each term agreement's fee for its current year (an ended or finished
 * one counts nothing) and twelve months of each retainer that has a next invoice date. Won, unarchived Ardorio deals only.
 * Named run-rate, not ARR or MRR: the Term card says "never MRR or ARR".
 */
export function recurringRunRate(plans: readonly BillingPlan[], deals: readonly Deal[], today: string): number {
  const live = new Set(deals.filter(d => d.businessId === 'ard' && d.status === 'won' && d.archived !== true).map(d => d.id))
  let cents = 0
  for (const p of plans) {
    if (!live.has(p.dealId)) continue
    const t = p.term
    if (t && t.startDate <= today) {
      const s = termSummary(t, today)
      if (!s.endedOn && s.endsInDays > 0) cents += s.annualCents
    }
    if (p.retainer && p.retainer.amountCents > 0 && p.retainer.nextInvoiceDate) cents += p.retainer.amountCents * 12
  }
  return cents
}

export interface Attention {
  key: 'overdue' | 'unscheduled' | 'noContract' | 'notCommitted'
  /** Cents, or a count of deals for noContract. */
  amount: number
  count?: number
  tone: 'bad' | 'warn' | 'info'
  title: string
  note: string
}

/** The things in the forecast that need someone, most urgent first. Empty when there is nothing. */
export function attentionOf(f: Pick<Forecast, 'entries' | 'unscheduled' | 'noContract' | 'notCommitted'>): Attention[] {
  const out: Attention[] = []
  const overdue = f.entries.filter(e => !e.issued && e.flags.includes('overdue-invoice'))
  const overdueCents = overdue.reduce((a, e) => a + e.cents, 0)
  if (overdue.length) out.push({ key: 'overdue', amount: overdueCents, count: overdue.length, tone: 'bad', title: 'Overdue to invoice', note: `${overdue.length} ${overdue.length === 1 ? 'item' : 'items'} past ${overdue.length === 1 ? 'its' : 'their'} planned date` })
  if (f.unscheduled > 0) out.push({ key: 'unscheduled', amount: f.unscheduled, tone: 'warn', title: 'Not yet in milestones', note: 'Contract value with no billing schedule' })
  if (f.noContract.length) out.push({ key: 'noContract', amount: 0, count: f.noContract.length, tone: 'warn', title: 'Won with no contract yet', note: 'Not in the forecast until contracted' })
  if (f.notCommitted > 0) out.push({ key: 'notCommitted', amount: f.notCommitted, tone: 'info', title: 'Not yet committed', note: 'The client can break at the next anniversary' })
  return out
}

/** The next contracted items to invoice, overdue first and then by planned date; no pipeline. */
export function nextToInvoice(f: Pick<Forecast, 'entries'>, limit = 5): FcEntry[] {
  return f.entries
    .filter(e => !e.issued && e.series !== 'pipeline' && !e.flags.includes('not-committed') && !!e.invoiceDay)
    .sort((a, b) => (a.invoiceDay ?? '').localeCompare(b.invoiceDay ?? '') || a.label.localeCompare(b.label))
    .slice(0, limit)
}

/** Open Ardorio deals weighted by stage probability, in cents (a deal's value is in dollars). Needs no invoice data, so any viewer may see it. */
export function weightedArdPipeline(deals: readonly Deal[], prob: (d: Deal) => number): number {
  return deals.filter(d => d.businessId === 'ard' && d.status === 'open' && d.archived !== true).reduce((a, d) => a + Math.round((d.value || 0) * prob(d)), 0)
}
