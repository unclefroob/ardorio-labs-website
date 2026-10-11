import { salesFetch } from './http'
import type {
  RosterioAccountsResponse, RosterioLinkRequest, RosterioLinkResponse, RosterioProvisionRequest, RosterioProvisionResponse, RosterioRetryResponse,
  RosterioStatusResponse, RosterioUnlinkRequest,
} from './contract'

/** Rosterio CRM link. The response to `rosterioProvision` carries a one-time password: callers keep it in component state only. */
export const rosterioStatus = (signal?: AbortSignal) => salesFetch<RosterioStatusResponse>('/rosterio/status', { signal })
export const rosterioProvision = (req: RosterioProvisionRequest) =>
  salesFetch<RosterioProvisionResponse>('/rosterio/provision', { method: 'POST', body: req })
export const rosterioRetry = () => salesFetch<RosterioRetryResponse>('/rosterio/sync/retry', { method: 'POST', body: {} })
export const rosterioAccounts = (signal?: AbortSignal) => salesFetch<RosterioAccountsResponse>('/rosterio/accounts', { signal })
export const rosterioLink = (req: RosterioLinkRequest) => salesFetch<RosterioLinkResponse>('/rosterio/link', { method: 'POST', body: req })
export const rosterioUnlink = (req: RosterioUnlinkRequest) => salesFetch<unknown>('/rosterio/unlink', { method: 'POST', body: req })
