import type { BillingMilestone, BillingPlan, BillingTerm, InvoiceDto, TermExit } from '../api/contract'
import { fmtDay } from './invoices'
import { formatCents } from './money'
import { daysBetween, inDays, instalmentsOf, invoicedIds, issuedIds, nextBreakAnniversary } from './term'
import { addMonths, dayBefore, termEndDate, termYears, yearlyFees } from './termSchedule'

// The money views of a term agreement, as the contract block "Ardorio term agreements" (Reporting) says: contracted is
// baseline plus approved variations as before; for a break agreement, the un-issued instalments from the next
// anniversary the client can still break at (its notice day not yet passed) are not yet committed. A term agreement
// is never MRR or ARR: views say "Annual fee". Pure.

type LiveInvoice = Pick<InvoiceDto, 'milestoneId' | 'status'> & Partial<Pick<InvoiceDto, 'test' | 'dealId'>>

export interface TermCommitment {
  /** Contracted minus what is not yet committed. Equal to contracted except for a break agreement. */
  committed: number
  /** Un-issued instalments from the next anniversary the client can still break at: they may not be billed. */
  notCommitted: number
  /** The anniversary the client may break at, or null when nothing is uncommitted. */
  breakAt: string | null
  /** The instalments not yet committed. */
  ids: ReadonlySet<string>
}

/**
 * Committed and not yet committed for one deal. Only a break agreement that has not ended has an uncommitted part: the
 * instalments with no issued invoice (a draft commits nothing) whose period starts on or after the break point, the
 * first anniversary of the start after today whose notice day (anniversary minus breakNoticeDays) is today or later.
 * An anniversary whose notice day has passed can no longer be broken at, so the year after it is committed. None when
 * no break is left before the term ends. `invoices` are the deal's own.
 */
export function termCommitment(plan: Pick<BillingPlan, 'milestones' | 'term'> | undefined, contracted: number, invoices: readonly LiveInvoice[], today: string): TermCommitment {
  const none: TermCommitment = { committed: contracted, notCommitted: 0, breakAt: null, ids: new Set() }
  const t = plan?.term
  if (!t || t.exit !== 'break' || t.ended) return none
  const at = nextBreakAnniversary(t, today)
  if (!at) return none
  const done = issuedIds(invoices)
  const ids = new Set<string>()
  let notCommitted = 0
  for (const m of instalmentsOf(plan)) {
    if (done.has(m.id) || !m.periodStart || m.periodStart < at) continue
    ids.add(m.id)
    notCommitted += m.amountCents
  }
  if (!ids.size) return none
  return { committed: contracted - notCommitted, notCommitted, breakAt: at, ids }
}

/** "Not yet committed (break at 1 Nov 2027)". */
export const notCommittedLabel = (breakAt: string): string => `Not yet committed (break at ${fmtDay(breakAt)})`

export interface TermSummary {
  /** The fee of the term year today is in (year 1 before the start, the last year after the end), ex GST. */
  annualCents: number
  /** That year, 1-based, and the number of years. */
  year: number
  years: number
  /** The first day after the term, and its last day. */
  termEnd: string
  lastDay: string
  /** Whole days from today to termEnd, as the Term card counts them; 0 or less once the term is over. */
  endsInDays: number
  /** The day it ended early, or null. */
  endedOn: string | null
  exit: TermExit
}

/** The term year `today` falls in, from 1 to years. */
export function termYearOn(t: Pick<BillingTerm, 'startDate' | 'termMonths'>, today: string): number {
  const years = termYears(t)
  let y = 1
  while (y < years && addMonths(t.startDate, y * 12) <= today) y++
  return y
}

export function termSummary(t: BillingTerm, today: string): TermSummary {
  const year = termYearOn(t, today)
  const termEnd = termEndDate(t)
  const lastDay = dayBefore(termEnd)
  return {
    annualCents: yearlyFees(t)[year - 1] ?? t.annualCents, year, years: termYears(t), termEnd, lastDay,
    endsInDays: daysBetween(today, termEnd), endedOn: t.ended?.endedOn ?? null, exit: t.exit,
  }
}

/** Where the term is, in words: "ends in 42 days", "ended early on 3 Mar 2027", "term over". */
export function termStateText(s: Pick<TermSummary, 'endsInDays' | 'endedOn'>): string {
  if (s.endedOn) return `ended early on ${fmtDay(s.endedOn)}`
  return s.endsInDays > 0 ? `ends ${inDays(s.endsInDays)}` : 'term over'
}

/** "Annual fee $60,000.00 · to 13 Oct 2031 · ends in 1,826 days". Never MRR or ARR. */
export function termLine(s: TermSummary): string {
  const fee = `Annual fee ${formatCents(s.annualCents)}${s.years > 1 && s.year > 1 ? ` (year ${s.year} of ${s.years})` : ''}`
  return `${fee} · to ${fmtDay(s.lastDay)} · ${termStateText(s)}`
}

/** Renewal is close: the term ends within this many days (the server's 'term-ending' notification uses the same). */
export const RENEWAL_DAYS = 90
export const renewalDue = (s: Pick<TermSummary, 'endsInDays' | 'endedOn'>): boolean => !s.endedOn && s.endsInDays > 0 && s.endsInDays <= RENEWAL_DAYS

/** Instalments whose invoice date has come (on or before today) and that have no live invoice yet: earned only once invoiced. */
export function instalmentsDue(plan: Pick<BillingPlan, 'milestones'> | undefined, invoices: readonly LiveInvoice[], today: string): BillingMilestone[] {
  const done = invoicedIds(invoices)
  return instalmentsOf(plan).filter(m => !done.has(m.id) && !!m.plannedDate && m.plannedDate <= today)
}
