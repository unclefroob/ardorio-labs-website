import { salesFetch } from './http'
import type { RosterioProvisionRequest, RosterioProvisionResponse, RosterioRetryResponse, RosterioStatusResponse } from './contract'

/** Rosterio CRM link. The response to `rosterioProvision` carries a one-time password: callers keep it in component state only. */
export const rosterioStatus = (signal?: AbortSignal) => salesFetch<RosterioStatusResponse>('/rosterio/status', { signal })
export const rosterioProvision = (req: RosterioProvisionRequest) =>
  salesFetch<RosterioProvisionResponse>('/rosterio/provision', { method: 'POST', body: req })
export const rosterioRetry = () => salesFetch<RosterioRetryResponse>('/rosterio/sync/retry', { method: 'POST', body: {} })
