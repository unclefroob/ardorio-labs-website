import type { InvoiceDto, XeroAccountsResponse, XeroSettings, XeroStatus } from './contract'
import { salesFetch } from './http'

/** Xero for invoicing. Every call is limited by the server to admins of business `ard` (or super). */
export const xeroStatus = (signal?: AbortSignal) => salesFetch<XeroStatus>('/xero/status', { signal })
/** The address to send the browser to; Xero returns to the server, which sends the browser back to Settings > Invoicing. */
export const xeroConnect = () => salesFetch<{ url: string }>('/xero/connect', { method: 'POST', body: {} })
export const xeroDisconnect = () => salesFetch<{ ok: true }>('/xero/disconnect', { method: 'POST', body: {} })
export const xeroSaveSettings = (patch: Partial<XeroSettings>) => salesFetch<{ settings: XeroSettings }>('/xero/settings', { method: 'PUT', body: patch })
export const xeroAccounts = (signal?: AbortSignal) => salesFetch<XeroAccountsResponse>('/xero/accounts', { signal })
/** Send to Xero, or Retry: ignores automatic sending and the start date. A refusal (a draft, no sales account yet) is a 409 with the reason. */
export const sendInvoiceToXero = (id: string) => salesFetch<InvoiceDto>(`/invoices/${encodeURIComponent(id)}/xero/sync`, { method: 'POST', body: {} })
