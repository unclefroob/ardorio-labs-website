import type { BillingMilestone, BillingTerm, TermFrequency } from '../api/contract'

// The schedule of a term agreement, exactly as the contract block "Ardorio term agreements" defines it. The API has the
// same helper (src/services/sales/billing/termSchedule.ts) and both run every case of one table, the API's
// termSchedule.fixtures.json (the web keeps an identical copy; with ARDORIO_API_DIR set its test runs the API's file),
// so the instalments the web previews are the ones the server stores. Pure: no clock, no store.

/** Months in one billing period. */
export const PERIOD_MONTHS: Record<TermFrequency, number> = { annual: 12, quarterly: 3, monthly: 1 }

const p2 = (n: number): string => String(n).padStart(2, '0')
const daysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** `day` plus `n` whole months, keeping the day of month, clamped to the month's last day (31 Jan + 1 = 28/29 Feb). */
export function addMonths(day: string, n: number): string {
  const y = +day.slice(0, 4), m = +day.slice(5, 7), d = +day.slice(8, 10)
  const t = y * 12 + (m - 1) + n
  const ny = Math.floor(t / 12), nm = (t % 12) + 1
  return `${ny}-${p2(nm)}-${p2(Math.min(d, daysIn(ny, nm)))}`
}

/** The day before `day`. */
export function dayBefore(day: string): string {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) - 1))
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`
}

/** a / b rounded half away from zero, on integers (b > 0). */
export function roundDiv(a: number, b: number): number {
  const q = Math.floor((2 * Math.abs(a) + b) / (2 * b))
  return a < 0 ? -q : q
}

/** The first day after the term: addMonths(startDate, termMonths). */
export const termEndDate = (term: Pick<BillingTerm, 'startDate' | 'termMonths'>): string => addMonths(term.startDate, term.termMonths)

/** ceil(termMonths / 12). */
export const termYears = (term: Pick<BillingTerm, 'termMonths'>): number => Math.ceil(term.termMonths / 12)

/** The yearly rise of year y in basis points (year 1 has none). */
export function yearRateBp(term: Pick<BillingTerm, 'escalation' | 'escalationBp' | 'cpiConfirmed'>, y: number): number {
  if (y <= 1 || term.escalation === 'none') return 0
  if (term.escalation === 'fixed') return term.escalationBp
  const c = (term.cpiConfirmed ?? []).find(x => x.year === y)
  return c ? c.bp : term.escalationBp
}

/** fee(1..years): fee(1) = annualCents, fee(y) = round(fee(y-1) * (10000 + rate(y)) / 10000). */
export function yearlyFees(term: Pick<BillingTerm, 'termMonths' | 'annualCents' | 'escalation' | 'escalationBp' | 'cpiConfirmed'>): number[] {
  const out: number[] = []
  const years = termYears(term)
  for (let y = 1; y <= years; y++) out.push(y === 1 ? term.annualCents : roundDiv(out[y - 2] * (10000 + yearRateBp(term, y)), 10000))
  return out
}

/**
 * Every instalment of a term, in order. Instalment i covers periodStart..periodEnd (inclusive); its plannedDate is its
 * invoice date (the start when billed in advance, the end in arrears). A full year's instalments sum exactly to that
 * year's fee; a short last period bills its whole months only.
 */
export function termSchedule(term: Pick<BillingTerm, 'startDate' | 'termMonths' | 'annualCents' | 'frequency' | 'timing' | 'escalation' | 'escalationBp' | 'cpiConfirmed'>): BillingMilestone[] {
  const p = PERIOD_MONTHS[term.frequency]
  const end = termEndDate(term)
  const years = termYears(term)
  const fees = yearlyFees(term)
  const out: BillingMilestone[] = []
  for (let i = 0; ; i++) {
    const start = addMonths(term.startDate, i * p)
    if (start >= end) break
    const next = addMonths(term.startDate, (i + 1) * p)
    const periodEnd = dayBefore(next < end ? next : end)
    const y = Math.floor((i * p) / 12) + 1
    const base = (y - 1) * 12
    const m0 = i * p - base
    const m1 = Math.min((i + 1) * p, term.termMonths) - base
    const fee = fees[y - 1]
    const k = m0 / p + 1
    const label = term.frequency === 'annual' ? `Year ${y} of ${years}` : `Year ${y} of ${years}, ${term.frequency === 'quarterly' ? 'quarter' : 'month'} ${k}`
    out.push({
      id: `inst_${y}_${k}`, label, amountCents: roundDiv(fee * m1, 12) - roundDiv(fee * m0, 12),
      plannedDate: term.timing === 'advance' ? start : periodEnd, kind: 'instalment', termYear: y, periodStart: start, periodEnd,
    })
  }
  return out
}

/** The sum of every instalment of the schedule. */
export const scheduleTotal = (list: readonly Pick<BillingMilestone, 'amountCents'>[]): number => list.reduce((a, m) => a + m.amountCents, 0)
