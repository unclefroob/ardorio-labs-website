import { useEffect, useSyncExternalStore } from 'react'
import { phoneStatusApi, revealPhoneApi } from '../api/phone'
import type { BusinessId, PhoneNumberFound, PhoneProviderId, PhoneStatusResponse, PhoneUsage, RevealPhoneResponse } from '../api/contract'
import { SalesHttpError, SalesNetworkError } from '../api/http'
import { S } from '../data/store'

/**
 * Mobile phone lookup. The status (is a vendor set up, what is left this month) is kept for the session only.
 * Lookup results are never kept anywhere: not here, not in the store, not in storage. They live in the modal
 * that asked for them and go with it.
 */

// ── Formatting ───────────────────────────────────────────────────────────────────────────────────

const digits = (s: string): string => s.replace(/\D/g, '')

/** Digits in international form without the plus: "0412 345 678" and "+61 412 345 678" both give "61412345678". */
export function phoneKey(raw: string): string {
  const d = digits(raw)
  if (raw.trim().startsWith('+')) return d
  if (d.startsWith('00')) return d.slice(2)
  if (d.startsWith('0')) return '61' + d.slice(1)
  return d
}

/**
 * A number as people write it in Australia. +61 4xx xxx xxx gives "0412 345 678"; +61 2/3/7/8 gives "(02) 1234 5678";
 * anything else is shown in international form with a space after the country code, or as given if it is not E.164.
 */
export function formatPhone(e164: string): string {
  const t = e164.trim()
  const d = digits(t)
  if (!/^\+\d{8,15}$/.test(t.replace(/[\s()-]/g, ''))) return t
  if (d.startsWith('61')) {
    const n = d.slice(2)
    if (/^4\d{8}$/.test(n)) return `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
    if (/^[2378]\d{8}$/.test(n)) return `(0${n[0]}) ${n.slice(1, 5)} ${n.slice(5)}`
  }
  const cc = d.startsWith('1') ? 1 : d.startsWith('64') ? 2 : d.startsWith('44') ? 2 : d.startsWith('61') ? 2 : 0
  return cc ? `+${d.slice(0, cc)} ${d.slice(cc)}` : `+${d}`
}

export const TYPE_LABEL: Record<PhoneNumberFound['type'], string> = { mobile: 'Mobile', other: 'Other', unknown: 'Unknown' }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** resetsOn is 'YYYY-MM-01' (UTC); shown as "1 Nov". Anything unparseable is shown as given. */
export function fmtResets(resetsOn: string): string {
  const d = new Date(`${resetsOn}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return resetsOn
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export function phoneLeft(u: PhoneUsage | undefined): number | null {
  return u ? Math.max(0, u.limit - u.used) : null
}

/** "Checked today", "Checked 1 day ago", "Checked 12 days ago". Unparseable or future dates give null. */
export function checkedLabel(iso: string | undefined, now: number = Date.now()): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t) || t > now + 60_000) return null
  const days = Math.floor((now - t) / 86_400_000)
  return days <= 0 ? 'Checked today' : days === 1 ? 'Checked 1 day ago' : `Checked ${days} days ago`
}

// ── Session status ───────────────────────────────────────────────────────────────────────────────

export type PhoneStatusState =
  | { s: 'loading' }
  | { s: 'error' }
  | { s: 'ok'; status: PhoneStatusResponse }

let cached: PhoneStatusResponse | undefined
let failed = false
let inflight: Promise<void> | null = null
let owner: string | null = null
let version = 0
const listeners = new Set<() => void>()

function emit(): void {
  version++
  for (const l of [...listeners]) l()
}

/** A different user in the same tab must never see the previous user's status. */
function guard(): void {
  const who = S.session?.userId || null
  if (owner !== who) {
    const had = !!cached || failed
    cached = undefined
    failed = false
    inflight = null
    owner = who
    if (had) emit()
  }
}

/** Whether a cached allowance has rolled over: resetsOn is 00:00 UTC on the 1st of next month. Unparseable dates never expire. */
export function phoneUsageExpired(u: PhoneUsage, now: number = Date.now()): boolean {
  const t = Date.parse(`${u.resetsOn}T00:00:00Z`)
  return !Number.isNaN(t) && now >= t
}

export function getPhoneStatus(): PhoneStatusResponse | undefined {
  guard()
  if (cached && phoneUsageExpired(cached.usage)) {
    cached = undefined
    emit()
  }
  return cached
}

const validStatus = (r: unknown): r is PhoneStatusResponse => {
  const x = r as Partial<PhoneStatusResponse> | null
  const u = x?.usage
  return !!x && typeof x.configured === 'boolean' && !!u && typeof u.used === 'number' && typeof u.limit === 'number' && typeof u.resetsOn === 'string'
}

/** Fetch the status once per session (shared by every caller). `force` refetches, for a stale answer after an error. */
export function loadPhoneStatus(opts: { force?: boolean } = {}): Promise<void> {
  guard()
  if (!opts.force && getPhoneStatus()) return Promise.resolve()
  if (inflight) return inflight
  const mine = owner
  const p: Promise<void> = phoneStatusApi()
    .then(r => {
      if (owner !== mine) return
      if (validStatus(r)) { cached = r; failed = false } else failed = true
    })
    .catch(() => { if (owner === mine) failed = true })
    .then(() => {
      if (inflight === p) inflight = null
      if (owner === mine) emit()
    })
  inflight = p
  return p
}

function setUsage(u: PhoneUsage): void {
  if (!cached) return
  if (cached.usage.used === u.used && cached.usage.limit === u.limit && cached.usage.resetsOn === u.resetsOn) return
  cached = { ...cached, usage: u }
  emit()
}

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The status, cached for the session. Loads on first use and never starts a lookup (the status call is free). */
export function usePhoneStatus(): PhoneStatusState {
  useSyncExternalStore(subscribe, () => version)
  guard()
  const state: PhoneStatusState = cached && !phoneUsageExpired(cached.usage) ? { s: 'ok', status: cached } : failed ? { s: 'error' } : { s: 'loading' }
  const idle = state.s === 'loading'
  useEffect(() => {
    if (idle) void loadPhoneStatus()
  }, [idle])
  return state
}

/** Forget everything. Call on sign-out. */
export function clearPhoneStatus(): void {
  cached = undefined
  failed = false
  inflight = null
  owner = null
  emit()
}

// ── Reveal ───────────────────────────────────────────────────────────────────────────────────────

export interface PhoneDone {
  status: 'found' | 'not_found'
  numbers: PhoneNumberFound[]
  provider?: PhoneProviderId
  creditsUsed?: number
  /** False only when the server said not_found and charged nothing. A found answer we could not read still cost a slot. */
  charged: boolean
  usage: PhoneUsage
  lastCheckedAt?: string
}
export type PhoneFailure =
  | { status: 'notConfigured' }
  | { status: 'cap'; usage: PhoneUsage }
  | { status: 'noInput' }
  | { status: 'providerError' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }
export type PhoneOutcome = PhoneDone | PhoneFailure

const isUsage = (v: unknown): v is PhoneUsage => {
  const u = v as Partial<PhoneUsage> | null
  return !!u && typeof u.used === 'number' && typeof u.limit === 'number' && typeof u.resetsOn === 'string'
}
const isNumber = (n: unknown): n is PhoneNumberFound => {
  const x = n as Partial<PhoneNumberFound> | null
  return !!x && typeof x.e164 === 'string' && !!x.e164.trim() && (x.type === 'mobile' || x.type === 'other' || x.type === 'unknown')
}
const isAbort = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'

function failure(e: unknown): PhoneFailure {
  if (isAbort(e)) {
    // The server reserves a slot before calling the vendor, so a request already sent may have been counted.
    void loadPhoneStatus({ force: true })
    return { status: 'cancelled' }
  }
  if (e instanceof SalesHttpError) {
    switch (e.code) {
      case 'NOT_CONFIGURED': return { status: 'notConfigured' }
      case 'PHONE_CAP_REACHED': {
        const usage = isUsage(e.body?.details) ? e.body.details : (cached?.usage ?? { used: 0, limit: 0, resetsOn: '' })
        setUsage(usage)
        return { status: 'cap', usage }
      }
      case 'PHONE_NO_INPUT': return { status: 'noInput' }
      case 'PROVIDER_ERROR': return { status: 'providerError' }
      default: return { status: 'error', message: e.message }
    }
  }
  if (e instanceof SalesNetworkError) return { status: 'error', message: "Can't reach the server. Check your connection and try again." }
  return { status: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' }
}

export const isPhoneFailure = (o: PhoneOutcome): o is PhoneFailure => !('numbers' in o)

/** Look up one contact. Only ever called from a click. The answer is returned, never stored. */
export async function revealPhone(contactId: string, businessId: BusinessId, signal?: AbortSignal): Promise<PhoneOutcome> {
  try {
    const r: RevealPhoneResponse = await revealPhoneApi({ contactId, businessId }, signal)
    if (isUsage(r.usage)) setUsage(r.usage)
    if (r.mode === 'stub') return { status: 'notConfigured' }
    if (r.status !== 'found' && r.status !== 'not_found') return { status: 'error', message: 'The lookup returned an answer we could not read.' }
    const numbers = Array.isArray(r.numbers) ? r.numbers.filter(isNumber) : []
    return {
      status: r.status === 'found' && numbers.length ? 'found' : 'not_found', numbers, provider: r.provider, creditsUsed: r.creditsUsed,
      charged: r.status === 'found' || (typeof r.creditsUsed === 'number' && r.creditsUsed > 0),
      usage: isUsage(r.usage) ? r.usage : (cached?.usage ?? { used: 0, limit: 0, resetsOn: '' }), lastCheckedAt: r.lastCheckedAt,
    }
  } catch (e) {
    return failure(e)
  }
}
