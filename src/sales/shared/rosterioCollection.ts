import type { RosterioInvoice } from '../api/contract'
import { F } from '../data/F'

// Where a Rosterio invoice stands on getting paid, worked out here from its raw Stripe fields (never from the API's overdue flag).
// An invoice counts as overdue only once retries run out: one still being retried is "retrying" even past its due date.

const DAY = 86_400_000

export type CollectionKey = 'failed-final' | 'retrying' | 'overdue' | 'open' | 'paid' | 'written-off' | 'void' | 'draft'

export interface Collection {
  key: CollectionKey
  label: string
  tone: string
  /** 0 is the most urgent. */
  rank: number
  /** Failed with no retries left, or overdue. */
  late: boolean
  /** What is still owed; 0 unless the invoice is open. */
  owingCents: number
  /** Whole days since the invoice date; null unless the invoice is open with money owing. */
  ageDays: number | null
}

const owingOf = (i: RosterioInvoice): number => (i.status === 'open' ? Math.max(0, i.amountRemainingCents) : 0)

/** Whole days since the invoice date, never negative. */
const ageOf = (i: RosterioInvoice, now: number): number => Math.max(0, Math.floor((now - Date.parse(i.createdAt)) / DAY))

export function collectionOf(i: RosterioInvoice, now: number): Collection {
  const owingCents = owingOf(i)
  const base = { owingCents, ageDays: owingCents > 0 ? ageOf(i, now) : null }
  if (i.status === 'paid') return { ...base, key: 'paid', label: 'Paid', tone: 'ok', rank: 4, late: false }
  if (i.status === 'uncollectible') return { ...base, key: 'written-off', label: 'Written off', tone: '', rank: 5, late: false }
  if (i.status === 'void') return { ...base, key: 'void', label: 'Void', tone: '', rank: 6, late: false }
  if (i.status === 'draft') return { ...base, key: 'draft', label: 'Draft', tone: '', rank: 7, late: false }
  const owing = base.owingCents > 0
  const attempted = i.attemptCount > 0
  if (owing && attempted && !i.nextAttemptAt) return { ...base, key: 'failed-final', label: 'Failed, no retries left', tone: 'bad', rank: 0, late: true }
  if (owing && attempted) return { ...base, key: 'retrying', label: `Failed, retrying ${F.date(i.nextAttemptAt)}`, tone: 'warn', rank: 1, late: false }
  // A first charge still to come is not overdue, whatever its due date says (the API's overdue() agrees).
  if (owing && !i.nextAttemptAt && i.dueAt && Date.parse(i.dueAt) < now) return { ...base, key: 'overdue', label: 'Overdue', tone: 'bad', rank: 2, late: true }
  return { ...base, key: 'open', label: 'Open', tone: 'info', rank: 3, late: false }
}

export type AgeBucket = '0-7' | '8-30' | '30+'

export function ageBucket(days: number): AgeBucket {
  return days <= 7 ? '0-7' : days <= 30 ? '8-30' : '30+'
}

/** "12 days", "1 day", "Today". */
export const ageText = (days: number): string => (days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`)

export interface AccountCollection {
  /** The worst open state, or 'paid-up' when nothing is owing. */
  key: CollectionKey | 'paid-up'
  label: string
  tone: string
  rank: number
  late: boolean
  /** Owing across all the account's open invoices. */
  owingCents: number
  /** Age of the oldest open invoice; null when nothing is open. */
  oldestDays: number | null
  /** The invoice behind the worst state (the oldest, if several); null when paid up. */
  worst: RosterioInvoice | null
}

/** An account's standing across its invoices. Void and draft are ignored; null when nothing is left to judge it by. */
export function accountCollection(invoices: readonly RosterioInvoice[], now: number): AccountCollection | null {
  const opens = invoices.filter(i => owingOf(i) > 0)
  if (opens.length) {
    const cs = opens.map(i => ({ i, c: collectionOf(i, now) }))
    const worst = cs.reduce((a, b) => (b.c.rank < a.c.rank || (b.c.rank === a.c.rank && Date.parse(b.i.createdAt) < Date.parse(a.i.createdAt)) ? b : a))
    return {
      key: worst.c.key, label: worst.c.label, tone: worst.c.tone, rank: worst.c.rank, late: worst.c.late,
      owingCents: cs.reduce((t, x) => t + x.c.owingCents, 0), oldestDays: Math.max(...cs.map(x => x.c.ageDays ?? 0)), worst: worst.i,
    }
  }
  if (invoices.some(i => i.status === 'paid')) return { key: 'paid-up', label: 'Paid up', tone: 'ok', rank: 4, late: false, owingCents: 0, oldestDays: null, worst: null }
  return null
}

export interface CollectionTotals {
  collected30: number
  outstanding: number
  /** Failed with no retries left, plus overdue. */
  overdue: number
  overdueCount: number
  /** Failed (either kind) plus overdue. */
  atRisk: number
  atRiskCount: number
  /** Invoices whose payment was tried and failed, retrying or not. */
  failedCount: number
  /** Those with no retries left. */
  finalCount: number
}

export function collectionTotals(invoices: readonly RosterioInvoice[], now: number): CollectionTotals {
  const t: CollectionTotals = { collected30: 0, outstanding: 0, overdue: 0, overdueCount: 0, atRisk: 0, atRiskCount: 0, failedCount: 0, finalCount: 0 }
  for (const i of invoices) {
    const c = collectionOf(i, now)
    if (c.key === 'paid') {
      const at = i.paidAt ? Date.parse(i.paidAt) : NaN
      if (at >= now - 30 * DAY && at <= now) t.collected30 += i.amountPaidCents
    }
    if (i.status !== 'open') continue
    t.outstanding += c.owingCents
    if (c.key === 'failed-final' || c.key === 'overdue') { t.overdue += c.owingCents; t.overdueCount++ }
    if (c.key === 'failed-final' || c.key === 'retrying' || c.key === 'overdue') { t.atRisk += c.owingCents; t.atRiskCount++ }
    if (c.key === 'failed-final' || c.key === 'retrying') t.failedCount++
    if (c.key === 'failed-final') t.finalCount++
  }
  return t
}
