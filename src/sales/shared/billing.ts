import type {
  BillingClient, BillingContract, BillingMilestone, BillingPlan, BillingRetainer, BillingVariation, EngagementType, InvoiceCompanyTotals, InvoiceDto, InvoicePaymentMethod, VariationStatus,
} from '../api/contract'
import type { Company, Deal } from '../data/types'
import { domOf, norm } from './constants'
import { withoutTest, blankForm, isDay, milestoneLine, milestoneStatus, emptyLine, type InvoiceForm, type MilestoneStatus } from './invoices'
import { centsToInput, formatCents } from './money'

// ── validation (the same limits the API enforces on a billing plan) ──────────────────────────────
export const MAX_MILESTONES = 40
export const MAX_LABEL = 120
export const MIN_CENTS = 1
export const MAX_CENTS = 100_000_000

const validCents = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= MIN_CENTS && n <= MAX_CENTS

/** The first problem with a milestone list, in words, or null when it would be accepted. */
export function validateMilestones(list: readonly BillingMilestone[]): string | null {
  if (list.length > MAX_MILESTONES) return `A deal can have at most ${MAX_MILESTONES} milestones`
  const seen = new Set<string>()
  for (let i = 0; i < list.length; i++) {
    const m = list[i]
    const n = i + 1
    if (!m.id || seen.has(m.id)) return `Milestone ${n} needs its own id`
    seen.add(m.id)
    const label = m.label.trim()
    if (label.length < 1 || label.length > MAX_LABEL) return `Milestone ${n}: the label is 1 to ${MAX_LABEL} characters`
    if (!validCents(m.amountCents)) return `Milestone ${n}: the amount is whole cents from 1 to ${MAX_CENTS}`
    if (m.plannedDate !== undefined && m.plannedDate !== '' && !isDay(m.plannedDate)) return `Milestone ${n}: the planned date is not a valid date`
  }
  return null
}

export function validateRetainer(r: BillingRetainer): string | null {
  if (!validCents(r.amountCents)) return `The monthly amount is whole cents from 1 to ${MAX_CENTS}`
  if (r.interval !== 'monthly') return 'Retainers bill monthly'
  if (r.nextInvoiceDate !== undefined && r.nextInvoiceDate !== '' && !isDay(r.nextInvoiceDate)) return 'The next invoice date is not a valid date'
  return null
}

/** Strip empty optional fields so a plan never carries blank dates to the server. */
export function cleanMilestone(m: BillingMilestone): BillingMilestone {
  const out: BillingMilestone = { id: m.id, label: m.label.trim(), amountCents: m.amountCents }
  if (m.plannedDate) out.plannedDate = m.plannedDate
  // Delivered state rides along unchanged, so editing a milestone never forgets that it was delivered.
  if (m.deliveredOn) out.deliveredOn = m.deliveredOn
  // An undo not yet synced must stay an explicit null, or the server keeps the stored date.
  else if (m.deliveredOn === null) out.deliveredOn = null
  if (m.deliveredBy) out.deliveredBy = m.deliveredBy
  return out
}

export function cleanRetainer(r: BillingRetainer): BillingRetainer {
  const out: BillingRetainer = { amountCents: r.amountCents, interval: 'monthly' }
  if (r.nextInvoiceDate) out.nextInvoiceDate = r.nextInvoiceDate
  // Server-owned: kept as it was so an edit does not hide the last drafted period (the server ignores a client value).
  if (r.lastDraftedFor && isDay(r.lastDraftedFor)) out.lastDraftedFor = r.lastDraftedFor
  // Server-owned too: the day of month the retainer started on, so 31 Jan -> 28 Feb -> 31 Mar survives an edit.
  if (typeof r.anchorDay === 'number' && Number.isInteger(r.anchorDay) && r.anchorDay >= 1 && r.anchorDay <= 31) out.anchorDay = r.anchorDay
  return out
}

export const planId = (dealId: string): string => `bp_${dealId}`

// ── retainer automation ──────────────────────────────────────────────────────────────────────────
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "October 2026" for 2026-10-01, the way the server names a retainer period. '' for anything that is not a day. */
export function retainerPeriodLabel(day: string | null | undefined): string {
  if (!day || !isDay(day)) return ''
  return `${FULL_MONTHS[+day.slice(5, 7) - 1]} ${day.slice(0, 4)}`
}

const daysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()
const p2 = (n: number): string => String(n).padStart(2, '0')

/**
 * The retainer date one month after `due`, the way the server moves it after a draft. `anchorDay` is the day of month
 * the retainer started on; it is used only while `due` still agrees with it. 31 Jan -> 28/29 Feb -> 31 Mar.
 */
export function nextRetainerDate(due: string, anchorDay?: number): { next: string; anchorDay: number } {
  const y0 = +due.slice(0, 4), m0 = +due.slice(5, 7), d0 = +due.slice(8, 10)
  const a = typeof anchorDay === 'number' && Number.isInteger(anchorDay) && anchorDay >= 1 && anchorDay <= 31 && d0 === Math.min(anchorDay, daysIn(y0, m0)) ? anchorDay : d0
  const y = m0 === 12 ? y0 + 1 : y0
  const m = m0 === 12 ? 1 : m0 + 1
  return { next: `${y}-${p2(m)}-${p2(Math.min(a, daysIn(y, m)))}`, anchorDay: a }
}

/**
 * The plan's next invoice date after a retainer period is billed by hand. The server keeps the anchorDay it stored
 * and drops one a client sends, so only the stored anchor counts. With no stored anchor, a claim from the 29th to
 * the 31st into a shorter month moves every later date to that shorter day: `laterDay` is then that day.
 */
export function claimedRetainerDate(due: string, storedAnchor?: number): { next: string; laterDay?: number } {
  const { next, anchorDay } = nextRetainerDate(due, storedAnchor)
  const after = nextRetainerDate(next, storedAnchor).anchorDay
  return after === anchorDay ? { next } : { next, laterDay: after }
}

/** "1st", "28th", "31st". */
export function dayOrdinal(d: number): string {
  const t = d % 100
  const s = t >= 11 && t <= 13 ? 'th' : d % 10 === 1 ? 'st' : d % 10 === 2 ? 'nd' : d % 10 === 3 ? 'rd' : 'th'
  return `${d}${s}`
}

/** Never list more than this many catch-up periods; a date this far back is a mistake either way. */
export const MAX_CATCH_UP = 240

/**
 * The periods the server would draft, one per run, before the retainer reaches a date after today: the next invoice
 * date and every month after it up to today. Empty for a future date, no date, or a date the server already claimed.
 */
export function retainerDuePeriods(r: Pick<BillingRetainer, 'nextInvoiceDate' | 'lastDraftedFor' | 'anchorDay'>, today: string): string[] {
  const start = r.nextInvoiceDate
  if (!start || !isDay(start) || start > today) return []
  const out: string[] = []
  let cur = start
  let anchor = r.anchorDay
  while (cur <= today && out.length < MAX_CATCH_UP) {
    if (cur !== r.lastDraftedFor) out.push(cur)
    const n = nextRetainerDate(cur, anchor)
    cur = n.next
    anchor = n.anchorDay
  }
  return out
}

/** "January 2020 to October 2026", or the one period, for a list of retainer dates. */
export function retainerSpanLabel(days: readonly string[]): string {
  if (!days.length) return ''
  const a = retainerPeriodLabel(days[0])
  const b = retainerPeriodLabel(days[days.length - 1])
  return a === b ? a : `${a} to ${b}`
}

/**
 * A next invoice date that would draft a period again: on or before the last period the server drafted. Only a date
 * that changed counts, so an amount edit while the server is between its claim and its move never fails.
 */
export function redraftProblem(next: string | undefined, previous: Pick<BillingRetainer, 'nextInvoiceDate' | 'lastDraftedFor'> | undefined): string | null {
  const last = previous?.lastDraftedFor
  if (!next || !last || !isDay(last) || next === previous?.nextInvoiceDate || next > last) return null
  return `The next invoice date must be after ${retainerPeriodLabel(last)}, the last period already drafted, or that month is drafted again`
}

/**
 * Why the server scheduler drafts nothing for this deal's retainer, or null when it does. It drafts only for a won
 * deal that is not archived, and leaves the plan exactly as it is otherwise, so drafting resumes where it stopped.
 */
export type RetainerPause = 'archived' | 'not-won'

export function retainerPause(deal: { status: string; archived?: boolean }): RetainerPause | null {
  if (deal.archived) return 'archived'
  return deal.status === 'won' ? null : 'not-won'
}

export type RetainerAutoState = 'no-date' | 'scheduled' | 'due' | 'drafted'

/**
 * Where the server scheduler is with a retainer, as far as the plan record shows:
 * no-date (nothing will be drafted), scheduled (a future date), due (on or before today and not yet drafted, the
 * next engine run drafts it, or notifies when the company has no billing client), drafted (the server has claimed
 * this date and is moving it on; seen only for a moment).
 */
export function retainerAutoState(r: Pick<BillingRetainer, 'nextInvoiceDate' | 'lastDraftedFor'>, today: string): RetainerAutoState {
  const next = r.nextInvoiceDate
  if (!next || !isDay(next)) return 'no-date'
  if (r.lastDraftedFor === next) return 'drafted'
  return next <= today ? 'due' : 'scheduled'
}

// ── progress ─────────────────────────────────────────────────────────────────────────────────────
/** A deal's value is stored in dollars; billing works in cents. */
export const quotedCents = (deal: Pick<Deal, 'value'>): number => Math.round((deal.value || 0) * 100)

export interface Progress {
  quoted: number
  /** Sum of non-draft invoices, ex GST. */
  billed: number
  paid: number
  /** Issued and not yet paid. */
  invoiced: number
  /** Quoted minus billed, never negative. */
  unbilled: number
  /** Whole-percent shares of the quoted amount, each capped so the bar never overflows. */
  billedPct: number
  paidPct: number
  invoicedPct: number
}

const pct = (n: number, of: number): number => (of > 0 ? Math.max(0, Math.min(100, Math.round((n / of) * 100))) : 0)

export function billingProgress(quoted: number, all: ReadonlyArray<Pick<InvoiceDto, 'status' | 'subtotalCents'> & Partial<Pick<InvoiceDto, 'test'>>>): Progress {
  const invoices = withoutTest(all)
  let paid = 0
  let invoiced = 0
  for (const i of invoices) {
    // A cancelled invoice is neither billed nor paid.
    if (i.status === 'paid') paid += i.subtotalCents
    else if (i.status === 'sent') invoiced += i.subtotalCents
  }
  const billed = paid + invoiced
  const paidPct = pct(paid, quoted)
  const billedPct = pct(billed, quoted)
  return { quoted, billed, paid, invoiced, unbilled: Math.max(0, quoted - billed), billedPct, paidPct, invoicedPct: Math.max(0, billedPct - paidPct) }
}

// ── schedule rows ────────────────────────────────────────────────────────────────────────────────
export interface ScheduleRow {
  milestone: BillingMilestone
  status: MilestoneStatus
  /** The latest cancelled invoice for this milestone, shown as a note while the milestone is Planned again. */
  cancelled: InvoiceDto | null
  /** The invoice furthest along for this milestone, newest first among equals. */
  invoice: InvoiceDto | null
}

const RANK = { draft: 1, sent: 2, paid: 3 } as const
const newest = (a: InvoiceDto, b: InvoiceDto): number => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)

export function scheduleRows(plan: BillingPlan | undefined, all: readonly InvoiceDto[]): ScheduleRow[] {
  const invoices = withoutTest(all)
  return (plan?.milestones ?? []).map(m => {
    const theirs = invoices.filter(i => i.milestoneId === m.id)
    const mine = theirs.filter((i): i is InvoiceDto & { status: 'draft' | 'sent' | 'paid' } => i.status !== 'void').sort((a, b) => RANK[b.status] - RANK[a.status] || newest(a, b))
    const cancelled = theirs.filter(i => i.status === 'void').sort(newest)[0] ?? null
    return { milestone: m, status: milestoneStatus(m.id, invoices), invoice: mine[0] ?? null, cancelled }
  })
}

export const unbilledRows = (rows: readonly ScheduleRow[]): ScheduleRow[] => rows.filter(r => r.status === 'Planned')

export const STATUS_TONE: Record<MilestoneStatus, '' | 'info' | 'ok' | 'warn'> = { Planned: '', 'Draft invoice': 'warn', Invoiced: 'info', Paid: 'ok' }

// ── the editor, prefilled ────────────────────────────────────────────────────────────────────────
export interface Prefill { companyId: string; dealId: string; milestoneId?: string; retainer?: boolean; /** The due period this retainer invoice bills, when it claims one. */ retainerFor?: string }

/** A new invoice for one milestone: company, deal, milestone, and one line for the milestone amount. */
export function prefillForm(base: InvoiceForm, d: Prefill, plan: BillingPlan | undefined): InvoiceForm {
  const next: InvoiceForm = { ...base, companyId: d.companyId, dealId: d.dealId, milestoneId: '' }
  const m = d.milestoneId ? plan?.milestones.find(x => x.id === d.milestoneId) : undefined
  if (m) return { ...next, milestoneId: m.id, lines: [{ ...emptyLine(), ...milestoneLine(m) }] }
  if (d.retainer && plan?.retainer) {
    // Named like the server's own retainer drafts when it bills a known period.
    const period = retainerPeriodLabel(d.retainerFor)
    return { ...next, lines: [{ ...emptyLine(), description: period ? `Retainer, ${period}` : 'Monthly retainer', unitPrice: centsToInput(plan.retainer.amountCents) }] }
  }
  return next
}

export function draftForMilestone(today: string, d: Prefill, plan: BillingPlan | undefined, defaults: { terms?: number; gstPct?: string; card?: boolean } = {}): InvoiceForm {
  return prefillForm(blankForm(today, defaults), d, plan)
}

// ── company billing ──────────────────────────────────────────────────────────────────────────────
export interface CompanyBilling { invoicedCents: number; paidCents: number; outstandingCents: number; overdueCents: number }

/** Ex GST, issued invoices only: drafts are not money owed yet, and cancelled invoices were withdrawn. */
export function companyBilling(all: ReadonlyArray<Pick<InvoiceDto, 'status' | 'overdue' | 'subtotalCents'> & Partial<Pick<InvoiceDto, 'test'>>>): CompanyBilling {
  const list = withoutTest(all)
  const t: CompanyBilling = { invoicedCents: 0, paidCents: 0, outstandingCents: 0, overdueCents: 0 }
  for (const i of list) {
    if (i.status === 'draft' || i.status === 'void') continue
    t.invoicedCents += i.subtotalCents
    if (i.status === 'paid') t.paidCents += i.subtotalCents
    else {
      t.outstandingCents += i.subtotalCents
      if (i.overdue) t.overdueCents += i.subtotalCents
    }
  }
  return t
}

export const latestInvoices = (list: readonly InvoiceDto[], n = 5): InvoiceDto[] =>
  withoutTest(list).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.invoiceNumber.localeCompare(a.invoiceNumber))).slice(0, n)

export interface LinkSuggestion { client: BillingClient; reasons: string[] }

const digits = (s: string | undefined): string => (s ?? '').replace(/\D/g, '')
const emailDomain = (e: string | undefined): string => (e && e.includes('@') ? e.slice(e.lastIndexOf('@') + 1).trim().toLowerCase() : '')

/**
 * Billing clients that look like this company: same name, a billing email on the company's website domain, or the
 * same ABN. Already-linked clients are never offered. This only suggests; linking is always a click.
 */
export function linkSuggestions(company: Pick<Company, 'name' | 'tradingName' | 'website' | 'domain'> & { abn?: unknown }, clients: readonly BillingClient[], dismissed: ReadonlySet<string> = new Set()): LinkSuggestion[] {
  const names = [company.name, company.tradingName].map(norm).filter(Boolean)
  const dom = (company.domain || domOf(company.website)).toLowerCase()
  const abn = digits(typeof company.abn === 'string' ? company.abn : '')
  const out: LinkSuggestion[] = []
  for (const c of clients) {
    if (c.linkedCompanyId || dismissed.has(c.slug)) continue
    const reasons: string[] = []
    if (names.includes(norm(c.clientName))) reasons.push('Same name')
    if (dom && emailDomain(c.billing.email) === dom) reasons.push('Billing email is on the company website')
    if (abn.length === 11 && digits(c.billing.abn) === abn) reasons.push('Same ABN')
    if (reasons.length) out.push({ client: c, reasons })
  }
  return out.sort((a, b) => b.reasons.length - a.reasons.length || a.client.clientName.localeCompare(b.client.clientName))
}

// ── Customers, Ardorio ───────────────────────────────────────────────────────────────────────────
export interface ArdorioTiles { invoicedCents: number; paidCents: number; outstandingCents: number; overdueCents: number; overdueCustomers: number }

export function ardorioTiles(rows: readonly InvoiceCompanyTotals[]): ArdorioTiles {
  const t: ArdorioTiles = { invoicedCents: 0, paidCents: 0, outstandingCents: 0, overdueCents: 0, overdueCustomers: 0 }
  for (const r of rows) {
    t.invoicedCents += r.invoicedCents
    t.paidCents += r.paidCents
    t.outstandingCents += r.outstandingCents
    t.overdueCents += r.overdueCents
    if (r.overdueCents > 0) t.overdueCustomers++
  }
  return t
}

export interface ArdorioCustomer {
  companyId: string
  name: string
  wonDeals: number
  wonValue: number
  retainer: boolean
  invoicedCents: number
  paidCents: number
  outstandingCents: number
  overdueCents: number
  lastPaymentAt: string | null
  lastPaymentMethod: InvoicePaymentMethod | null
}

/** Companies with an issued invoice or a won deal in Ardorio. Archived companies are left out. */
export function ardorioCustomers(
  totals: readonly InvoiceCompanyTotals[], deals: readonly Deal[], companies: readonly Company[], plans: readonly BillingPlan[] = [],
): ArdorioCustomer[] {
  const byId = new Map(companies.map(c => [c.id, c] as const))
  const won = new Map<string, { n: number; value: number; retainer: boolean }>()
  for (const d of deals) {
    if (d.businessId !== 'ard' || d.status !== 'won') continue
    const w = won.get(d.companyId) ?? { n: 0, value: 0, retainer: false }
    w.n++
    w.value += d.value || 0
    if (plans.some(p => p.dealId === d.id && p.retainer)) w.retainer = true
    won.set(d.companyId, w)
  }
  const tot = new Map<string, InvoiceCompanyTotals>()
  for (const t of totals) tot.set(t.companyId, t)
  const ids = new Set<string>([...won.keys(), ...totals.filter(t => t.invoicedCents > 0).map(t => t.companyId)])
  const out: ArdorioCustomer[] = []
  for (const id of ids) {
    const c = byId.get(id)
    if (!c || c.archived) continue
    const t = tot.get(id)
    const w = won.get(id)
    out.push({
      companyId: id, name: c.name, wonDeals: w?.n ?? 0, wonValue: w?.value ?? 0, retainer: !!w?.retainer,
      invoicedCents: t?.invoicedCents ?? 0, paidCents: t?.paidCents ?? 0, outstandingCents: t?.outstandingCents ?? 0, overdueCents: t?.overdueCents ?? 0,
      lastPaymentAt: t?.lastPaymentAt ?? null, lastPaymentMethod: t?.lastPaymentMethod ?? null,
    })
  }
  return out.sort((a, b) => b.outstandingCents - a.outstandingCents || a.name.localeCompare(b.name))
}

/** Won Ardorio deals with no live invoice at all, drafts included. A cancelled invoice does not count as billing. */
export function wonNotInvoiced(deals: readonly Deal[], companies: readonly Company[], invoices: ReadonlyArray<Pick<InvoiceDto, 'dealId'> & Partial<Pick<InvoiceDto, 'status' | 'test'>>>): Deal[] {
  const billed = new Set(withoutTest(invoices).filter(i => i.status !== 'void').map(i => i.dealId).filter((x): x is string => !!x))
  const live = new Set(companies.filter(c => !c.archived).map(c => c.id))
  return deals
    .filter(d => d.businessId === 'ard' && d.status === 'won' && live.has(d.companyId) && !billed.has(d.id))
    .sort((a, b) => (b.closedAt ?? b.stageChangedAt).localeCompare(a.closedAt ?? a.stageChangedAt))
}

// ── Ardorio contract ledger ──────────────────────────────────────────────────────────────────────
// deal.value is only the estimate. At Won a contract is frozen on the billing plan; later changes are variations in
// an append-only ledger. Contracted = baseline + approved variations, and it is the denominator everywhere.

export const ENGAGEMENT_TYPES: readonly EngagementType[] = ['fixed-price', 'time-materials', 'support-retainer']
export const ENGAGEMENT_LABEL: Record<EngagementType, string> = { 'fixed-price': 'Fixed-price project', 'time-materials': 'Time and materials', 'support-retainer': 'Support retainer' }
export const VARIATION_LABEL: Record<VariationStatus, string> = { proposed: 'Proposed', approved: 'Approved', rejected: 'Rejected' }
export const VARIATION_TONE: Record<VariationStatus, '' | 'ok' | 'warn' | 'bad'> = { proposed: 'warn', approved: 'ok', rejected: '' }
/** The API's limit on a variation's reason. */
export const MAX_REASON = 500

export const isEngagementType = (x: unknown): x is EngagementType => typeof x === 'string' && (ENGAGEMENT_TYPES as readonly string[]).includes(x)

export const approvedVariations = (plan: Pick<BillingPlan, 'variations'> | undefined): BillingVariation[] => (plan?.variations ?? []).filter(v => v.status === 'approved')
export const proposedVariations = (plan: Pick<BillingPlan, 'variations'> | undefined): BillingVariation[] => (plan?.variations ?? []).filter(v => v.status === 'proposed')

/** Baseline plus approved variations, ex GST cents. Null when the plan has no contract (won before the ledger, or Later). */
export function contractedCents(plan: Pick<BillingPlan, 'contract' | 'variations'> | undefined): number | null {
  if (!plan?.contract) return null
  return plan.contract.baselineCents + approvedVariations(plan).reduce((a, v) => a + v.amountCents, 0)
}

/** The contract amount a person typed: whole cents from 1 to MAX_CENTS, like a milestone. */
export function validateContractAmount(cents: number | null): string | null {
  if (cents === null) return 'Enter the contracted amount in dollars and cents, like 48000.00'
  if (!validCents(cents)) return `The contracted amount is from $0.01 to ${centsToInput(MAX_CENTS)}`
  return null
}

/** A contract as the API accepts it. `today` is the latest contract date allowed: the API refuses a future one. */
export function validateContract(c: Pick<BillingContract, 'baselineCents' | 'engagementType' | 'contractedOn' | 'estimateAtWonCents'>, today: string): string | null {
  const bad = validateContractAmount(c.baselineCents)
  if (bad) return bad
  if (!isEngagementType(c.engagementType)) return 'Choose an engagement type'
  if (!isDay(c.contractedOn)) return 'The contract date is not a valid date'
  if (c.contractedOn > today) return 'The contract date cannot be in the future. It is the day the deal was won.'
  if (!Number.isInteger(c.estimateAtWonCents) || c.estimateAtWonCents < 0) return 'The estimate at Won is not a whole number of cents'
  return null
}

/** A variation as the API accepts it: a label, a signed non-zero amount up to MAX_CENTS either way, and a reason. */
export function validateVariation(v: Pick<BillingVariation, 'label' | 'amountCents' | 'reason'>): string | null {
  const label = v.label.trim()
  if (label.length < 1 || label.length > MAX_LABEL) return `The label is 1 to ${MAX_LABEL} characters`
  if (!Number.isInteger(v.amountCents) || v.amountCents === 0 || Math.abs(v.amountCents) > MAX_CENTS) return `The amount is whole cents, not zero, up to ${centsToInput(MAX_CENTS)} either way`
  const reason = v.reason.trim()
  if (reason.length < 1) return 'Say why the contract changes'
  if (reason.length > MAX_REASON) return `The reason is at most ${MAX_REASON} characters`
  return null
}

/**
 * Why counting `amount` as approved would break the contract, or null. The API refuses approved variations that take
 * the contracted total below 0, so a decrease larger than what is contracted is refused here first.
 */
export function approvalProblem(plan: Pick<BillingPlan, 'contract' | 'variations'> | undefined, amount: number): string | null {
  const from = contractedCents(plan)
  if (from === null) return 'Set the contract before adding a variation'
  if (from + amount < 0) return `Approving this would take the contracted total below ${formatCents(0)}. Contracted is ${formatCents(from)}.`
  return null
}

/** "VO-3 " for the third entry: a starting point for the label, which the person can change. */
export const nextVariationLabel = (plan: Pick<BillingPlan, 'variations'> | undefined): string => `VO-${(plan?.variations?.length ?? 0) + 1} `

/** "+$2,400.00" / "−$1,000.00": the sign is always written, never left to colour. */
export function signedCents(cents: number, fmt: (c: number) => string): string {
  return `${cents < 0 ? '−' : '+'}${fmt(Math.abs(cents))}`
}

export interface DealMoney {
  /** deal.value, the estimate. */
  estimate: number
  /** Baseline plus approved variations, or null with no contract. */
  contracted: number | null
  /** Sum of delivered milestones. */
  earned: number
  /** Issued project invoices on this deal: not draft, not cancelled, not test, not from the retainer. Ex GST. */
  invoiced: number
  /** Those of them that are paid. */
  collected: number
  /** invoiced - collected. */
  outstanding: number
  /** Retainer invoices on this deal, issued, ex GST: separate from project progress. */
  retainerInvoiced: number
  /** Sum of milestone amounts. */
  scheduled: number
  /** contracted - scheduled; negative when the milestones add up to more than the contract. Null with no contract. */
  unscheduled: number | null
  /** invoiced - contracted when positive, else 0. Null with no contract. */
  overBilled: number | null
}

type MoneyInvoice = Pick<InvoiceDto, 'status' | 'subtotalCents'> & Partial<Pick<InvoiceDto, 'test' | 'dealId' | 'source' | 'milestoneId'>>

/**
 * Whether an invoice on this deal bills its support retainer rather than the project. A scheduler draft always does.
 * One made by hand counts as retainer when it carries no milestone and the deal has a retainer, which is how the
 * billing card has always listed them, unless the engagement is time and materials: there project invoices carry no
 * milestone either, so only the scheduler's own drafts are retainer. An external record is never retainer.
 */
export function isRetainerInvoice(inv: Pick<MoneyInvoice, 'source' | 'milestoneId'>, plan: Pick<BillingPlan, 'retainer' | 'contract'> | undefined): boolean {
  if (inv.source === 'retainer') return true
  // A record of money invoiced outside SalesOS is project money: it adds to Invoiced and Collected (boards 9 and 10).
  if (inv.source === 'external') return false
  if (inv.milestoneId || !plan?.retainer) return false
  return plan.contract?.engagementType !== 'time-materials'
}

/**
 * The money of one Ardorio deal, ex GST. Invoices on another deal are ignored, so the deal's own list or the whole
 * list both work. A draft is not invoiced yet and a cancelled or test invoice never counts, as everywhere else.
 */
export function moneyForDeal(deal: Pick<Deal, 'id' | 'value'>, plan: Pick<BillingPlan, 'contract' | 'variations' | 'milestones'> & Partial<Pick<BillingPlan, 'retainer'>> | undefined, invoices: readonly MoneyInvoice[]): DealMoney {
  const contracted = contractedCents(plan)
  const milestones = plan?.milestones ?? []
  const scheduled = milestones.reduce((a, m) => a + m.amountCents, 0)
  const earned = milestones.filter(m => !!m.deliveredOn).reduce((a, m) => a + m.amountCents, 0)
  let invoiced = 0, collected = 0, retainerInvoiced = 0
  for (const i of withoutTest(invoices)) {
    if (i.dealId !== undefined && i.dealId !== deal.id) continue
    if (i.status === 'draft' || i.status === 'void') continue
    if (isRetainerInvoice(i, plan)) { retainerInvoiced += i.subtotalCents; continue }
    invoiced += i.subtotalCents
    if (i.status === 'paid') collected += i.subtotalCents
  }
  return {
    estimate: quotedCents(deal), contracted, earned, invoiced, collected, outstanding: invoiced - collected, retainerInvoiced, scheduled,
    unscheduled: contracted === null ? null : contracted - scheduled,
    overBilled: contracted === null ? null : Math.max(0, invoiced - contracted),
  }
}

/** "Scheduled $40,000.00 of $48,000.00, $8,000.00 unscheduled", or over-scheduled, or fully scheduled. */
export function reconciliationLine(scheduled: number, contracted: number, fmt: (c: number) => string): { text: string; tone: '' | 'ok' | 'warn' } {
  const gap = contracted - scheduled
  const head = `Scheduled ${fmt(scheduled)} of ${fmt(contracted)}`
  if (gap > 0) return { text: `${head}, ${fmt(gap)} unscheduled`, tone: 'warn' }
  if (gap < 0) return { text: `${head}, ${fmt(-gap)} over-scheduled`, tone: 'warn' }
  return { text: `${head}, all scheduled`, tone: 'ok' }
}

/** The day a won deal was won, for a contract set after the fact: its close date, else the day it closed. */
export function wonDay(deal: Pick<Deal, 'close' | 'closedAt'>): string {
  if (deal.close && isDay(deal.close)) return deal.close
  const c = (deal.closedAt ?? '').slice(0, 10)
  return isDay(c) ? c : ''
}

/** What approving a variation of `amount` does: the contract and the unscheduled amount before and after. */
export function variationEffect(plan: Pick<BillingPlan, 'contract' | 'variations' | 'milestones'> | undefined, amount: number): { from: number; to: number; unscheduledFrom: number; unscheduledTo: number } | null {
  const from = contractedCents(plan)
  if (from === null) return null
  const scheduled = (plan?.milestones ?? []).reduce((a, m) => a + m.amountCents, 0)
  return { from, to: from + amount, unscheduledFrom: from - scheduled, unscheduledTo: from + amount - scheduled }
}

/** Issued project invoices of this deal that are past due: the part of Outstanding that is overdue. Ex GST. */
export function overdueProjectCents(dealId: string, plan: Pick<BillingPlan, 'retainer' | 'contract'> | undefined, invoices: ReadonlyArray<MoneyInvoice & Partial<Pick<InvoiceDto, 'overdue'>>>): number {
  return withoutTest(invoices)
    .filter(i => (i.dealId === undefined || i.dealId === dealId) && i.status === 'sent' && i.overdue && !isRetainerInvoice(i, plan))
    .reduce((a, i) => a + i.subtotalCents, 0)
}

// ── milestone state: Planned / Delivered (stored) and Draft invoice / Invoiced / Paid (from invoices) ──────────
export type MilestoneState = MilestoneStatus | 'Delivered'
export const STATE_TONE: Record<MilestoneState, '' | 'info' | 'ok' | 'warn' | 'acc'> = { ...STATUS_TONE, Delivered: 'acc' }

/** How far a milestone has got: an invoice state wins once there is a live one, else Delivered when delivered, else Planned. */
export function milestoneState(row: Pick<ScheduleRow, 'status' | 'milestone'>): MilestoneState {
  if (row.status !== 'Planned') return row.status
  return row.milestone.deliveredOn ? 'Delivered' : 'Planned'
}

/** A delivered date as a person picks it: a real day, not after today. */
export function validateDelivered(day: string, today: string): string | null {
  if (!isDay(day)) return 'Pick the day it was delivered'
  if (day > today) return 'The delivered date cannot be in the future'
  return null
}

/** The estimate on the deal no longer matches what it was when the contract was frozen. */
export function estimateChanged(deal: Pick<Deal, 'value'>, plan: Pick<BillingPlan, 'contract'> | undefined): boolean {
  return !!plan?.contract && quotedCents(deal) !== plan.contract.estimateAtWonCents
}

/**
 * The scale of the deal money bullet chart: a tenth beyond the largest figure, so the contracted marker and any
 * overrun both stay inside the track. Nothing is capped at 100% of the contract.
 */
export function bulletScale(values: readonly number[]): number {
  const top = Math.max(0, ...values)
  return top > 0 ? Math.round(top * 1.1) : 1
}

/** A figure's share of the bullet scale, as a CSS width or left: "63.3%". */
export const bulletPct = (n: number, scale: number): string => `${Math.round((Math.max(0, n) / scale) * 1000) / 10}%`

// ── Customers, Ardorio by deal (board 7) ─────────────────────────────────────────────────────────
// Company rows expand to their won Ardorio deals. Each deal's project figures come from moneyForDeal, the same helper
// as the deal page, so the two always agree. A company's Contracted, Earned, Invoiced, Collected and Outstanding are the
// sum of its deal rows, as on board 7, and the tiles are the sum of the companies. Retainer invoices and invoices not on
// a won deal are kept apart, in their own labelled figures, so nothing is mixed into project progress and nothing issued
// is dropped: project + retainer + not on a deal + not on a customer is every issued invoice, as in the revenue report.
// Ex GST cents throughout.

/** Issued invoices in one bucket, ex GST. Outstanding is what is sent and unpaid; overdue is the part of it past due. */
export interface InvoiceMoney { invoiced: number; collected: number; outstanding: number; overdue: number }
export type RetainerMoney = InvoiceMoney

const noMoney = (): InvoiceMoney => ({ invoiced: 0, collected: 0, outstanding: 0, overdue: 0 })
function addInvoice(m: InvoiceMoney, i: Pick<InvoiceDto, 'status' | 'subtotalCents'> & Partial<Pick<InvoiceDto, 'overdue'>>): void {
  m.invoiced += i.subtotalCents
  if (i.status === 'paid') m.collected += i.subtotalCents
  else {
    m.outstanding += i.subtotalCents
    if (i.overdue) m.overdue += i.subtotalCents
  }
}
function addMoney(a: InvoiceMoney, b: InvoiceMoney | null): void {
  if (!b) return
  a.invoiced += b.invoiced
  a.collected += b.collected
  a.outstanding += b.outstanding
  a.overdue += b.overdue
}

/**
 * The contract value of a won deal that no milestone covers yet, never below zero. A fixed-price project bills by
 * milestone, so the gap is contracted minus milestones. Time and materials may invoice with or without milestones, so
 * what is already invoiced on the project covers the contract too; a support retainer bills by its retainer invoices,
 * which count as well. Null with no contract.
 */
export function unscheduledGap(money: Pick<DealMoney, 'contracted' | 'scheduled' | 'invoiced' | 'retainerInvoiced'>, engagement: EngagementType | null): number | null {
  if (money.contracted === null) return null
  const covered = engagement === 'time-materials' ? Math.max(money.scheduled, money.invoiced)
    : engagement === 'support-retainer' ? Math.max(money.scheduled, money.invoiced + money.retainerInvoiced)
      : money.scheduled
  return Math.max(0, money.contracted - covered)
}

export interface ArdorioDealRow {
  deal: Deal
  companyId: string
  engagement: EngagementType | null
  /** The deal page's own figures: Contracted, Earned, project Invoiced, Collected and Outstanding. */
  money: DealMoney
  /** Project invoices of this deal that are past due. */
  overdueCents: number
  /** Retainer invoices of this deal, issued: shown on their own line, never in project progress. */
  retainer: RetainerMoney | null
  /** Contract value no milestone covers yet, by engagement type (see unscheduledGap); 0 with no contract. */
  unscheduledCents: number
  /** The earliest milestone still Planned (not delivered, no live invoice): dated ones first. */
  next: BillingMilestone | null
  /** Delivered milestones with no live invoice yet. */
  deliveredNotInvoiced: BillingMilestone[]
}

export interface ArdorioCompanyRow {
  companyId: string
  name: string
  deals: ArdorioDealRow[]
  /** Sum of the deals' contracted amounts, deals with a contract only. */
  contractedCents: number
  /** Sum of the estimates of won deals that have no contract yet: never added to Contracted. */
  estimateOnlyCents: number
  earnedCents: number
  /** Project figures: the sum of the deal rows, as on the deal page. */
  invoicedCents: number
  collectedCents: number
  outstandingCents: number
  overdueCents: number
  /** Retainer invoices of the company's deals: apart from the project figures. */
  retainer: InvoiceMoney
  /** Issued invoices of the company on no deal, or on a deal that is not a won Ardorio deal: apart from the project figures. */
  notOnDeal: InvoiceMoney
  retainerInvoicedCents: number
}

export interface DeliveredNotInvoiced { deal: Deal; companyId: string; milestone: BillingMilestone }
export interface UnscheduledValue { deal: Deal; companyId: string; engagement: EngagementType | null; contractedCents: number; scheduledCents: number; invoicedCents: number; gapCents: number }
/** A won deal with no contract yet: won before the ledger, recorded later, or deferred with Later. */
export interface NoContractDeal { deal: Deal; companyId: string; estimateCents: number; invoicedCents: number; wonOn: string }

/** Why an invoice is in no deal's figures. */
export type UnlinkedReason = 'no-company' | 'archived-company' | 'unknown-company' | 'no-deal' | 'deal-not-won'
export const UNLINKED_LABEL: Record<UnlinkedReason, string> = {
  'no-company': 'No company', 'archived-company': 'Company archived', 'unknown-company': 'Company not found', 'no-deal': 'No deal', 'deal-not-won': 'Deal not won or archived',
}

export interface ArdorioTotals {
  /** Project figures: the sum of the company rows. */
  contractedCents: number; earnedCents: number; invoicedCents: number; collectedCents: number; outstandingCents: number; overdueCents: number; overdueCustomers: number
  /** Retainer invoices, apart from project progress. */
  retainer: InvoiceMoney
  /** Issued invoices of a customer on no won deal. */
  notOnDeal: InvoiceMoney
  /** Issued invoices on no customer row: no company, or an archived or unknown one. */
  noCustomer: InvoiceMoney
  /** Every issued invoice, not cancelled and not test: the four above together, as the revenue report counts. */
  all: InvoiceMoney
}

export interface ArdorioByDeal {
  companies: ArdorioCompanyRow[]
  tiles: ArdorioTotals
  deliveredNotInvoiced: DeliveredNotInvoiced[]
  unscheduled: UnscheduledValue[]
  noContract: NoContractDeal[]
  /** Live (not cancelled, not test) invoices in no deal's figures: no deal or no company (drafts too), and issued ones on an archived or unknown company or on a deal that is not won. */
  unlinked: InvoiceDto[]
  /** Why each unlinked invoice is unlinked, by invoice id. */
  unlinkedReason: Record<string, UnlinkedReason>
}

/** The milestone a deal bills next: still Planned, earliest planned date first, undated ones after, in schedule order. */
export function nextMilestoneDue(plan: BillingPlan | undefined, invoices: readonly InvoiceDto[]): BillingMilestone | null {
  const open = scheduleRows(plan, invoices).filter(r => milestoneState(r) === 'Planned').map(r => r.milestone)
  const dated = open.filter(m => !!m.plannedDate && isDay(m.plannedDate)).sort((a, b) => (a.plannedDate! < b.plannedDate! ? -1 : a.plannedDate! > b.plannedDate! ? 1 : 0))
  return dated[0] ?? open[0] ?? null
}

/** Retainer invoices of a deal, issued, ex GST. Null when there are none. */
export function retainerMoney(dealId: string, plan: Pick<BillingPlan, 'retainer' | 'contract'> | undefined, invoices: ReadonlyArray<MoneyInvoice & Partial<Pick<InvoiceDto, 'overdue'>>>): RetainerMoney | null {
  const r = noMoney()
  let any = false
  for (const i of withoutTest(invoices)) {
    if (i.dealId !== dealId || i.status === 'draft' || i.status === 'void' || !isRetainerInvoice(i, plan)) continue
    any = true
    addInvoice(r, i)
  }
  return any ? r : null
}

/**
 * Customers by deal for Ardorio. A customer is a live company with a won Ardorio deal or an issued invoice. Deals are
 * the company's won Ardorio deals that are not archived. Cancelled and test invoices never count; drafts are not money yet.
 */
export function ardorioByDeal(deals: readonly Deal[], companies: readonly Company[], plans: readonly BillingPlan[], all: readonly InvoiceDto[]): ArdorioByDeal {
  const live = withoutTest(all).filter(i => i.status !== 'void')
  const byDeal = new Map<string, InvoiceDto[]>()
  for (const i of live) if (i.dealId) byDeal.set(i.dealId, [...(byDeal.get(i.dealId) ?? []), i])
  const planOf = new Map(plans.map(p => [p.dealId, p] as const))
  const cos = new Map(companies.map(c => [c.id, c] as const))
  const dealRows = new Map<string, ArdorioDealRow[]>()
  const counted = new Set<string>()
  const delivered: DeliveredNotInvoiced[] = []
  const unscheduled: UnscheduledValue[] = []
  const noContract: NoContractDeal[] = []
  for (const d of deals) {
    if (d.businessId !== 'ard' || d.status !== 'won' || d.archived === true) continue
    const c = cos.get(d.companyId)
    if (!c || c.archived) continue
    const plan = planOf.get(d.id)
    const inv = byDeal.get(d.id) ?? []
    for (const i of inv) counted.add(i.id)
    const money = moneyForDeal(d, plan, inv)
    const engagement = plan?.contract?.engagementType ?? null
    const gap = unscheduledGap(money, engagement)
    const dni = scheduleRows(plan, inv).filter(r => milestoneState(r) === 'Delivered').map(r => r.milestone)
    const row: ArdorioDealRow = {
      deal: d, companyId: c.id, engagement, money, unscheduledCents: gap ?? 0,
      overdueCents: overdueProjectCents(d.id, plan, inv), retainer: retainerMoney(d.id, plan, inv), next: nextMilestoneDue(plan, inv), deliveredNotInvoiced: dni,
    }
    dealRows.set(c.id, [...(dealRows.get(c.id) ?? []), row])
    for (const m of dni) delivered.push({ deal: d, companyId: c.id, milestone: m })
    if (money.contracted !== null && gap !== null && gap > 0) {
      unscheduled.push({ deal: d, companyId: c.id, engagement, contractedCents: money.contracted, scheduledCents: money.scheduled, invoicedCents: money.invoiced, gapCents: gap })
    }
    if (money.contracted === null) noContract.push({ deal: d, companyId: c.id, estimateCents: money.estimate, invoicedCents: money.invoiced + money.retainerInvoiced, wonOn: wonDay(d) })
  }

  // Invoices on no deal row: on the company's own row when the company is live, else on no customer at all.
  const notOnDeal = new Map<string, InvoiceMoney>()
  const noCustomer = noMoney()
  const unlinked: InvoiceDto[] = []
  const unlinkedReason: Record<string, UnlinkedReason> = {}
  for (const i of live) {
    if (counted.has(i.id)) continue
    const c = i.companyId ? cos.get(i.companyId) : undefined
    const reason: UnlinkedReason = !i.companyId ? 'no-company' : !c ? 'unknown-company' : c.archived ? 'archived-company'
      : !i.dealId ? 'no-deal' : 'deal-not-won'
    const issued = i.status !== 'draft'
    // Drafts are listed only when they have no deal or no company, as before; otherwise only issued money is.
    if (issued || !i.dealId || !i.companyId) { unlinked.push(i); unlinkedReason[i.id] = reason }
    if (!issued) continue
    if (c && !c.archived) {
      const m = notOnDeal.get(c.id) ?? noMoney()
      addInvoice(m, i)
      notOnDeal.set(c.id, m)
    } else addInvoice(noCustomer, i)
  }

  const ids = new Set<string>([...dealRows.keys(), ...notOnDeal.keys()])
  const rows: ArdorioCompanyRow[] = []
  for (const id of ids) {
    const c = cos.get(id)
    if (!c || c.archived) continue
    const ds = dealRows.get(id) ?? []
    const retainer = noMoney()
    for (const r of ds) addMoney(retainer, r.retainer)
    rows.push({
      companyId: id, name: c.name, deals: ds,
      contractedCents: ds.reduce((a, r) => a + (r.money.contracted ?? 0), 0),
      estimateOnlyCents: ds.reduce((a, r) => a + (r.money.contracted === null ? r.money.estimate : 0), 0),
      earnedCents: ds.reduce((a, r) => a + r.money.earned, 0),
      invoicedCents: ds.reduce((a, r) => a + r.money.invoiced, 0),
      collectedCents: ds.reduce((a, r) => a + r.money.collected, 0),
      outstandingCents: ds.reduce((a, r) => a + r.money.outstanding, 0),
      overdueCents: ds.reduce((a, r) => a + r.overdueCents, 0),
      retainer, notOnDeal: notOnDeal.get(id) ?? noMoney(),
      retainerInvoicedCents: retainer.invoiced,
    })
  }
  rows.sort((a, b) => b.outstandingCents - a.outstandingCents || a.name.localeCompare(b.name))
  const tiles: ArdorioTotals = {
    contractedCents: 0, earnedCents: 0, invoicedCents: 0, collectedCents: 0, outstandingCents: 0, overdueCents: 0, overdueCustomers: 0,
    retainer: noMoney(), notOnDeal: noMoney(), noCustomer, all: noMoney(),
  }
  for (const r of rows) {
    tiles.contractedCents += r.contractedCents
    tiles.earnedCents += r.earnedCents
    tiles.invoicedCents += r.invoicedCents
    tiles.collectedCents += r.collectedCents
    tiles.outstandingCents += r.outstandingCents
    tiles.overdueCents += r.overdueCents
    if (r.overdueCents > 0) tiles.overdueCustomers++
    addMoney(tiles.retainer, r.retainer)
    addMoney(tiles.notOnDeal, r.notOnDeal)
  }
  for (const i of live) if (i.status !== 'draft') addInvoice(tiles.all, i)
  delivered.sort((a, b) => (a.milestone.deliveredOn ?? '').localeCompare(b.milestone.deliveredOn ?? ''))
  unscheduled.sort((a, b) => b.gapCents - a.gapCents)
  noContract.sort((a, b) => a.invoicedCents - b.invoicedCents || b.estimateCents - a.estimateCents || (a.deal.title || a.deal.name).localeCompare(b.deal.title || b.deal.name))
  unlinked.sort((a, b) => (a.issueDate < b.issueDate ? 1 : a.issueDate > b.issueDate ? -1 : a.invoiceNumber.localeCompare(b.invoiceNumber)))
  return { companies: rows, tiles, deliveredNotInvoiced: delivered, unscheduled, noContract, unlinked, unlinkedReason }
}

export type ArdorioSortKey = 'name' | 'contracted' | 'earned' | 'invoiced' | 'collected' | 'outstanding'

/** Sort company rows and the deals inside each by the same column. Outstanding, biggest first, is the default. */
export function sortArdorio(rows: readonly ArdorioCompanyRow[], key: ArdorioSortKey = 'outstanding', dir: 1 | -1 = -1): ArdorioCompanyRow[] {
  const co = (r: ArdorioCompanyRow): number | string => key === 'name' ? r.name.toLowerCase() : key === 'contracted' ? r.contractedCents : key === 'earned' ? r.earnedCents : key === 'invoiced' ? r.invoicedCents : key === 'collected' ? r.collectedCents : r.outstandingCents
  const dl = (r: ArdorioDealRow): number | string => key === 'name' ? (r.deal.title || r.deal.name).toLowerCase() : key === 'contracted' ? (r.money.contracted ?? r.money.estimate) : key === 'earned' ? r.money.earned : key === 'invoiced' ? r.money.invoiced : key === 'collected' ? r.money.collected : r.money.outstanding
  const cmp = <T>(f: (x: T) => number | string, tie: (x: T) => string) => (a: T, b: T): number => {
    const x = f(a), y = f(b)
    return (x > y ? dir : x < y ? -dir : 0) || tie(a).localeCompare(tie(b))
  }
  return rows
    .map(r => ({ ...r, deals: r.deals.slice().sort(cmp(dl, d => d.deal.title || d.deal.name)) }))
    .sort(cmp(co, r => r.name))
}
