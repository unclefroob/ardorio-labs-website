import { salesFetch } from './http'
import type { PhoneStatusResponse, RevealPhoneRequest, RevealPhoneResponse } from './contract'

/** Free: reports whether a provider is set up on the server and this month's allowance. Never carries a key. */
export const phoneStatusApi = (signal?: AbortSignal) => salesFetch<PhoneStatusResponse>('/phone/status', { signal })

/** Spends a lookup when the vendor finds a number. Runs only from an explicit click. */
export const revealPhoneApi = (req: RevealPhoneRequest, signal?: AbortSignal) =>
  salesFetch<RevealPhoneResponse>('/phone/reveal', { method: 'POST', body: req, signal })
