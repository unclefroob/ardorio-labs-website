import type { BillingMilestone, BillingPlan, BillingTerm, InvoiceDto, TermEscalation, TermExit, TermFrequency, TermTiming } from '../api/contract'
import { addDays, isDay, withoutTest } from './invoices'
import { addMonths, dayBefore, roundDiv, scheduleTotal, termEndDate, termSchedule, termYears, yearlyFees } from './termSchedule'

// Term agreements on the web: what a person types, the checks the API runs on it, and what each action does to the
// schedule, worked out the way the contract block "Ardorio term agreements" says the server does it. Pure helpers.

/** The term as a person sets it. draftFrom, cpiConfirmed, ended and waived belong to the server or to later actions. */
export type TermInput = Omit<BillingTerm, 'draftFrom' | 'cpiConfirmed' | 'ended' | 'waived'>

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
export const MAX_WAIVE_REASON = 300

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
/** An invoice as the previews read it. With its lines, source and link, they can say exactly what happens to a draft. */
export type TermInvoice = LiveInvoice & Partial<Pick<InvoiceDto, 'id' | 'invoiceNumber' | 'lineItems' | 'source' | 'paymentLinkIsAutomatic'>>

/**
 * Instalment ids that have a live (non-void, non-test) invoice, a draft included: an invoice is already on its way, so
 * the instalment needs no new one. This never decides an amount: only an issued invoice fixes one (issuedIds).
 */
export function invoicedIds(invoices: readonly LiveInvoice[]): Set<string> {
  return new Set(withoutTest(invoices).filter(i => i.status !== 'void' && !!i.milestoneId).map(i => i.milestoneId as string))
}

/**
 * Instalment ids that have an ISSUED invoice (sent or paid, not test). Only these keep their amounts when Confirm CPI,
 * End early or a waiver changes the schedule, and only these are earned. A draft does not fix anything: it follows.
 */
export function issuedIds(invoices: readonly LiveInvoice[]): Set<string> {
  return new Set(withoutTest(invoices).filter(i => (i.status === 'sent' || i.status === 'paid') && !!i.milestoneId).map(i => i.milestoneId as string))
}

/** What the server does to a draft of an instalment it re-prices or removes. */
export type DraftFate = 'repriced' | 'removed' | 'unlinked'
export interface DraftChange { invoiceId: string; ref: string; milestoneId: string; fate: DraftFate; /** The new amount when re-priced. */ to: number | null }

/**
 * The drafts that follow a change, as the server's termDrafts does it: each live draft of an instalment re-priced (to the
 * new cents) or removed (null) takes the new amount when it has one line at qty 1 and no automatic card link; otherwise
 * a draft the server made (source 'term') is removed and one made by hand is unlinked from the instalment and kept. A
 * draft already at the new amount is left alone.
 */
export function draftChanges(changes: ReadonlyMap<string, number | null>, invoices: readonly TermInvoice[]): DraftChange[] {
  const out: DraftChange[] = []
  for (const i of withoutTest(invoices)) {
    if (i.status !== 'draft' || !i.milestoneId || !changes.has(i.milestoneId)) continue
    const to = changes.get(i.milestoneId) ?? null
    const lines = i.lineItems
    const subtotal = lines ? lines.reduce((a, l) => a + Math.round(l.qty * l.unitPriceCents), 0) : null
    if (to !== null && subtotal === to) continue
    const simple = (!lines || (lines.length === 1 && lines[0].qty === 1)) && !i.paymentLinkIsAutomatic
    const fate: DraftFate = to !== null && simple ? 'repriced' : i.source === 'term' ? 'removed' : 'unlinked'
    out.push({ invoiceId: i.id ?? '', ref: i.invoiceNumber || 'A draft', milestoneId: i.milestoneId, fate, to: fate === 'repriced' ? to : null })
  }
  return out
}

/** "Its draft INV-0104 takes the new amount, $3,135.00." and the like: one sentence per draft. */
export function draftChangeText(d: DraftChange, fmt: (cents: number) => string): string {
  if (d.fate === 'repriced') return `Its draft ${d.ref} takes the new amount, ${fmt(d.to ?? 0)}.`
  if (d.fate === 'removed') return `Its draft ${d.ref} is removed.`
  return `Its draft ${d.ref}, made by hand, is unlinked from the instalment and kept.`
}

/** A reason as the API takes it: plain text of 1 to `max` characters once trimmed. Null when it is fine. */
export function reasonProblem(reason: string, max: number, ask: string): string | null {
  const r = reason.trim()
  if (r.length < 1 || r.length > max) return `${ask}, in 1 to ${max} characters`
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(r)) return 'The reason cannot contain control characters'
  return null
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
  /** Un-issued instalments of that year and later, re-priced (a drafted one included). */
  changes: CpiChange[]
  /** Instalments of that year and later with an issued invoice: they keep their amounts. */
  kept: BillingMilestone[]
  /** The drafts of the re-priced instalments, and what happens to each. */
  drafts: DraftChange[]
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
  return cpiRateProblem(bp)
}

/** The rate alone, for the field's own message. */
export const cpiRateProblem = (bp: number | null): string | null =>
  bp === null || !int(bp, MIN_CPI_BP, MAX_BP) ? 'The CPI rate is -10% to 20%, to two decimal places' : null

/** What confirming CPI for `year` at `bp` does to the schedule and the contract, as the server applies it. */
export function cpiEffect(plan: Pick<BillingPlan, 'milestones'> & { term: BillingTerm }, year: number, bp: number, invoices: readonly TermInvoice[]): CpiEffect {
  const t = plan.term
  const confirmed = { ...t, cpiConfirmed: [...(t.cpiConfirmed ?? []), { year, bp, confirmedOn: '', confirmedBy: '' }] }
  const fresh = new Map(termSchedule(confirmed).map(m => [m.id, m] as const))
  const done = issuedIds(invoices)
  const changes: CpiChange[] = []
  const kept: BillingMilestone[] = []
  for (const m of instalmentsOf(plan)) {
    if ((m.termYear ?? 0) < year) continue
    if (done.has(m.id)) { kept.push(m); continue }
    const n = fresh.get(m.id)
    if (n && n.amountCents !== m.amountCents) changes.push({ id: m.id, label: m.label, from: m.amountCents, to: n.amountCents })
  }
  return {
    year, bp, assumedBp: t.escalationBp, feeFrom: yearlyFees(t)[year - 1] ?? 0,
    feeTo: yearlyFees(confirmed)[year - 1] ?? 0, changes, kept,
    drafts: draftChanges(new Map(changes.map(c => [c.id, c.to] as const)), invoices),
    differenceCents: changes.reduce((a, c) => a + c.to - c.from, 0),
    label: `CPI year ${year}: ${bpText(bp)}% (assumed ${bpText(t.escalationBp)}%)`,
  }
}

// ── end early ────────────────────────────────────────────────────────────────────────────────────
export interface EndCut {
  id: string; label: string; from: number; to: number; periodStart: string; periodEnd: string
  /** After the cut: the period ends the day before the end, and an instalment billed in arrears is invoiced that day. */
  newPeriodEnd: string
  newPlannedDate: string
}
export interface EndEffect {
  endedOn: string
  /** Removed whole: from the end on, or cut to less than a cent. */
  removed: BillingMilestone[]
  cut: EndCut[]
  /** Instalments kept because they have an issued invoice, in or after the end. */
  keptIssued: BillingMilestone[]
  /** The drafts of the removed and cut instalments, and what happens to each. */
  drafts: DraftChange[]
  /** The total taken off the contract: the approved variation is minus this. */
  removedCents: number
  label: string
}

export function endProblem(t: BillingTerm, endedOn: string, reason: string): string | null {
  if (t.ended) return 'This agreement has already ended'
  return endDateProblem(t, endedOn) ?? endReasonProblem(reason)
}

/** The end date alone, for the field's own message. */
export function endDateProblem(t: Pick<BillingTerm, 'startDate' | 'termMonths'>, endedOn: string): string | null {
  if (!isDay(endedOn)) return 'Pick the day the agreement ends'
  if (endedOn < t.startDate) return 'The end date cannot be before the term starts'
  if (endedOn >= termEndDate(t)) return `The end date must be before the term ends on ${termEndDate(t)}`
  return null
}

/** The reason alone, for the field's own message. */
export const endReasonProblem = (reason: string): string | null => reasonProblem(reason, MAX_END_REASON, 'Say why it ends')

/**
 * What ending on `endedOn` does, as the server applies it: un-issued instalments from the end on are removed; one that
 * spans the end is cut to its days before the end (removed whole when that rounds below a cent), ends the day before
 * the end and, billed in arrears, is invoiced that day; the drafts of all of them follow; and the variation.
 */
export function endEffect(plan: Pick<BillingPlan, 'milestones'> & { term?: Pick<BillingTerm, 'timing'> }, endedOn: string, invoices: readonly TermInvoice[]): EndEffect {
  const done = issuedIds(invoices)
  const removed: BillingMilestone[] = []
  const cut: EndCut[] = []
  const keptIssued: BillingMilestone[] = []
  for (const m of instalmentsOf(plan)) {
    if (!m.periodStart || !m.periodEnd) continue
    const touches = m.periodStart >= endedOn || m.periodEnd >= endedOn
    if (!touches) continue
    if (done.has(m.id)) { keptIssued.push(m); continue }
    if (m.periodStart >= endedOn) { removed.push(m); continue }
    const to = roundDiv(m.amountCents * daysBetween(m.periodStart, endedOn), daysBetween(m.periodStart, m.periodEnd) + 1)
    if (to < 1) { removed.push(m); continue }
    const arrears = (plan.term?.timing ?? (m.plannedDate === m.periodEnd ? 'arrears' : 'advance')) === 'arrears'
    const newPeriodEnd = dayBefore(endedOn)
    cut.push({
      id: m.id, label: m.label, from: m.amountCents, to, periodStart: m.periodStart, periodEnd: m.periodEnd,
      newPeriodEnd, newPlannedDate: arrears ? newPeriodEnd : m.plannedDate ?? m.periodStart,
    })
  }
  const removedCents = scheduleTotal(removed) + cut.reduce((a, c) => a + c.from - c.to, 0)
  const changes = new Map<string, number | null>([...removed.map(m => [m.id, null] as const), ...cut.map(c => [c.id, c.to] as const)])
  return { endedOn, removed, cut, keptIssued, drafts: draftChanges(changes, invoices), removedCents, label: `Ended early on ${endedOn}` }
}

// ── waive an instalment ──────────────────────────────────────────────────────────────────────────
export interface WaiveEffect {
  instalment: BillingMilestone
  /** The approved variation the server appends is minus this. */
  amountCents: number
  label: string
  drafts: DraftChange[]
}

/** Why `milestoneId` cannot be waived with `reason`, as the API checks it, or null. */
export function waiveProblem(plan: Pick<BillingPlan, 'milestones'> & { term: BillingTerm }, milestoneId: string, reason: string, invoices: readonly LiveInvoice[]): string | null {
  return waivableProblem(plan, milestoneId, invoices) ?? waiveReasonProblem(reason)
}

/** Whether the instalment itself can be waived: one of the plan's, not waived already, and un-issued. */
export function waivableProblem(plan: Pick<BillingPlan, 'milestones'> & { term: BillingTerm }, milestoneId: string, invoices: readonly LiveInvoice[]): string | null {
  if ((plan.term.waived ?? []).some(w => w.milestoneId === milestoneId)) return 'This instalment is already waived'
  if (!instalmentsOf(plan).some(m => m.id === milestoneId)) return 'That instalment is no longer on this agreement'
  if (issuedIds(invoices).has(milestoneId)) return 'This instalment has an issued invoice: cancel the invoice before waiving it'
  return null
}

/** The reason alone, for the field's own message. */
export const waiveReasonProblem = (reason: string): string | null => reasonProblem(reason, MAX_WAIVE_REASON, 'Say why it is waived')

/** What waiving does: the instalment goes, minus its amount is added as an approved variation, and its drafts follow. */
export function waiveEffect(plan: Pick<BillingPlan, 'milestones'>, milestoneId: string, invoices: readonly TermInvoice[]): WaiveEffect | null {
  const m = instalmentsOf(plan).find(x => x.id === milestoneId)
  if (!m) return null
  return { instalment: m, amountCents: m.amountCents, label: `Waived: ${m.label}`.slice(0, 120), drafts: draftChanges(new Map([[m.id, null]]), invoices) }
}

/**
 * True while this browser has confirmed CPI, ended the agreement or waived an instalment and the server has not yet
 * answered: until it does, the schedule shown is the one from before. `server` is the term as the server last stored it
 * (undefined when the plan has no server copy yet). Exact: it compares the two terms, never amounts against invoices,
 * so a voided invoice or a cut instalment never makes the schedule look out of date.
 */
export function termActionPending(local: Pick<BillingTerm, 'cpiConfirmed' | 'ended' | 'waived'>, server: Pick<BillingTerm, 'cpiConfirmed' | 'ended' | 'waived'> | undefined): boolean {
  if (!server) return false
  return (local.cpiConfirmed?.length ?? 0) > (server.cpiConfirmed?.length ?? 0)
    || (!!local.ended && !server.ended)
    || (local.waived?.length ?? 0) > (server.waived?.length ?? 0)
}

/** "in 12 days", "today", "3 days ago". */
export function inDays(n: number): string {
  if (n === 0) return 'today'
  if (n > 0) return `in ${n} day${n === 1 ? '' : 's'}`
  return `${-n} day${n === -1 ? '' : 's'} ago`
}
