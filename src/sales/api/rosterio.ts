import { salesFetch } from './http'
import type {
  RosterioAccountDetail, RosterioAccountsResponse, RosterioLinkRequest, RosterioLinkResponse, RosterioProvisionRequest, RosterioProvisionResponse, RosterioRetryResponse,
  RosterioMatchesRequest, RosterioMatchesResponse, RosterioRefreshRequest, RosterioRefreshResponse,
  RosterioBilling, RosterioInvoicesResponse, RosterioStatusResponse, RosterioUnlinkRequest, StartRosterioBillingRequest, StartRosterioBillingResponse,
} from './contract'

/** Rosterio CRM link. The response to `rosterioProvision` carries a one-time password: callers keep it in component state only. */
export const rosterioStatus = (signal?: AbortSignal) => salesFetch<RosterioStatusResponse>('/rosterio/status', { signal })
export const rosterioProvision = (req: RosterioProvisionRequest) =>
  salesFetch<RosterioProvisionResponse>('/rosterio/provision', { method: 'POST', body: req })
/** Read-only: is there already a Rosterio account for this name or admin email? */
export const rosterioMatches = (req: RosterioMatchesRequest) =>
  salesFetch<RosterioMatchesResponse>('/rosterio/matches', { method: 'POST', body: req })
/** Refreshes the company's link snapshot from the live account. Never changes the deal, never unlinks. */
export const rosterioRefresh = (req: RosterioRefreshRequest, signal?: AbortSignal) =>
  salesFetch<RosterioRefreshResponse>('/rosterio/refresh', { method: 'POST', body: req, signal })
export const rosterioRetry = () => salesFetch<RosterioRetryResponse>('/rosterio/sync/retry', { method: 'POST', body: {} })
export const rosterioAccounts = (signal?: AbortSignal) => salesFetch<RosterioAccountsResponse>('/rosterio/accounts', { signal })
export const rosterioLink = (req: RosterioLinkRequest) => salesFetch<RosterioLinkResponse>('/rosterio/link', { method: 'POST', body: req })
export const rosterioUnlink = (req: RosterioUnlinkRequest) => salesFetch<unknown>('/rosterio/unlink', { method: 'POST', body: req })

/** One Rosterio account as Rosterio has it, read live, for the account page. Rosterio admins only. */
export const rosterioAccount = (accountId: string, signal?: AbortSignal) =>
  salesFetch<RosterioAccountDetail>(`/rosterio/accounts/${encodeURIComponent(accountId)}`, { signal })

/** Rosterio's invoices from Stripe (who has paid), for the whole business, one company or one account. Rosterio admins only. */
export const rosterioInvoices = (q: { companyId?: string; accountId?: string } = {}, signal?: AbortSignal) =>
  salesFetch<RosterioInvoicesResponse>('/rosterio/invoices' + (q.accountId ? `?accountId=${encodeURIComponent(q.accountId)}` : q.companyId ? `?companyId=${encodeURIComponent(q.companyId)}` : ''), { signal })
export const rosterioInvoicesSync = () => salesFetch<{ invoices: number; syncedAt: string | null; error: string | null }>('/rosterio/invoices/sync', { method: 'POST', body: {} })

/** A Rosterio account named by its company in SalesOS or by its own id: exactly one of the two. */
export type BillingRef = { companyId: string } | { accountId: string }

/** A managed Rosterio account's Stripe billing (Rosterio runs it; this asks). Rosterio admins only. */
export const rosterioBilling = (ref: BillingRef, signal?: AbortSignal) =>
  salesFetch<RosterioBilling>(`/rosterio/billing?${'accountId' in ref ? `accountId=${encodeURIComponent(ref.accountId)}` : `companyId=${encodeURIComponent(ref.companyId)}`}`, { signal })
export const rosterioBillingStart = (req: StartRosterioBillingRequest) =>
  salesFetch<StartRosterioBillingResponse>('/rosterio/billing/start', { method: 'POST', body: req })
export const rosterioBillingStop = (ref: BillingRef) =>
  salesFetch<{ billing: RosterioBilling }>('/rosterio/billing/stop', { method: 'POST', body: ref })
export const rosterioCardLink = (ref: BillingRef) =>
  salesFetch<{ billing: RosterioBilling; cardEmailSent: boolean }>('/rosterio/billing/card-link', { method: 'POST', body: ref })
