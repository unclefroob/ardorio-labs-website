import { salesFetch } from './http'
import type {
  RosterioAccountsResponse, RosterioLinkRequest, RosterioLinkResponse, RosterioProvisionRequest, RosterioProvisionResponse, RosterioRetryResponse,
  RosterioBilling, RosterioInvoicesResponse, RosterioStatusResponse, RosterioUnlinkRequest, StartRosterioBillingRequest, StartRosterioBillingResponse,
} from './contract'

/** Rosterio CRM link. The response to `rosterioProvision` carries a one-time password: callers keep it in component state only. */
export const rosterioStatus = (signal?: AbortSignal) => salesFetch<RosterioStatusResponse>('/rosterio/status', { signal })
export const rosterioProvision = (req: RosterioProvisionRequest) =>
  salesFetch<RosterioProvisionResponse>('/rosterio/provision', { method: 'POST', body: req })
export const rosterioRetry = () => salesFetch<RosterioRetryResponse>('/rosterio/sync/retry', { method: 'POST', body: {} })
export const rosterioAccounts = (signal?: AbortSignal) => salesFetch<RosterioAccountsResponse>('/rosterio/accounts', { signal })
export const rosterioLink = (req: RosterioLinkRequest) => salesFetch<RosterioLinkResponse>('/rosterio/link', { method: 'POST', body: req })
export const rosterioUnlink = (req: RosterioUnlinkRequest) => salesFetch<unknown>('/rosterio/unlink', { method: 'POST', body: req })

/** Rosterio's invoices from Stripe (who has paid), for the whole business or one company. Rosterio admins only. */
export const rosterioInvoices = (q: { companyId?: string } = {}, signal?: AbortSignal) =>
  salesFetch<RosterioInvoicesResponse>('/rosterio/invoices' + (q.companyId ? `?companyId=${encodeURIComponent(q.companyId)}` : ''), { signal })
export const rosterioInvoicesSync = () => salesFetch<{ invoices: number; syncedAt: string | null; error: string | null }>('/rosterio/invoices/sync', { method: 'POST', body: {} })

/** A managed Rosterio account's Stripe billing (Rosterio runs it; this asks). Rosterio admins only. */
export const rosterioBilling = (companyId: string, signal?: AbortSignal) =>
  salesFetch<RosterioBilling>(`/rosterio/billing?companyId=${encodeURIComponent(companyId)}`, { signal })
export const rosterioBillingStart = (req: StartRosterioBillingRequest) =>
  salesFetch<StartRosterioBillingResponse>('/rosterio/billing/start', { method: 'POST', body: req })
export const rosterioBillingStop = (companyId: string) =>
  salesFetch<{ billing: RosterioBilling }>('/rosterio/billing/stop', { method: 'POST', body: { companyId } })
export const rosterioCardLink = (companyId: string) =>
  salesFetch<{ billing: RosterioBilling; cardEmailSent: boolean }>('/rosterio/billing/card-link', { method: 'POST', body: { companyId } })
