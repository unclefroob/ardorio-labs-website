import type { ExternalInvoiceInput, ExternalInvoiceSource, InvoiceDto, InvoiceExternalInfo, InvoicePaymentMethod } from '../api/contract'
import { fmtDay, isDay } from './invoices'
import { centsToInput, formatCentsTile, parseCents } from './money'

// ── External invoices: a record of an invoice or payment made outside SalesOS (already in Xero, another system, or a
// bank transfer with no invoice). No SalesOS number, PDF, card link or pay page. It counts as Invoiced on its issue
// date and Collected on its paid date. Admins of Ardorio only; the server checks the same limits as below.

export const EXTERNAL_SOURCES: readonly ExternalInvoiceSource[] = ['xero', 'other-system', 'bank-transfer-no-invoice']
export const EXTERNAL_SOURCE_LABEL: Record<ExternalInvoiceSource, string> = {
  'xero': 'Xero', 'other-system': 'Other system', 'bank-transfer-no-invoice': 'Bank transfer without invoice',
}

/** The API's limits (src/services/sales/billing/externalInvoices.ts). */
export const EXTERNAL_REFERENCE_MAX = 60
export const EXTERNAL_NOTES_MAX = 500
export const EXTERNAL_MAX_SUBTOTAL_CENTS = 100_000_000
export const EXTERNAL_MAX_PAID_CENTS = 2 * EXTERNAL_MAX_SUBTOTAL_CENTS

export const EXTERNAL_CHIP = 'Recorded externally'
export const EXTERNAL_DENIED_TITLE = 'Ask an admin to record external invoices'
export const EXTERNAL_DENIED_BODY = 'Only Ardorio admins can add invoices or payments from other systems, because they change revenue figures for past months. You can still record a won deal.'
export const REFERENCE_REQUIRED = 'Add the reference from the other system, for example Xero INV-0457.'

export const isExternal = (inv: Pick<InvoiceDto, 'source'> & Partial<Pick<InvoiceDto, 'external'>>): boolean => inv.source === 'external'

/**
 * The reference as a person reads it: "Xero INV-0457". A Xero reference typed without the word gets it in front, so it
 * is never mistaken for a SalesOS number; anything else is shown as typed.
 */
export function externalLabel(e: Pick<InvoiceExternalInfo, 'source' | 'reference'>): string {
  const ref = e.reference.trim()
  if (e.source === 'xero' && !/^xero\b/i.test(ref)) return `Xero ${ref}`
  return ref
}

/** What to call an invoice anywhere it is named: its external reference when it was recorded externally, never the hidden number. */
export function invoiceRef(inv: Pick<InvoiceDto, 'invoiceNumber' | 'source'> & Partial<Pick<InvoiceDto, 'external'>>): string {
  return inv.source === 'external' && inv.external ? externalLabel(inv.external) : inv.invoiceNumber
}

/** What a person types to confirm deleting a test invoice: the reference as stored for an external one (the server accepts it), else the number. */
export function confirmText(inv: Pick<InvoiceDto, 'invoiceNumber' | 'source'> & Partial<Pick<InvoiceDto, 'external'>>): string {
  return inv.source === 'external' && inv.external?.reference ? inv.external.reference : inv.invoiceNumber
}

// ── the form ─────────────────────────────────────────────────────────────────────────────────────
export interface ExternalForm {
  dealId: string
  milestoneId: string
  source: ExternalInvoiceSource
  reference: string
  issueDate: string
  /** Ex GST, dollars and cents as typed. */
  amount: string
  gst: string
  /** GST follows 10% of the amount until it is typed over. */
  gstEdited: boolean
  paid: boolean
  paidOn: string
  method: InvoicePaymentMethod
  /** Inc GST. Follows the total until it is typed over. */
  paidAmount: string
  paidAmountEdited: boolean
  notes: string
}

export type ExternalField = 'dealId' | 'reference' | 'issueDate' | 'amount' | 'gst' | 'paidOn' | 'paidAmount' | 'notes'
export type ExternalErrors = Partial<Record<ExternalField, string>>

/** 10% of the amount, rounded half up to the cent. */
export const tenPercent = (cents: number): number => Math.floor((cents + 5) / 10)

export function blankExternal(today: string, d: { dealId?: string; milestoneId?: string } = {}): ExternalForm {
  return {
    dealId: d.dealId ?? '', milestoneId: d.milestoneId ?? '', source: 'xero', reference: '', issueDate: today, amount: '', gst: '', gstEdited: false,
    paid: false, paidOn: today, method: 'bank-transfer', paidAmount: '', paidAmountEdited: false, notes: '',
  }
}

export function formFromExternal(inv: InvoiceDto, today: string): ExternalForm {
  const p = inv.payment
  return {
    dealId: inv.dealId ?? '', milestoneId: inv.milestoneId ?? '',
    source: inv.external?.source ?? 'other-system', reference: inv.external?.reference ?? '',
    issueDate: inv.issueDate, amount: centsToInput(inv.subtotalCents), gst: centsToInput(inv.gstCents),
    gstEdited: inv.gstCents !== tenPercent(inv.subtotalCents),
    paid: !!p, paidOn: p?.paidAt.slice(0, 10) ?? today, method: p?.method ?? 'bank-transfer',
    paidAmount: centsToInput(p?.amountCents ?? inv.totalCents), paidAmountEdited: !!p && p.amountCents !== inv.totalCents, notes: inv.notes,
  }
}

/**
 * Apply a change the way the form does: GST tracks 10% of the amount until edited, and the amount paid tracks the total
 * until edited. Typing into GST or the amount paid marks it edited.
 */
export function patchExternal(f: ExternalForm, patch: Partial<ExternalForm>): ExternalForm {
  const next = { ...f, ...patch }
  if (patch.gst !== undefined) next.gstEdited = true
  if (patch.paidAmount !== undefined) next.paidAmountEdited = true
  const sub = parseCents(next.amount)
  if (!next.gstEdited) next.gst = sub === null ? '' : centsToInput(tenPercent(sub))
  if (!next.paidAmountEdited) {
    const gst = parseCents(next.gst)
    next.paidAmount = sub === null || gst === null ? '' : centsToInput(sub + gst)
  }
  return next
}

// eslint-disable-next-line no-control-regex
const ONE_LINE_UNSAFE = /[\u0000-\u001F\u007F]/
// eslint-disable-next-line no-control-regex
const MULTI_LINE_UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

/** The paid-before-issued message of the Guards board, with both dates written out. */
export const paidBeforeIssued = (paidOn: string, issueDate: string): string =>
  `The paid date (${fmtDay(paidOn)}) is before the issue date (${fmtDay(issueDate)}). Check the dates. For a deposit paid before invoicing, choose “Bank transfer without invoice” and use the day it arrived as the issue date.`

/**
 * Every problem at once, keyed by field, mirroring the API's rules (reference required, dates not in the future,
 * paid not before issued, GST from 0 up to the amount). `today` is the latest date allowed.
 */
export function checkExternal(f: ExternalForm, today: string): { ok: true; errors: ExternalErrors; subtotalCents: number; gstCents: number; paidAmountCents: number | null } | { ok: false; errors: ExternalErrors } {
  const e: ExternalErrors = {}
  if (!f.dealId) e.dealId = 'Choose the deal this money belongs to'
  const ref = f.reference.trim()
  if (!ref) e.reference = REFERENCE_REQUIRED
  else if (ref.length > EXTERNAL_REFERENCE_MAX) e.reference = `Keep the reference to ${EXTERNAL_REFERENCE_MAX} characters`
  else if (ONE_LINE_UNSAFE.test(ref)) e.reference = 'Use plain text only in the reference'
  if (!isDay(f.issueDate)) e.issueDate = 'Enter the date it was issued'
  else if (f.issueDate > today) e.issueDate = 'The issue date can’t be in the future. Use today or an earlier date.'
  const sub = parseCents(f.amount)
  if (sub === null || sub < 1) e.amount = 'Enter the amount ex GST in dollars and cents, like 80000.00'
  else if (sub > EXTERNAL_MAX_SUBTOTAL_CENTS) e.amount = `The amount ex GST is at most ${formatCentsTile(EXTERNAL_MAX_SUBTOTAL_CENTS)}`
  const gst = parseCents(f.gst)
  if (gst === null) e.gst = 'Enter the GST in dollars and cents, or 0 for zero-rated work'
  else if (sub !== null && gst > sub) e.gst = 'GST can’t be more than the amount ex GST'
  let paidCents: number | null = null
  if (f.paid) {
    if (!isDay(f.paidOn)) e.paidOn = 'Enter the date it was paid'
    else if (f.paidOn > today) e.paidOn = 'The paid date can’t be in the future. Use today or an earlier date.'
    else if (isDay(f.issueDate) && f.paidOn < f.issueDate) e.paidOn = paidBeforeIssued(f.paidOn, f.issueDate)
    paidCents = parseCents(f.paidAmount)
    if (paidCents === null || paidCents < 1) e.paidAmount = 'Enter the amount received, like 88000.00'
    else if (paidCents > EXTERNAL_MAX_PAID_CENTS) e.paidAmount = `The amount paid is at most ${formatCentsTile(EXTERNAL_MAX_PAID_CENTS)}`
  }
  if (f.notes.trim().length > EXTERNAL_NOTES_MAX) e.notes = `Keep the notes to ${EXTERNAL_NOTES_MAX} characters`
  else if (MULTI_LINE_UNSAFE.test(f.notes)) e.notes = 'Use plain text only in the notes'
  if (Object.keys(e).length) return { ok: false, errors: e }
  return { ok: true, errors: e, subtotalCents: sub as number, gstCents: gst as number, paidAmountCents: paidCents }
}

/** The request body. Only call with a form `checkExternal` accepted; `companyId` is the deal's company. */
export function buildExternal(f: ExternalForm, companyId: string, c: { subtotalCents: number; gstCents: number; paidAmountCents: number | null }): ExternalInvoiceInput {
  return {
    companyId, dealId: f.dealId, milestoneId: f.milestoneId || null,
    externalSource: f.source, externalReference: f.reference.trim(), issueDate: f.issueDate,
    subtotalCents: c.subtotalCents, gstCents: c.gstCents,
    paidOn: f.paid ? f.paidOn : null,
    paymentMethod: f.paid ? f.method : null,
    paidAmountCents: f.paid ? c.paidAmountCents : null,
    notes: f.notes.trim(),
  }
}

// ── the live preview ─────────────────────────────────────────────────────────────────────────────
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** "March 2026" for any day in it, '' for anything that is not a day. */
export const monthOf = (day: string): string => (isDay(day) ? `${FULL_MONTHS[+day.slice(5, 7) - 1]} ${day.slice(0, 4)}` : '')
/** "A$80,000", the way the boards write money. */
export const aud = (cents: number): string => `A${formatCentsTile(cents)}`

/**
 * "Adds A$80,000 to Invoiced in March 2026 and to Collected in April 2026." Ex GST, as every figure. Null until the
 * amount and the dates make sense.
 */
export function previewLine(f: Pick<ExternalForm, 'amount' | 'issueDate' | 'paid' | 'paidOn'>, today: string): string | null {
  const sub = parseCents(f.amount)
  if (sub === null || sub < 1 || !isDay(f.issueDate) || f.issueDate > today) return null
  const head = `Adds ${aud(sub)} to Invoiced in ${monthOf(f.issueDate)}`
  if (!f.paid) return `${head}. It counts as outstanding until it is paid.`
  if (!isDay(f.paidOn) || f.paidOn > today || f.paidOn < f.issueDate) return `${head}.`
  return `${head} and to Collected in ${monthOf(f.paidOn)}.`
}

/** The confirmation toast and banner text: "Xero INV-0457 recorded. A$80,000 added to Invoiced (March 2026) and Collected (April 2026)." */
export function recordedLine(inv: Pick<InvoiceDto, 'invoiceNumber' | 'source' | 'external' | 'subtotalCents' | 'issueDate' | 'payment'>): string {
  const head = `${invoiceRef(inv)} recorded. ${aud(inv.subtotalCents)} added to Invoiced (${monthOf(inv.issueDate)})`
  return inv.payment ? `${head} and Collected (${monthOf(inv.payment.paidAt.slice(0, 10))}).` : `${head}.`
}
