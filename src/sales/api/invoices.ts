import type {
  BillingClient, BillingClientInput, InvoiceDto, InvoiceInput, InvoiceListResponse, InvoiceSettings, InvoiceStatus, InvoiceSummary, MarkPaidInput,
} from './contract'
import { SalesHttpError, SalesNetworkError, salesBlob, salesFetch } from './http'

/** Every call is under /sales/invoices and limited by the server to admins of business `ard` (or super). */
export type InvoiceListFilter = { status?: InvoiceStatus | 'overdue'; companyId?: string; dealId?: string }

function qs(f: InvoiceListFilter): string {
  const p = new URLSearchParams()
  if (f.status) p.set('status', f.status)
  if (f.companyId) p.set('companyId', f.companyId)
  if (f.dealId) p.set('dealId', f.dealId)
  const s = p.toString()
  return s ? `?${s}` : ''
}

const enc = encodeURIComponent

export const listInvoices = (f: InvoiceListFilter = {}, signal?: AbortSignal) => salesFetch<InvoiceListResponse>(`/invoices${qs(f)}`, { signal })
export const invoiceSummary = (signal?: AbortSignal) => salesFetch<InvoiceSummary>('/invoices/summary', { signal })
export const getInvoice = (id: string, signal?: AbortSignal) => salesFetch<InvoiceDto>(`/invoices/${enc(id)}`, { signal })
export const createInvoice = (input: InvoiceInput) => salesFetch<InvoiceDto>('/invoices', { method: 'POST', body: input })
export const updateInvoice = (id: string, input: InvoiceInput) => salesFetch<InvoiceDto>(`/invoices/${enc(id)}`, { method: 'PUT', body: input })
export const deleteInvoice = (id: string) => salesFetch<unknown>(`/invoices/${enc(id)}`, { method: 'DELETE' })
export const issueInvoice = (id: string) => salesFetch<InvoiceDto>(`/invoices/${enc(id)}/issue`, { method: 'POST', body: {} })
export const markInvoicePaid = (id: string, input: MarkPaidInput) => salesFetch<InvoiceDto>(`/invoices/${enc(id)}/mark-paid`, { method: 'POST', body: input })
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

export type InvoiceErrorKind = 'denied' | 'not-configured' | 'card-link' | 'not-found' | 'conflict' | 'validation' | 'network' | 'other'

/** Web error codes mapped to something a person can act on. `action` says which call failed, so a 502 on issue reads as the card link problem. */
export function invoiceError(e: unknown, action?: 'issue' | 'save' | 'pay' | 'delete' | 'load' | 'download'): { kind: InvoiceErrorKind; message: string } {
  if (e instanceof SalesNetworkError) return { kind: 'network', message: 'Could not reach the server. Check your connection and try again.' }
  if (!(e instanceof SalesHttpError)) return { kind: 'other', message: e instanceof Error ? e.message : 'Something went wrong' }
  if (e.status === 403 || e.code === 'ROLE_REQUIRED' || e.code === 'NOT_A_MEMBER') {
    return { kind: 'denied', message: 'Invoices are limited to admins of the Ardorio business.' }
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
