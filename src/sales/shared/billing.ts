import type { BillingClient, BillingMilestone, BillingPlan, BillingRetainer, InvoiceCompanyTotals, InvoiceDto, InvoicePaymentMethod } from '../api/contract'
import type { Company, Deal } from '../data/types'
import { domOf, norm } from './constants'
import { blankForm, isDay, milestoneLine, milestoneStatus, emptyLine, type InvoiceForm, type MilestoneStatus } from './invoices'
import { centsToInput } from './money'

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
  return out
}

export function cleanRetainer(r: BillingRetainer): BillingRetainer {
  const out: BillingRetainer = { amountCents: r.amountCents, interval: 'monthly' }
  if (r.nextInvoiceDate) out.nextInvoiceDate = r.nextInvoiceDate
  return out
}

export const planId = (dealId: string): string => `bp_${dealId}`

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

export function billingProgress(quoted: number, invoices: ReadonlyArray<Pick<InvoiceDto, 'status' | 'subtotalCents'>>): Progress {
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

export function scheduleRows(plan: BillingPlan | undefined, invoices: readonly InvoiceDto[]): ScheduleRow[] {
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
export interface Prefill { companyId: string; dealId: string; milestoneId?: string; retainer?: boolean }

/** A new invoice for one milestone: company, deal, milestone, and one line for the milestone amount. */
export function prefillForm(base: InvoiceForm, d: Prefill, plan: BillingPlan | undefined): InvoiceForm {
  const next: InvoiceForm = { ...base, companyId: d.companyId, dealId: d.dealId, milestoneId: '' }
  const m = d.milestoneId ? plan?.milestones.find(x => x.id === d.milestoneId) : undefined
  if (m) return { ...next, milestoneId: m.id, lines: [{ ...emptyLine(), ...milestoneLine(m) }] }
  if (d.retainer && plan?.retainer) return { ...next, lines: [{ ...emptyLine(), description: 'Monthly retainer', unitPrice: centsToInput(plan.retainer.amountCents) }] }
  return next
}

export function draftForMilestone(today: string, d: Prefill, plan: BillingPlan | undefined, defaults: { terms?: number; gstPct?: string; card?: boolean } = {}): InvoiceForm {
  return prefillForm(blankForm(today, defaults), d, plan)
}

// ── company billing ──────────────────────────────────────────────────────────────────────────────
export interface CompanyBilling { invoicedCents: number; paidCents: number; outstandingCents: number; overdueCents: number }

/** Ex GST, issued invoices only: drafts are not money owed yet, and cancelled invoices were withdrawn. */
export function companyBilling(list: ReadonlyArray<Pick<InvoiceDto, 'status' | 'overdue' | 'subtotalCents'>>): CompanyBilling {
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
  list.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.invoiceNumber.localeCompare(a.invoiceNumber))).slice(0, n)

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
export function wonNotInvoiced(deals: readonly Deal[], companies: readonly Company[], invoices: ReadonlyArray<Pick<InvoiceDto, 'dealId'> & Partial<Pick<InvoiceDto, 'status'>>>): Deal[] {
  const billed = new Set(invoices.filter(i => i.status !== 'void').map(i => i.dealId).filter((x): x is string => !!x))
  const live = new Set(companies.filter(c => !c.archived).map(c => c.id))
  return deals
    .filter(d => d.businessId === 'ard' && d.status === 'won' && live.has(d.companyId) && !billed.has(d.id))
    .sort((a, b) => (b.closedAt ?? b.stageChangedAt).localeCompare(a.closedAt ?? a.stageChangedAt))
}
