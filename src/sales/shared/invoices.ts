import type {
  BillingMilestone, BillingPlan, InvoiceDto, InvoiceInput, InvoiceLinksInput, InvoicePaymentMethod, InvoiceStatus, InvoiceVoidReason, MarkPaidInput, MarkTestInput, VoidInvoiceInput,
} from '../api/contract'
import { centsToInput, computeTotals, formatCents, milliToQty, parseCents, parsePercentBp, parseQtyMilli, qtyToInput, rateToPercentText } from './money'

export const DEFAULT_TERMS_DAYS = 45
export const DEFAULT_GST_PERCENT = '10'
export const BUSINESS = 'ard' as const

export const METHOD_LABELS: Record<InvoicePaymentMethod, string> = {
  'bank-transfer': 'Bank transfer',
  payid: 'PayID',
  card: 'Card',
  other: 'Other',
}
export const METHOD_ORDER: readonly InvoicePaymentMethod[] = ['bank-transfer', 'payid', 'card', 'other']

// ── dates (plain yyyy-mm-dd strings; no time zone maths) ─────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isDay(s: string): boolean {
  const m = DAY_RE.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

/** "3 Oct 2026". Always shows the year: invoices outlive the calendar year they were raised in. */
export function fmtDay(s: string | null | undefined): string {
  const t = (s ?? '').slice(0, 10)
  const m = DAY_RE.exec(t)
  return m && isDay(t) ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : '—'
}

export function addDays(day: string, n: number): string {
  if (!isDay(day)) return day
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

// ── status display ───────────────────────────────────────────────────────────────────────────────
export interface StatusChip { label: string; tone: '' | 'info' | 'ok' | 'bad'; icon?: string }

/** Overdue is worked out from the due date. It outranks the stored 'sent' in the chip but is never a status of its own. */
export function statusChip(inv: Pick<InvoiceDto, 'status' | 'overdue'>): StatusChip {
  // Cancelled carries an icon as well as words: status is never colour alone. A void invoice is never overdue.
  if (inv.status === 'void') return { label: 'Cancelled', tone: '', icon: 'x' }
  if (inv.status === 'paid') return { label: 'Paid', tone: 'ok' }
  if (inv.overdue) return { label: 'Overdue', tone: 'bad' }
  if (inv.status === 'sent') return { label: 'Sent', tone: 'info' }
  return { label: 'Draft', tone: '' }
}

/** Due cell: the date, and for an overdue invoice how late it is. A draft has no real due date yet, only terms. */
export function dueCell(inv: Pick<InvoiceDto, 'status' | 'overdue' | 'dueDate' | 'paymentTermsDays'>, today: string): { text: string; sub: string; late: boolean } {
  if (inv.status === 'draft') return { text: `${inv.paymentTermsDays}-day terms`, sub: '', late: false }
  if (inv.status === 'paid' || inv.status === 'void') return { text: fmtDay(inv.dueDate), sub: '', late: false }
  if (inv.overdue) {
    const n = Math.max(1, daysBetween(inv.dueDate, today))
    return { text: fmtDay(inv.dueDate), sub: `${n} day${n === 1 ? '' : 's'} overdue`, late: true }
  }
  return { text: fmtDay(inv.dueDate), sub: '', late: false }
}

export const issuedText = (inv: Pick<InvoiceDto, 'status' | 'issueDate'>): string => (inv.status === 'draft' ? 'Not issued' : fmtDay(inv.issueDate))

export function isReissued(inv: Pick<InvoiceDto, 'issuedCount'>): boolean {
  return inv.issuedCount > 1
}

// ── list: tabs, search, filters ──────────────────────────────────────────────────────────────────
export type InvoiceTab = 'all' | 'draft' | 'sent' | 'overdue' | 'paid'
export const TABS: ReadonlyArray<readonly [InvoiceTab, string]> = [['all', 'All'], ['draft', 'Drafts'], ['sent', 'Sent'], ['overdue', 'Overdue'], ['paid', 'Paid']]

export function inTab(inv: Pick<InvoiceDto, 'status' | 'overdue'>, tab: InvoiceTab): boolean {
  if (tab === 'all') return true
  if (tab === 'overdue') return inv.status === 'sent' && inv.overdue // never a void invoice
  return inv.status === tab
}

/** Sent includes the overdue ones: overdue is a view over sent invoices, not a separate state. */
export function tabCounts(all: ReadonlyArray<Pick<InvoiceDto, 'status' | 'overdue'> & MaybeTest>): Record<InvoiceTab, number> {
  const list = withoutTest(all)
  const c: Record<InvoiceTab, number> = { all: list.length, draft: 0, sent: 0, overdue: 0, paid: 0 }
  for (const i of list) {
    if (i.status === 'draft') c.draft++
    else if (i.status === 'paid') c.paid++
    else if (i.status === 'void') continue // listed in All only
    else {
      c.sent++
      if (i.overdue) c.overdue++
    }
  }
  return c
}

export interface InvoiceFilter { tab: InvoiceTab; query: string; companyId: string; /** Only cancelled invoices whose refund is still owed. */ refundOnly?: boolean; /** Test invoices are listed only when this is true. */ includeTest?: boolean }

export function filterInvoices(list: readonly InvoiceDto[], f: InvoiceFilter, dealName: (id: string | null) => string = () => ''): InvoiceDto[] {
  const q = f.query.trim().toLowerCase()
  return list
    .filter(i => f.includeTest || !i.test)
    .filter(i => inTab(i, f.tab))
    .filter(i => !f.companyId || i.companyId === f.companyId)
    .filter(i => !f.refundOnly || needsRefund(i))
    .filter(i => !q || [i.source === 'external' ? '' : i.invoiceNumber, i.external?.reference ?? '', i.clientName, dealName(i.dealId)].some(s => s.toLowerCase().includes(q)))
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.invoiceNumber.localeCompare(a.invoiceNumber)))
}

// ── test invoices ────────────────────────────────────────────────────────────────────────────────
type MaybeTest = { test?: InvoiceDto['test'] }
/** True when the invoice was marked as a test. Absent counts as not a test. */
export const isTest = (inv: MaybeTest): boolean => !!inv.test
/** Everything derived from invoices (totals, milestone status, billed progress) leaves test invoices out, even if one slips into a list. */
export const withoutTest = <T extends MaybeTest>(list: readonly T[]): T[] => list.filter(i => !i.test)

// ── milestones ───────────────────────────────────────────────────────────────────────────────────
export type MilestoneStatus = 'Planned' | 'Draft invoice' | 'Invoiced' | 'Paid'
const RANK: Record<Exclude<InvoiceStatus, 'void'>, number> = { draft: 1, sent: 2, paid: 3 }
const RANKED: readonly MilestoneStatus[] = ['Planned', 'Draft invoice', 'Invoiced', 'Paid']

/** Planned until a live invoice carries the milestone id; then the furthest any of them has got. A cancelled invoice counts for nothing. */
export function milestoneStatus(milestoneId: string, invoices: ReadonlyArray<Pick<InvoiceDto, 'milestoneId' | 'status'> & MaybeTest>): MilestoneStatus {
  let best = 0
  for (const i of withoutTest(invoices)) if (i.milestoneId === milestoneId && i.status !== 'void') best = Math.max(best, RANK[i.status])
  return RANKED[best]
}

export function milestoneLine(m: BillingMilestone): { description: string; unitPrice: string } {
  return { description: m.label, unitPrice: centsToInput(m.amountCents) }
}

export const planFor = (plans: readonly BillingPlan[], dealId: string | null): BillingPlan | undefined => (dealId ? plans.find(p => p.dealId === dealId) : undefined)

// ── editor form ──────────────────────────────────────────────────────────────────────────────────
export interface FormLine { description: string; detail: string; qty: string; unitPrice: string }
export const emptyLine = (): FormLine => ({ description: '', detail: '', qty: '1', unitPrice: '' })

export interface InvoiceForm {
  companyId: string
  clientSlug: string
  dealId: string
  milestoneId: string
  issueDate: string
  terms: string
  dueDate: string
  dueEdited: boolean
  gstPct: string
  notes: string
  offerCard: boolean
  paymentLink: string
  lines: FormLine[]
}

export function blankForm(today: string, d: { terms?: number; gstPct?: string; card?: boolean } = {}): InvoiceForm {
  const terms = d.terms ?? DEFAULT_TERMS_DAYS
  return {
    companyId: '', clientSlug: '', dealId: '', milestoneId: '', issueDate: today, terms: String(terms), dueDate: addDays(today, terms), dueEdited: false,
    gstPct: d.gstPct ?? DEFAULT_GST_PERCENT, notes: '', offerCard: !!d.card, paymentLink: '', lines: [emptyLine()],
  }
}

export function formFromInvoice(inv: InvoiceDto): InvoiceForm {
  return {
    companyId: inv.companyId ?? '', clientSlug: inv.clientSlug, dealId: inv.dealId ?? '', milestoneId: inv.milestoneId ?? '',
    issueDate: inv.issueDate, terms: String(inv.paymentTermsDays), dueDate: inv.dueDate,
    // A stored due date that is not issue + terms was set by hand; keep it.
    dueEdited: inv.dueDate !== addDays(inv.issueDate, inv.paymentTermsDays),
    gstPct: rateToPercentText(inv.gstRate), notes: inv.notes, offerCard: inv.offerCardPayment, paymentLink: inv.paymentLinkUrl,
    lines: inv.lineItems.length
      ? inv.lineItems.map(l => ({ description: l.description, detail: l.detail ?? '', qty: qtyToInput(l.qty), unitPrice: centsToInput(l.unitPriceCents) }))
      : [emptyLine()],
  }
}

/** Terms drive the due date until the due date is typed over. */
export function withTerms(f: InvoiceForm, patch: Partial<Pick<InvoiceForm, 'issueDate' | 'terms'>>): InvoiceForm {
  const next = { ...f, ...patch }
  const n = Number(next.terms)
  return next.dueEdited || !Number.isInteger(n) ? next : { ...next, dueDate: addDays(next.issueDate, n) }
}

export type FormErrors = Partial<Record<'customer' | 'issueDate' | 'terms' | 'dueDate' | 'gst' | 'lines' | 'link', string>> & { line: Record<number, string> }

export function validateForm(f: InvoiceForm): { ok: boolean; errors: FormErrors } {
  const errors: FormErrors = { line: {} }
  if (!f.clientSlug) errors.customer = 'Choose a customer. It needs billing details before it can be invoiced.'
  if (!isDay(f.issueDate)) errors.issueDate = 'Enter a valid issue date'
  const terms = Number(f.terms)
  if (f.terms.trim() === '' || !Number.isInteger(terms) || terms < 0 || terms > 365) errors.terms = 'Terms are a whole number of days, 0 to 365'
  if (!isDay(f.dueDate)) errors.dueDate = 'Enter a valid due date'
  else if (isDay(f.issueDate) && f.dueDate < f.issueDate) errors.dueDate = 'The due date cannot be before the issue date'
  if (parsePercentBp(f.gstPct) === null) errors.gst = 'GST is a percentage from 0 to 100'
  if (f.paymentLink.trim() && !/^https:\/\/\S+$/i.test(f.paymentLink.trim())) errors.link = 'A payment link must start with https://'
  if (!f.lines.length) errors.lines = 'Add at least one line'
  f.lines.forEach((l, i) => {
    if (!l.description.trim()) errors.line[i] = 'Describe what this line is for'
    else if (parseQtyMilli(l.qty) === null) errors.line[i] = 'Quantity must be more than 0, with up to 3 decimals'
    else if (parseCents(l.unitPrice) === null) errors.line[i] = 'Unit price must be dollars and cents, like 480.00'
  })
  const ok = !errors.customer && !errors.issueDate && !errors.terms && !errors.dueDate && !errors.gst && !errors.link && !errors.lines && Object.keys(errors.line).length === 0
  return { ok, errors }
}

/** Only call after `validateForm` said ok. */
export function buildInput(f: InvoiceForm): InvoiceInput {
  const bp = parsePercentBp(f.gstPct) ?? 0
  return {
    clientSlug: f.clientSlug,
    companyId: f.companyId || null,
    dealId: f.dealId || null,
    milestoneId: f.milestoneId || null,
    lineItems: f.lines.map(l => ({
      description: l.description.trim(),
      ...(l.detail.trim() ? { detail: l.detail.trim() } : {}),
      qty: milliToQty(parseQtyMilli(l.qty) ?? 0),
      unitPriceCents: parseCents(l.unitPrice) ?? 0,
    })),
    gstRate: bp / 10000,
    notes: f.notes.trim(),
    issueDate: f.issueDate,
    paymentTermsDays: Number(f.terms),
    dueDate: f.dueDate,
    offerCardPayment: f.offerCard,
    paymentLinkUrl: f.paymentLink.trim(),
  }
}

const LINK_KEYS = ['companyId', 'dealId', 'milestoneId'] as const

/** True when the form differs from the stored invoice in its company, deal or milestone at most. */
export function onlyLinksChanged(f: InvoiceForm, inv: InvoiceDto): boolean {
  const strip = (x: InvoiceForm): InvoiceForm => ({ ...x, companyId: '', dealId: '', milestoneId: '', clientSlug: '' })
  return JSON.stringify(strip(f)) === JSON.stringify(strip(formFromInvoice(inv)))
}

/**
 * The PUT /invoices/:id/links body for an invoice whose links alone change: only the keys that differ from what is
 * stored, so an unchanged company is not validated again. That route writes nothing but the links, so the invoice is
 * never reissued, renumbered or re-addressed and its card link stays as it is.
 */
export function linkChanges(inv: Pick<InvoiceDto, 'companyId' | 'dealId' | 'milestoneId'>, f: Pick<InvoiceForm, 'companyId' | 'dealId' | 'milestoneId'>): InvoiceLinksInput {
  const out: InvoiceLinksInput = {}
  for (const k of LINK_KEYS) {
    const v = f[k] || null
    if (v !== (inv[k] ?? null)) out[k] = v
  }
  return out
}

export const formTotals = (f: InvoiceForm) => computeTotals(f.lines, parsePercentBp(f.gstPct) ?? 0)

// ── mark paid ────────────────────────────────────────────────────────────────────────────────────
export interface PaidForm { method: InvoicePaymentMethod; paidAt: string; amount: string; reference: string }

/** The amount defaults to the invoice total (inc GST). */
export const defaultPaidForm = (inv: Pick<InvoiceDto, 'totalCents' | 'offerCardPayment' | 'paymentLinkUrl'>, today: string): PaidForm => ({
  method: 'bank-transfer', paidAt: today, amount: centsToInput(inv.totalCents), reference: '',
})

export function buildMarkPaid(f: PaidForm, today: string): { ok: true; input: MarkPaidInput } | { ok: false; errors: Partial<Record<'paidAt' | 'amount', string>> } {
  const errors: Partial<Record<'paidAt' | 'amount', string>> = {}
  if (!isDay(f.paidAt)) errors.paidAt = 'Enter a valid date'
  else if (f.paidAt > today) errors.paidAt = 'The payment date cannot be in the future'
  const cents = parseCents(f.amount)
  if (cents === null || cents <= 0) errors.amount = 'Enter the amount received, like 19800.00'
  if (errors.paidAt || errors.amount) return { ok: false, errors }
  return { ok: true, input: { method: f.method, paidAt: f.paidAt, amountCents: cents as number, ...(f.reference.trim() ? { reference: f.reference.trim() } : {}) } }
}

// ── what a person may do ─────────────────────────────────────────────────────────────────────────
export interface Actions {
  edit: boolean; issue: boolean; reissue: boolean; markPaid: boolean; delete: boolean; copyLink: boolean; pdf: boolean; readOnly: boolean
  /** Cancel (void) is offered for sent and overdue invoices only. */
  cancel: boolean
  /** A paid invoice shows Cancel disabled, with the reason beside it. */
  cancelBlockedPaid: boolean
  duplicate: boolean
  voided: boolean
}

export const PAID_CANCEL_HINT = 'Paid invoices cannot be cancelled. Refund or issue a credit instead.'

export function actionsFor(inv: Pick<InvoiceDto, 'status'> & Partial<Pick<InvoiceDto, 'source'>> | null): Actions {
  if (!inv) return { edit: true, issue: false, reissue: false, markPaid: false, delete: false, copyLink: false, pdf: false, readOnly: false, cancel: false, cancelBlockedPaid: false, duplicate: false, voided: false }
  if (inv.source === 'external') {
    // A record of an invoice made outside SalesOS: edited in its own dialog, and cancelled whether it reads as sent or
    // paid. No PDF, hosted link, issue, reissue, mark paid, card link or duplicate: the server refuses all of them.
    const voided = inv.status === 'void'
    return { edit: !voided, issue: false, reissue: false, markPaid: false, delete: false, copyLink: false, pdf: false, readOnly: true, cancel: !voided, cancelBlockedPaid: false, duplicate: false, voided }
  }
  const draft = inv.status === 'draft'
  const sent = inv.status === 'sent'
  const paid = inv.status === 'paid'
  const voided = inv.status === 'void'
  return {
    edit: !paid && !voided, issue: draft, reissue: sent, markPaid: sent, delete: draft,
    // The hosted page 404s a draft, so a draft has no link to copy. A cancelled invoice's page only says it is cancelled.
    copyLink: !draft && !voided, pdf: true, readOnly: paid || voided,
    cancel: sent, cancelBlockedPaid: paid, duplicate: !draft, voided,
  }
}

// ── cancelling (voiding) ─────────────────────────────────────────────────────────────────────────
export const VOID_REASONS: ReadonlyArray<readonly [InvoiceVoidReason, string]> = [
  ['mistake', 'Raised by mistake'],
  ['client-cancelled', 'Client cancelled'],
  ['replaced', 'Replaced by another invoice'],
  ['other', 'Other'],
]
export const voidReasonLabel = (r: InvoiceVoidReason): string => VOID_REASONS.find(x => x[0] === r)?.[1] ?? r
export const VOID_NOTE_MAX = 200

export interface VoidForm { reason: InvoiceVoidReason | ''; note: string }

/** Reason is required; the note is optional except for Other. Returns the payload, or why not. */
export function buildVoid(f: VoidForm): { ok: true; input: VoidInvoiceInput } | { ok: false; hint: string } {
  if (!f.reason) return { ok: false, hint: 'Choose a reason to continue.' }
  const note = f.note.trim()
  if (f.reason === 'other' && !note) return { ok: false, hint: 'Add a note to explain why. It is required when the reason is Other.' }
  if (note.length > VOID_NOTE_MAX) return { ok: false, hint: `Keep the note to ${VOID_NOTE_MAX} characters.` }
  return { ok: true, input: { reason: f.reason, ...(note ? { note } : {}) } }
}

/** "Cancelled on 12 Oct 2026 by Ryan: Raised by mistake (note)". */
export function voidSummary(v: NonNullable<InvoiceDto['voided']>, by: string): string {
  return `Cancelled on ${fmtDay(v.voidedAt)} by ${by}: ${voidReasonLabel(v.reason)}${v.note ? ` (${v.note})` : ''}`
}

export const needsRefund = (inv: Pick<InvoiceDto, 'refundDue'>): boolean => !!inv.refundDue && !inv.refundDue.acknowledgedAt

/** Card payment was asked for, the invoice is out, and no card link came back: the failure states.D case. */
export const cardLinkMissing = (inv: Pick<InvoiceDto, 'status' | 'offerCardPayment' | 'paymentLinkUrl'>): boolean => inv.status === 'sent' && inv.offerCardPayment && !inv.paymentLinkUrl

export function cardChip(inv: Pick<InvoiceDto, 'status' | 'offerCardPayment' | 'paymentLinkUrl' | 'paymentLinkIsAutomatic'>): { label: string; tone: 'ok' | 'warn' | '' } {
  if (inv.status === 'draft') return { label: inv.offerCardPayment ? 'Created on issue' : 'Not offered', tone: '' }
  if (inv.paymentLinkUrl) return { label: 'Link active', tone: 'ok' }
  return inv.offerCardPayment ? { label: 'Link failed', tone: 'warn' } : { label: 'Not offered', tone: '' }
}

// ── list tiles ───────────────────────────────────────────────────────────────────────────────────
export interface TileFacts {
  outstanding: { exCents: number; incCents: number; count: number }
  overdue: { exCents: number; count: number; worst: { name: string; days: number } | null }
  paidThisMonth: { exCents: number; incCents: number; count: number }
  drafts: { exCents: number; count: number }
}

/**
 * The headline figures are the server's ex-GST summary. The inc-GST companions and the counts come from the
 * list the page already holds, so the tile can say "$22,500" with "$24,750 inc GST" beneath it.
 */
export function tileFacts(
  all: readonly InvoiceDto[],
  tiles: { outstandingCents: number; overdueCents: number; paidThisMonthCents: number; draftCount: number; draftCents: number },
  today: string,
): TileFacts {
  const list = withoutTest(all)
  const sent = list.filter(i => i.status === 'sent')
  const late = sent.filter(i => i.overdue)
  const month = today.slice(0, 7)
  const paid = list.filter(i => i.status === 'paid' && (i.payment?.paidAt ?? '').slice(0, 7) === month)
  let worst: TileFacts['overdue']['worst'] = null
  for (const i of late) {
    const days = Math.max(1, daysBetween(i.dueDate, today))
    if (!worst || days > worst.days) worst = { name: i.clientName, days }
  }
  return {
    outstanding: { exCents: tiles.outstandingCents, incCents: sent.reduce((n, i) => n + i.totalCents, 0), count: sent.length },
    overdue: { exCents: tiles.overdueCents, count: late.length, worst },
    paidThisMonth: { exCents: tiles.paidThisMonthCents, incCents: paid.reduce((n, i) => n + (i.payment?.amountCents ?? 0), 0), count: paid.length },
    drafts: { exCents: tiles.draftCents, count: tiles.draftCount },
  }
}

// ── billing details ──────────────────────────────────────────────────────────────────────────────
export interface BillingForm { clientName: string; contactName: string; email: string; abn: string; address: string }

export function validateBilling(f: BillingForm): Partial<Record<keyof BillingForm, string>> {
  const e: Partial<Record<keyof BillingForm, string>> = {}
  if (!f.clientName.trim()) e.clientName = 'Enter the name to print on the invoice'
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'That is not a valid email address'
  const abn = f.abn.trim()
  if (abn && !/^[\d\s]+$/.test(abn)) e.abn = 'An ABN contains only digits'
  else if (abn && abn.replace(/\s/g, '').length !== 11) e.abn = 'An ABN is 11 digits'
  return e
}

/** Details the invoice needs that the customer's billing client does not have yet (states E). */
export function missingBilling(c: { billing: { email?: string; abn?: string; address?: string } } | undefined): string[] {
  if (!c) return []
  const out: string[] = []
  if (!c.billing.email?.trim()) out.push('an email')
  if (!c.billing.abn?.trim()) out.push('an ABN')
  if (!c.billing.address?.trim()) out.push('an address')
  return out
}

// ── activity ─────────────────────────────────────────────────────────────────────────────────────
export interface ActivityItem { label: string; when: string; note: string; done: boolean; /** Extra lines under the note. */ lines?: string[]; tone?: 'bad' | 'warn' }

/** What happened to the card link when an invoice was cancelled, in words. */
export function linkOutcome(linkDeactivated: boolean | null, paymentLinkUrl?: string): string {
  if (linkDeactivated === true) return 'Card link switched off'
  if (linkDeactivated === false) return 'Card link was not switched off. It must be switched off in Stripe.'
  // null with a link on the invoice is a hand-pasted link: the API never switches those off.
  if (paymentLinkUrl) return 'Pasted card link is still active. Switch it off in your payment provider.'
  return 'No card link to switch off'
}

export function activityItems(
  inv: Pick<InvoiceDto, 'createdAt' | 'sentAt' | 'issuedCount' | 'status' | 'payment'> & Partial<Pick<InvoiceDto, 'voided' | 'refundDue' | 'paymentLinkUrl' | 'source' | 'external' | 'issueDate'>> | null,
  nameOf: (id: string) => string = id => id,
): ActivityItem[] {
  if (!inv) return [{ label: 'Created', when: '', note: 'Not saved yet', done: false }, { label: 'Issued', when: '', note: 'Not yet', done: false }, { label: 'Paid', when: '', note: 'Not yet', done: false }]
  const ext = inv.source === 'external' ? inv.external : null
  if (ext) {
    // Recorded from another system: it was issued there, so the steps are the record, its issue date and its payment.
    const out: ActivityItem[] = [
      { label: 'Recorded externally', when: fmtDay(ext.recordedAt), note: ext.recordedBy, done: true },
      { label: 'Issued', when: fmtDay(inv.issueDate), note: 'outside SalesOS', done: true },
    ]
    if (inv.status === 'void' && inv.voided) {
      const v = inv.voided
      out.push({ label: 'Cancelled', when: fmtDay(v.voidedAt), note: nameOf(v.voidedBy), done: true, tone: 'bad', lines: [`Reason: ${voidReasonLabel(v.reason)}`, ...(v.note ? [`Note: ${v.note}`] : [])] })
    } else {
      out.push({ label: 'Paid', when: inv.payment ? fmtDay(inv.payment.paidAt) : '', note: inv.payment ? METHOD_LABELS[inv.payment.method] : 'Not yet', done: !!inv.payment })
    }
    return out
  }
  const issued = inv.status !== 'draft'
  const issuedItem: ActivityItem = {
    label: issued && inv.issuedCount > 1 ? `Issued, reissued ${inv.issuedCount - 1} time${inv.issuedCount === 2 ? '' : 's'}` : 'Issued',
    when: issued ? fmtDay(inv.sentAt) : '', note: issued ? (inv.issuedCount > 1 ? 'latest issue' : 'first issue') : 'Not yet', done: issued,
  }
  const created: ActivityItem = { label: 'Created', when: fmtDay(inv.createdAt), note: '', done: true }
  if (inv.status === 'void' && inv.voided) {
    const v = inv.voided
    const out: ActivityItem[] = [created, issuedItem, {
      label: 'Cancelled', when: fmtDay(v.voidedAt), note: nameOf(v.voidedBy), done: true, tone: 'bad',
      lines: [`Reason: ${voidReasonLabel(v.reason)}`, ...(v.note ? [`Note: ${v.note}`] : []), linkOutcome(v.linkDeactivated, inv.paymentLinkUrl)],
    }]
    if (inv.refundDue) {
      const r = inv.refundDue
      out.push({ label: 'Payment received after cancelling', when: fmtDay(r.receivedAt), note: `${formatCents(r.amountCents)}${r.reference ? ` · ${r.reference}` : ''} · flagged for refund`, done: true, tone: 'warn' })
      if (r.acknowledgedAt) out.push({ label: 'Refund confirmed', when: fmtDay(r.acknowledgedAt), note: r.acknowledgedBy ? nameOf(r.acknowledgedBy) : '', done: true })
    }
    return out
  }
  return [
    created,
    issuedItem,
    {
      label: 'Paid', when: inv.payment ? fmtDay(inv.payment.paidAt) : '',
      note: inv.payment ? METHOD_LABELS[inv.payment.method] : 'Not yet', done: !!inv.payment,
    },
  ]
}

// ── settings ─────────────────────────────────────────────────────────────────────────────────────
export type SettingsErrors = Partial<Record<'name' | 'email' | 'abn' | 'bsb', string>>

/** The same checks the server makes on PUT /invoices/settings, so a person hears about them before the round trip. */
export function validateSettings(s: { name: string; abn: string; email: string; bank: { bsb: string } }): SettingsErrors {
  const e: SettingsErrors = {}
  if (!s.name.trim()) e.name = 'Business name is required'
  if (s.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim())) e.email = 'Business email is not a valid address'
  const abn = s.abn.trim()
  if (abn && !/^[\d\s]+$/.test(abn)) e.abn = 'An ABN contains only digits'
  else if (abn && abn.replace(/\s/g, '').length !== 11) e.abn = 'An ABN is 11 digits'
  const bsb = s.bank.bsb.trim()
  if (bsb && bsb.replace(/[\s-]/g, '').length !== 6) e.bsb = 'A BSB is 6 digits'
  return e
}

// ── what cancelling will do, in plain words ──────────────────────────────────────────────────────
export interface Consequence { icon: string; text: string }

/** The consequences list of the cancel dialog, built from the invoice. `milestone` is the milestone's label, when known. */
export function cancelConsequences(
  inv: Pick<InvoiceDto, 'paymentLinkUrl' | 'paymentLinkIsAutomatic' | 'subtotalCents' | 'totalCents' | 'overdue' | 'milestoneId'> & Partial<Pick<InvoiceDto, 'source' | 'status'>>,
  milestone: string,
): Consequence[] {
  const out: Consequence[] = []
  if (inv.source === 'external') {
    // Only the record is withdrawn: nothing changes in the other system, and there is no client page or card link.
    const paid = inv.status === 'paid'
    out.push({ icon: 'chart', text: `${formatCents(inv.subtotalCents)} ex GST (${formatCents(inv.totalCents)} with GST) leaves Invoiced${paid ? ' and Collected' : ', Outstanding'}${!paid && inv.overdue ? ', Overdue' : ''}.` })
    if (inv.milestoneId) out.push({ icon: 'flag', text: `${milestone ? `Milestone “${milestone}”` : 'The milestone'} goes back to Planned, and the billing progress on the deal drops.` })
    out.push({ icon: 'refresh', text: 'The reference is freed, so it can be recorded again. Nothing changes in the other system.' })
    return out
  }
  if (inv.paymentLinkUrl) {
    out.push(inv.paymentLinkIsAutomatic
      ? { icon: 'dollar', text: 'The card payment link stops working. It is switched off, so the client can no longer pay this invoice by card.' }
      : { icon: 'dollar', text: 'The card payment link was pasted in by hand, so it cannot be switched off here. Switch it off in your payment provider, or the client could still pay it.' })
  }
  out.push({ icon: 'file', text: 'The client’s invoice page shows “This invoice has been cancelled” with no pay button, and the PDF is watermarked CANCELLED.' })
  out.push({ icon: 'chart', text: `${formatCents(inv.subtotalCents)} ex GST (${formatCents(inv.totalCents)} with GST) leaves Outstanding${inv.overdue ? ', Overdue' : ''} and Invoiced.` })
  if (inv.milestoneId) out.push({ icon: 'flag', text: `${milestone ? `Milestone “${milestone}”` : 'The milestone'} goes back to Planned, and the billing progress on the deal drops.` })
  return out
}

// ── test invoices: marking and deleting ──────────────────────────────────────────────────────────
export const TEST_REASON_MAX = 200
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/

/** The reason is trimmed, 1 to 200 characters of plain text with no control characters. */
export function buildMarkTest(reason: string): { ok: true; input: MarkTestInput } | { ok: false; hint: string } {
  const r = reason.trim()
  if (!r) return { ok: false, hint: 'Add a reason to continue. It is kept with the invoice.' }
  if (r.length > TEST_REASON_MAX) return { ok: false, hint: `Keep the reason to ${TEST_REASON_MAX} characters.` }
  if (CONTROL.test(r)) return { ok: false, hint: 'Use plain text only: remove line breaks and other control characters.' }
  return { ok: true, input: { reason: r } }
}

/** What the person typed must equal the invoice number exactly. Pasting is fine; surrounding spaces and a different case are not. */
export const deleteNumberMatches = (typed: string, invoiceNumber: string): boolean => typed === invoiceNumber

export interface TestMenu { mark: boolean; unmark: boolean; deletePermanently: boolean }
/** Admins of Ardorio may mark and unmark in any status. Only a super user may delete, and only a test invoice. */
export function testMenu(inv: MaybeTest, isSuper: boolean): TestMenu {
  const t = isTest(inv)
  return { mark: !t, unmark: t, deletePermanently: t && isSuper }
}

export const MARK_TEST_PAID_NOTE = 'This invoice is marked paid. Marking it as test removes that payment from your revenue figures.'

export const markTestConsequences: ReadonlyArray<Consequence> = [
  { icon: 'chart', text: 'It disappears from totals, revenue, lists and exports.' },
  { icon: 'file', text: 'It keeps its invoice number.' },
  { icon: 'refresh', text: 'You can unmark it later and it will count again.' },
]

export const deleteConsequences = (inv: Pick<InvoiceDto, 'paymentLinkUrl'>): Consequence[] => [
  { icon: 'alert', text: 'This cannot be undone. The invoice and its history are removed.' },
  { icon: 'file', text: 'The invoice number will be missing from your invoice sequence.' },
  ...(inv.paymentLinkUrl ? [{ icon: 'dollar', text: 'The payment link, if there is one, is switched off.' }] : [{ icon: 'dollar', text: 'The payment link, if there is one, is switched off. This invoice has none.' }]),
  { icon: 'clock', text: 'A record of the deletion is kept.' },
]
