import type {
  BillingClient, BillingClientInput, DeleteTestInput, ExternalInvoiceInput, InvoiceDto, InvoiceInput, InvoiceListResponse, InvoiceSettings, InvoiceStatus, InvoiceSummary, MarkPaidInput, MarkTestInput, VoidInvoiceInput,
} from './contract'
import { SalesHttpError, SalesNetworkError, salesBlob, salesFetch } from './http'

/** Every call is under /sales/invoices and limited by the server to admins of business `ard` (or super). */
export type InvoiceListFilter = { status?: InvoiceStatus | 'overdue'; companyId?: string; dealId?: string; /** Test invoices are left out of every list unless this is true. */ includeTest?: boolean }

function qs(f: InvoiceListFilter): string {
  const p = new URLSearchParams()
  if (f.status) p.set('status', f.status)
  if (f.companyId) p.set('companyId', f.companyId)
  if (f.dealId) p.set('dealId', f.dealId)
  if (f.includeTest) p.set('includeTest', '1')
  const s = p.toString()
  return s ? `?${s}` : ''
}

const enc = encodeURIComponent

export const listInvoices = (f: InvoiceListFilter = {}, signal?: AbortSignal) => salesFetch<InvoiceListResponse>(`/invoices${qs(f)}`, { signal })
export const invoiceSummary = (signal?: AbortSignal) => salesFetch<InvoiceSummary>('/invoices/summary', { signal })
export const getInvoice = (id: string, signal?: AbortSignal) => salesFetch<InvoiceDto>(`/invoices/${enc(id)}`, { signal })
export const createInvoice = (input: InvoiceInput) => salesFetch<InvoiceDto>('/invoices', { method: 'POST', body: input })
export const updateInvoice = (id: string, input: InvoiceInput) => salesFetch<InvoiceDto>(`/invoices/${enc(id)}`, { method: 'PUT', body: input })
/** Record an invoice or payment made outside SalesOS. Admins of `ard` (or super) only. */
export const recordExternalInvoice = (input: ExternalInvoiceInput) => salesFetch<InvoiceDto>('/invoices/external', { method: 'POST', body: input })
/** Every field of an external, not cancelled invoice, under the same rules. */
export const updateExternalInvoice = (id: string, input: ExternalInvoiceInput) => salesFetch<InvoiceDto>(`/invoices/${enc(id)}/external`, { method: 'PUT', body: input })
export const deleteInvoice = (id: string) => salesFetch<unknown>(`/invoices/${enc(id)}`, { method: 'DELETE' })
export const issueInvoice = (id: string) => salesFetch<InvoiceDto>(`/invoices/${enc(id)}/issue`, { method: 'POST', body: {} })
export const markInvoicePaid = (id: string, input: MarkPaidInput) => salesFetch<InvoiceDto>(`/invoices/${enc(id)}/mark-paid`, { method: 'POST', body: input })
export const voidInvoice = (id: string, input: VoidInvoiceInput) => salesFetch<InvoiceDto>(`/invoices/${enc(id)}/void`, { method: 'POST', body: input })
export const duplicateInvoice = (id: string) => salesFetch<InvoiceDto>(`/invoices/${enc(id)}/duplicate`, { method: 'POST', body: {} })
export const acknowledgeRefund = (id: string) => salesFetch<InvoiceDto>(`/invoices/${enc(id)}/acknowledge-refund`, { method: 'POST', body: {} })
export const markTest = (id: string, input: MarkTestInput) => salesFetch<InvoiceDto>(`/invoices/${enc(id)}/mark-test`, { method: 'POST', body: input })
export const unmarkTest = (id: string) => salesFetch<InvoiceDto>(`/invoices/${enc(id)}/unmark-test`, { method: 'POST', body: {} })
/** Super users only, and only for an invoice marked as test. The server checks both. */
export const deleteTestInvoice = (id: string, input: DeleteTestInput) => salesFetch<{ deleted: true; invoiceNumber: string }>(`/invoices/${enc(id)}/permanent`, { method: 'DELETE', body: input })
/** Authenticated blob download: the PDF route needs the bearer token, so it cannot be a plain link. */
export const invoicePdf = (id: string) => salesBlob(`/invoices/${enc(id)}/pdf`)
export const invoicesCsv = () => salesBlob('/invoices/export.csv')

export const getInvoiceSettings = (signal?: AbortSignal) => salesFetch<InvoiceSettings>('/invoices/settings', { signal })
export const putInvoiceSettings = (s: Omit<InvoiceSettings, 'stripeConfigured'>) => salesFetch<InvoiceSettings>('/invoices/settings', { method: 'PUT', body: s })

export const listBillingClients = (signal?: AbortSignal) => salesFetch<{ clients: BillingClient[] }>('/invoices/clients', { signal })
export const createBillingClient = (input: BillingClientInput) => salesFetch<BillingClient>('/invoices/clients', { method: 'POST', body: input })
export const updateBillingClient = (slug: string, input: BillingClientInput) => salesFetch<BillingClient>(`/invoices/clients/${enc(slug)}`, { method: 'PUT', body: input })
export const linkBillingClient = (slug: string, companyId: string) => salesFetch<unknown>(`/invoices/clients/${enc(slug)}/link`, { method: 'POST', body: { companyId } })
export const unlinkBillingClient = (slug: string, companyId: string) => salesFetch<unknown>(`/invoices/clients/${enc(slug)}/link/${enc(companyId)}`, { method: 'DELETE' })

/** Save a blob the way the old admin page did. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

export type InvoiceErrorKind = 'paid' | 'already-void' | 'not-issued' | 'denied' | 'not-configured' | 'card-link' | 'not-found' | 'already-test' | 'not-test' | 'mismatch' | 'conflict' | 'validation' | 'network' | 'duplicate-reference' | 'not-external' | 'other'

/** Web error codes mapped to something a person can act on. `action` says which call failed, so a 502 on issue reads as the card link problem. */
export function invoiceError(e: unknown, action?: 'issue' | 'save' | 'pay' | 'delete' | 'load' | 'download' | 'cancel' | 'duplicate' | 'refund' | 'test' | 'external'): { kind: InvoiceErrorKind; message: string } {
  if (e instanceof SalesNetworkError) return { kind: 'network', message: 'Could not reach the server. Check your connection and try again.' }
  if (!(e instanceof SalesHttpError)) return { kind: 'other', message: e instanceof Error ? e.message : 'Something went wrong' }
  if (e.code === 'INVOICE_PAID') return { kind: 'paid', message: 'It was paid just now, nothing was cancelled.' }
  if (e.code === 'INVOICE_ALREADY_VOID') return { kind: 'already-void', message: 'This invoice is already cancelled.' }
  if (e.code === 'INVOICE_NOT_ISSUED') return { kind: 'not-issued', message: 'This invoice has not been issued, so there is nothing to cancel. Delete the draft instead.' }
  if (e.code === 'INVOICE_ALREADY_TEST') return { kind: 'already-test', message: 'This invoice is already marked as a test.' }
  if (e.code === 'INVOICE_NOT_TEST') return { kind: 'not-test', message: 'This invoice is not marked as a test, so it can’t be unmarked or permanently deleted.' }
  if (e.code === 'INVOICE_DELETING') return { kind: 'conflict', message: 'Another admin is deleting this invoice right now. Reload in a moment.' }
  if (e.code === 'REFUND_DUE_UNACKNOWLEDGED') return { kind: 'conflict', message: 'A card payment was received on this cancelled invoice and has not been marked as refunded. Acknowledge the refund first, then delete it.' }
  if (e.code === 'CONFIRMATION_MISMATCH') return { kind: 'mismatch', message: 'The invoice number you typed does not match this invoice.' }
  if (e.code === 'DUPLICATE_EXTERNAL_REFERENCE') return { kind: 'duplicate-reference', message: 'That reference is already recorded. Recording it again would count it twice.' }
  if (e.code === 'NOT_EXTERNAL') return { kind: 'not-external', message: 'Only an invoice recorded from outside SalesOS can be edited here.' }
  if (e.status === 403 || e.code === 'ROLE_REQUIRED' || e.code === 'NOT_A_MEMBER') {
    return { kind: 'denied', message: action === 'external' ? 'Ask an admin to record external invoices.' : 'Invoices are limited to admins of the Ardorio business.' }
  }
  if (e.code === 'NOT_CONFIGURED') return { kind: 'not-configured', message: 'Card payments are not set up on the server. Invoices can still be paid by bank transfer or PayID.' }
  if (e.code === 'UPSTREAM_ERROR' || (action === 'issue' && e.status === 502)) {
    return { kind: 'card-link', message: 'The card payment link could not be created. The client can still pay by transfer or PayID. Try again, or turn off card payment for this invoice.' }
  }
  if (e.status === 404 || e.code === 'NOT_FOUND') return { kind: 'not-found', message: 'That invoice or customer no longer exists.' }
  if (e.status === 409 || e.code === 'CONFLICT') return { kind: 'conflict', message: e.message || 'This invoice changed elsewhere. Reload and try again.' }
  if (e.status === 400 || e.code === 'VALIDATION') return { kind: 'validation', message: e.message }
  return { kind: 'other', message: e.message }
}

/** The id of the card link the server could not switch off, from a LINK_DEACTIVATION_FAILED error. */
export function linkFailureId(e: unknown): string | null {
  if (!(e instanceof SalesHttpError) || e.code !== 'LINK_DEACTIVATION_FAILED') return null
  const id = e.body?.details?.linkId
  return typeof id === 'string' ? id : ''
}

/** Where the reference is already recorded, from a DUPLICATE_EXTERNAL_REFERENCE error; null for any other error. */
export function duplicateReference(e: unknown): { invoiceId: string; dealId: string | null } | null {
  if (!(e instanceof SalesHttpError) || e.code !== 'DUPLICATE_EXTERNAL_REFERENCE') return null
  const d = e.body?.details
  return { invoiceId: typeof d?.invoiceId === 'string' ? d.invoiceId : '', dealId: typeof d?.dealId === 'string' && d.dealId ? d.dealId : null }
}

/** The form field a 400 VALIDATION names in its details, if any. */
export function errorField(e: unknown): string | null {
  if (!(e instanceof SalesHttpError) || e.code !== 'VALIDATION') return null
  const f = e.body?.details?.field
  return typeof f === 'string' ? f : null
}
