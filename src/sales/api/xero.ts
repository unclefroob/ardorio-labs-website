import type { InvoiceDto, RosterioInvoice, XeroAccountsResponse, XeroContactRef, XeroSettings, XeroStatus } from './contract'
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
/** Search Xero contacts by name (at most 20). */
export const xeroContacts = (q: string, signal?: AbortSignal) => salesFetch<{ contacts: XeroContactRef[] }>(`/xero/contacts?q=${encodeURIComponent(q)}`, { signal })
/** Choose the Xero contact for a Stripe customer. An empty contactId clears it. */
export const xeroSaveStripeContact = (customerId: string, contactId: string) => salesFetch<{ contact: XeroContactRef }>('/xero/stripe-contact', { method: 'PUT', body: { customerId, contactId } })
/** Send a Rosterio Stripe invoice to Xero, or Retry: ignores automatic sending and the start date. A refusal is a 409 with the reason. */
export const sendStripeInvoiceToXero = (id: string) => salesFetch<RosterioInvoice>(`/xero/stripe-invoices/${encodeURIComponent(id)}/sync`, { method: 'POST', body: {} })
