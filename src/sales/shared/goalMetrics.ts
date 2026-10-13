import type { Goal } from '../data/types'
import { centsToInput, formatCentsTile } from './money'

/** Activity goals count recorded activity. Their labels are unchanged. */
export const ACTIVITY_METRICS: Record<string, string> = { calls: 'Calls', emails: 'Emails sent', meetings: 'Meetings booked', meetings_held: 'Meetings completed' }

/**
 * Money goals. `won_value` is in dollars like deal.value and works for any business. `invoiced_cents` and
 * `collected_cents` are integer cents ex GST from the Ardorio revenue report, business-wide, Ardorio only.
 */
export const MONEY_METRICS: Record<string, string> = { won_value: 'Won value', invoiced_cents: 'Invoiced', collected_cents: 'Collected' }

export const GOAL_METRIC_LABEL: Record<string, string> = { ...ACTIVITY_METRICS, ...MONEY_METRICS }

/** Invoiced or collected: read from GET /sales/reports/revenue, not from records in the browser. */
export const isReportMetric = (metric: string): boolean => metric === 'invoiced_cents' || metric === 'collected_cents'
export const isMoneyMetric = (metric: string): boolean => metric === 'won_value' || isReportMetric(metric)

/** A goal amount (target or actual) in cents, or null for a count. won_value is stored in dollars, the report metrics in cents. */
export function goalCents(metric: string, n: number): number | null {
  if (metric === 'won_value') return Math.round(n * 100)
  if (isReportMetric(metric)) return Math.round(n)
  return null
}

/** A target, actual or remaining amount as shown: money as "$12,400" (cents only when there are any), counts as they are. */
export function formatGoalValue(metric: string, n: number): string {
  const c = goalCents(metric, n)
  return c === null ? String(n) : formatCentsTile(c)
}

/** The value a stored target is edited as: dollars for money ("12400.00"), the number for counts. */
export function targetToInput(metric: string, target: number): string {
  const c = goalCents(metric, target)
  return c === null ? String(target) : centsToInput(c)
}

/** Cents typed as dollars -> the stored target for the metric: dollars for won_value, cents for the report metrics. */
export const targetFromCents = (metric: string, cents: number): number => (metric === 'won_value' ? cents / 100 : cents)

const pad = (n: number): string => String(n).padStart(2, '0')
const lastDay = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate() // m is 1-12
const shiftDay = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number)
  const x = new Date(Date.UTC(y, m - 1, d + n))
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`
}

/** "2026-09-31" -> "2026-09-30": the goal range's month end is written as the 31st for every month. */
export function realDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  if (!m) return day
  const y = Number(m[1])
  const mo = Number(m[2])
  return `${m[1]}-${m[2]}-${pad(Math.min(Number(m[3]), lastDay(y, mo)))}`
}

/**
 * The days (YYYY-MM-DD, both included) a money goal is measured over: the goal range up to now. `range` is
 * Q.goalRange(g), `now` the org wall clock.
 */
export function goalDays(range: [string, string], now: string): { from: string; to: string } {
  const [f, t] = range
  const end = t > now ? now : t
  return { from: realDay(f.slice(0, 10)), to: realDay(end.slice(0, 10)) }
}

/**
 * The period before, for the "Prev. period" column of money goals: yesterday, last week (Monday to Sunday) or the
 * whole previous calendar month. `from` is the first day of the current goal range.
 */
export function prevGoalDays(period: Goal['period'], from: string): { from: string; to: string } {
  if (period === 'day') {
    const d = shiftDay(from, -1)
    return { from: d, to: d }
  }
  if (period === 'week') return { from: shiftDay(from, -7), to: shiftDay(from, -1) }
  const [y, m] = from.split('-').map(Number)
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}` }
}

/** A deal's won moment as a wall-clock "YYYY-MM-DDTHH:mm": closedAt, else the close date at the start of that day. */
export function wonAt(d: { closedAt?: string | null; close?: string | null }): string {
  const s = d.closedAt || d.close || ''
  return s.length === 10 ? `${s}T00:00` : s.slice(0, 16)
}
