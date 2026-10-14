import type { BillingMilestone, BillingPlan, BillingTerm, InvoiceDto, TermEscalation, TermExit, TermFrequency, TermTiming } from '../api/contract'
import { addDays, isDay, withoutTest } from './invoices'
import { addMonths, dayBefore, roundDiv, scheduleTotal, termEndDate, termSchedule, termYears, yearlyFees } from './termSchedule'

// Term agreements on the web: what a person types, the checks the API runs on it, and what each action does to the
// schedule, worked out the way the contract block "Ardorio term agreements" says the server does it. Pure helpers.

/** The term as a person sets it. draftFrom, cpiConfirmed and ended belong to the server or to later actions. */
export type TermInput = Omit<BillingTerm, 'draftFrom' | 'cpiConfirmed' | 'ended'>

export const TERM_FREQUENCIES: readonly TermFrequency[] = ['annual', 'quarterly', 'monthly']
export const FREQUENCY_LABEL: Record<TermFrequency, string> = { annual: 'Annually', quarterly: 'Quarterly', monthly: 'Monthly' }
export const TIMING_LABEL: Record<TermTiming, string> = { advance: 'In advance', arrears: 'In arrears' }
export const ESCALATION_LABEL: Record<TermEscalation, string> = { none: 'No rise', fixed: 'Fixed %', cpi: 'CPI' }
export const EXIT_LABEL: Record<TermExit, string> = { committed: 'Committed for the term', break: 'Break at each anniversary' }

export const MAX_TERM_MONTHS = 120
export const MAX_BP = 2000
export const MIN_CPI_BP = -1000
export const MAX_NOTICE_DAYS = 365
export const MAX_END_REASON = 300

const int = (n: unknown, lo: number, hi: number): boolean => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi

/** The first problem with a term as the API checks it, in words, or null. */
export function validateTerm(t: TermInput): string | null {
  if (!isDay(t.startDate)) return 'Pick the day the term starts'
  if (!int(t.termMonths, 1, MAX_TERM_MONTHS)) return `The term is 1 month to ${MAX_TERM_MONTHS / 12} years, in whole months`
  if (!int(t.annualCents, 1, 100_000_000)) return 'The annual fee is from $0.01 to $1,000,000.00'
  if (!TERM_FREQUENCIES.includes(t.frequency)) return 'Choose how often it is billed'
  if (t.timing !== 'advance' && t.timing !== 'arrears') return 'Choose in advance or in arrears'
  if (t.escalation !== 'none' && t.escalation !== 'fixed' && t.escalation !== 'cpi') return 'Choose the yearly rise'
  if (t.escalation === 'none' ? t.escalationBp !== 0 : !int(t.escalationBp, 0, MAX_BP)) return 'The yearly rise is 0% to 20%, to two decimal places'
  if (t.exit !== 'committed' && t.exit !== 'break') return 'Choose committed or break at each anniversary'
  if (t.exit === 'committed' ? t.breakNoticeDays !== 0 : !int(t.breakNoticeDays, 0, MAX_NOTICE_DAYS)) return `The notice is 0 to ${MAX_NOTICE_DAYS} days`
  if (typeof t.autoDraft !== 'boolean') return 'Say whether invoices are drafted automatically'
  return null
}

/** A percentage as typed ("3", "2.75", "-1") in basis points, or null when it is not one with at most two decimals. */
export function pctToBp(s: string): number | null {
  const t = s.trim().replace(/%$/, '').trim()
  if (!/^-?\d{1,3}(\.\d{1,2})?$/.test(t)) return null
  const neg = t.startsWith('-')
  const [w, f = ''] = t.replace('-', '').split('.')
  const bp = +w * 100 + +(f + '00').slice(0, 2)
  return neg ? -bp : bp
}

/** 350 -> "3.5", -100 -> "-1", as the server writes a CPI variation label. */
export const bpText = (bp: number): string => String(bp / 100)

export const isInstalment = (m: Pick<BillingMilestone, 'kind'>): boolean => m.kind === 'instalment'
export const oneOffMilestones = (plan: Pick<BillingPlan, 'milestones'> | undefined): BillingMilestone[] => (plan?.milestones ?? []).filter(m => !isInstalment(m))
export const instalmentsOf = (plan: Pick<BillingPlan, 'milestones'> | undefined): BillingMilestone[] => (plan?.milestones ?? []).filter(isInstalment)

type LiveInvoice = Pick<InvoiceDto, 'milestoneId' | 'status'> & Partial<Pick<InvoiceDto, 'test'>>

/** Instalment ids that have a non-void, non-test invoice (a draft included): those keep their amounts when the schedule is re-priced or cut. Earned counts only issued ones (moneyForDeal). */
export function invoicedIds(invoices: readonly LiveInvoice[]): Set<string> {
  return new Set(withoutTest(invoices).filter(i => i.status !== 'void' && !!i.milestoneId).map(i => i.milestoneId as string))
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const t = (d: string): number => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
  return Math.round((t(b) - t(a)) / 86_400_000)
}

/** The term's last day (the day before termEnd). */
export const termLastDay = (t: Pick<BillingTerm, 'startDate' | 'termMonths'>): string => dayBefore(termEndDate(t))

/** The next anniversary of startDate after today that is before termEnd, or null when none is left. */
export function nextAnniversary(t: Pick<BillingTerm, 'startDate' | 'termMonths'>, today: string): string | null {
  const end = termEndDate(t)
  for (let n = 1; ; n++) {
    const a = addMonths(t.startDate, n * 12)
    if (a >= end) return null
    if (a > today) return a
  }
}

/** The last day the client can give notice to break at `anniversary`. */
export const noticeBy = (anniversary: string, noticeDays: number): string => addDays(anniversary, -noticeDays)

/**
 * The anniversary a break agreement can still be ended at: the first anniversary of startDate after today, before
 * termEnd, whose notice day (noticeBy) is today or later. Once an anniversary's notice day has passed without notice,
 * the client can no longer break there, so the year after it is committed. Null when no break is left in the term.
 */
export function nextBreakAnniversary(t: Pick<BillingTerm, 'startDate' | 'termMonths' | 'breakNoticeDays'>, today: string): string | null {
  const end = termEndDate(t)
  for (let n = 1; ; n++) {
    const a = addMonths(t.startDate, n * 12)
    if (a >= end) return null
    if (a > today && noticeBy(a, t.breakNoticeDays) >= today) return a
  }
}

// ── instalment state (Billing tab) ───────────────────────────────────────────────────────────────
export type InstalmentState = 'Not yet due' | 'Due' | 'Drafted' | 'Sent' | 'Overdue' | 'Paid'
export const INSTALMENT_TONE: Record<InstalmentState, '' | 'info' | 'ok' | 'warn' | 'bad' | 'acc'> = {
  'Not yet due': '', Due: 'acc', Drafted: 'warn', Sent: 'info', Overdue: 'bad', Paid: 'ok',
}
export const INSTALMENT_ICON: Record<InstalmentState, string> = {
  'Not yet due': 'clock', Due: 'alert', Drafted: 'edit', Sent: 'send', Overdue: 'alert', Paid: 'check',
}

/** Where an instalment is: from its invoice when it has a live one, else by its invoice date against today. */
export function instalmentState(m: Pick<BillingMilestone, 'plannedDate'>, invoice: Pick<InvoiceDto, 'status' | 'overdue'> | null, today: string): InstalmentState {
  if (invoice && invoice.status !== 'void') {
    if (invoice.status === 'paid') return 'Paid'
    if (invoice.status === 'draft') return 'Drafted'
    return invoice.overdue ? 'Overdue' : 'Sent'
  }
  return m.plannedDate && m.plannedDate <= today ? 'Due' : 'Not yet due'
}

// ── confirm CPI ──────────────────────────────────────────────────────────────────────────────────
export interface CpiChange { id: string; label: string; from: number; to: number }
export interface CpiEffect {
  year: number
  bp: number
  assumedBp: number
  /** The year's fee as assumed now and once confirmed. */
  feeFrom: number
  feeTo: number
  /** Un-invoiced instalments of that year and later, re-priced. */
  changes: CpiChange[]
  /** Instalments of that year and later already invoiced: they keep their amounts. */
  kept: BillingMilestone[]
  /** The approved variation the server appends (0: none). */
  differenceCents: number
  label: string
}

/** CPI years 2..years not yet confirmed. Empty unless the rise is CPI. */
export function unconfirmedCpiYears(t: Pick<BillingTerm, 'escalation' | 'termMonths' | 'cpiConfirmed'>): number[] {
  if (t.escalation !== 'cpi') return []
  const done = new Set((t.cpiConfirmed ?? []).map(c => c.year))
  const out: number[] = []
  for (let y = 2; y <= termYears(t); y++) if (!done.has(y)) out.push(y)
  return out
}

export function cpiProblem(t: BillingTerm, year: number, bp: number | null): string | null {
  if (t.escalation !== 'cpi') return 'This agreement has no CPI rise'
  if (t.ended) return 'This agreement has ended'
  if (!Number.isInteger(year) || year < 2 || year > termYears(t)) return `Choose a year from 2 to ${termYears(t)}`
  if ((t.cpiConfirmed ?? []).some(c => c.year === year)) return `CPI for year ${year} is already confirmed`
  if (bp === null || !int(bp, MIN_CPI_BP, MAX_BP)) return 'The CPI rate is -10% to 20%, to two decimal places'
  return null
}

/** What confirming CPI for `year` at `bp` does to the schedule and the contract, as the server applies it. */
export function cpiEffect(plan: Pick<BillingPlan, 'milestones'> & { term: BillingTerm }, year: number, bp: number, invoices: readonly LiveInvoice[]): CpiEffect {
  const t = plan.term
  const confirmed = { ...t, cpiConfirmed: [...(t.cpiConfirmed ?? []), { year, bp, confirmedOn: '', confirmedBy: '' }] }
  const fresh = new Map(termSchedule(confirmed).map(m => [m.id, m] as const))
  const done = invoicedIds(invoices)
  const changes: CpiChange[] = []
  const kept: BillingMilestone[] = []
  for (const m of instalmentsOf(plan)) {
    if ((m.termYear ?? 0) < year) continue
    if (done.has(m.id)) { kept.push(m); continue }
    const n = fresh.get(m.id)
    if (n && n.amountCents !== m.amountCents) changes.push({ id: m.id, label: m.label, from: m.amountCents, to: n.amountCents })
  }
  return {
    year, bp, assumedBp: t.escalationBp, feeFrom: yearlyFees(t)[year - 1] ?? 0, feeTo: yearlyFees(confirmed)[year - 1] ?? 0, changes, kept,
    differenceCents: changes.reduce((a, c) => a + c.to - c.from, 0),
    label: `CPI year ${year}: ${bpText(bp)}% (assumed ${bpText(t.escalationBp)}%)`,
  }
}

// ── end early ────────────────────────────────────────────────────────────────────────────────────
export interface EndCut { id: string; label: string; from: number; to: number; periodStart: string; periodEnd: string }
export interface EndEffect {
  endedOn: string
  removed: BillingMilestone[]
  cut: EndCut[]
  /** Instalments kept because they already have an invoice, in or after the end. */
  keptInvoiced: BillingMilestone[]
  /** The total taken off the contract: the approved variation is minus this. */
  removedCents: number
  label: string
}

export function endProblem(t: BillingTerm, endedOn: string, reason: string): string | null {
  if (t.ended) return 'This agreement has already ended'
  if (!isDay(endedOn)) return 'Pick the day the agreement ends'
  if (endedOn < t.startDate) return 'The end date cannot be before the term starts'
  if (endedOn >= termEndDate(t)) return `The end date must be before the term ends on ${termEndDate(t)}`
  const r = reason.trim()
  if (r.length < 1 || r.length > MAX_END_REASON) return `Say why it ends, in 1 to ${MAX_END_REASON} characters`
  return null
}

/** What ending on `endedOn` does: instalments removed, an instalment cut to the days before the end, and the variation. */
export function endEffect(plan: Pick<BillingPlan, 'milestones'>, endedOn: string, invoices: readonly LiveInvoice[]): EndEffect {
  const done = invoicedIds(invoices)
  const removed: BillingMilestone[] = []
  const cut: EndCut[] = []
  const keptInvoiced: BillingMilestone[] = []
  for (const m of instalmentsOf(plan)) {
    if (!m.periodStart || !m.periodEnd) continue
    const touches = m.periodStart >= endedOn || m.periodEnd >= endedOn
    if (!touches) continue
    if (done.has(m.id)) { keptInvoiced.push(m); continue }
    if (m.periodStart >= endedOn) { removed.push(m); continue }
    const to = roundDiv(m.amountCents * daysBetween(m.periodStart, endedOn), daysBetween(m.periodStart, m.periodEnd) + 1)
    cut.push({ id: m.id, label: m.label, from: m.amountCents, to, periodStart: m.periodStart, periodEnd: m.periodEnd })
  }
  const removedCents = scheduleTotal(removed) + cut.reduce((a, c) => a + c.from - c.to, 0)
  return { endedOn, removed, cut, keptInvoiced, removedCents, label: `Ended early on ${endedOn}` }
}

/** The server re-prices or trims instalments after an action; until its answer arrives the plan shows the old ones. */
export function scheduleOutOfDate(plan: Pick<BillingPlan, 'milestones'> & { term: BillingTerm }, invoices: readonly LiveInvoice[]): boolean {
  const t = plan.term
  const done = invoicedIds(invoices)
  const want = new Map(termSchedule(t).map(m => [m.id, m.amountCents] as const))
  for (const m of instalmentsOf(plan)) {
    if (done.has(m.id)) continue
    if (t.ended) {
      if (m.periodStart && m.periodStart >= t.ended.endedOn) return true
      continue
    }
    if (want.has(m.id) && want.get(m.id) !== m.amountCents) return true
  }
  return false
}

/** "in 12 days", "today", "3 days ago". */
export function inDays(n: number): string {
  if (n === 0) return 'today'
  if (n > 0) return `in ${n} day${n === 1 ? '' : 's'}`
  return `${-n} day${n === -1 ? '' : 's'} ago`
}
