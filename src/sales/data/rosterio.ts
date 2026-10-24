import { useEffect, useSyncExternalStore } from 'react'
import { rosterioAccounts, rosterioLink, rosterioMatches, rosterioProvision, rosterioRefresh, rosterioRetry, rosterioStatus, rosterioUnlink } from '../api/rosterio'
import { ROSTERIO_PLANS } from '../api/contract'
import type {
  RosterioAccount, RosterioAccountsResponse, RosterioLink, RosterioLinkState, RosterioMatchesResponse, RosterioMatchReason, RosterioPlan, RosterioPlanDrift, RosterioProvisionRequest,
  RosterioProvisionResponse, RosterioRefreshResponse, RosterioStatusResponse,
} from '../api/contract'
import { SalesHttpError, SalesNetworkError } from '../api/http'
import { F } from './F'
import { Q } from './Q'
import { S } from './store'
import { Act } from './Act'
import { flushAll, pollOnce } from './sync'
import { normaliseUrl } from '../shared/url'
import { businessDomain } from '../shared/rosterioMatch'
import { UI } from '../ui/store'
import type { Company, Deal } from './types'

// Rosterio CRM link. Status is read from the server on demand. The link itself lives on the company record and arrives
// through normal sync; the small overlay below only bridges the moment between a click and the next sync. The one-time
// password is never kept here: `provision` hands it straight back to the caller.

export const PLAN_LABELS: Readonly<Record<RosterioPlan, string>> = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' }
export const PLAN_OPTIONS: ReadonlyArray<readonly [RosterioPlan, string]> = ROSTERIO_PLANS.map(p => [p, PLAN_LABELS[p]] as const)

export function asPlan(v: unknown): RosterioPlan | undefined {
  return typeof v === 'string' && (ROSTERIO_PLANS as readonly string[]).includes(v) ? (v as RosterioPlan) : undefined
}
export const planLabel = (v: unknown): string => { const p = asPlan(v); return p ? PLAN_LABELS[p] : typeof v === 'string' ? v : '' }

const STATES: readonly string[] = ['provisioning', 'provisioned', 'unknown']
export function asLink(v: unknown): RosterioLink | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const o = v as Record<string, unknown>
  if (typeof o.state !== 'string' || !STATES.includes(o.state)) return undefined
  const str = (x: unknown): string | undefined => (typeof x === 'string' && x ? x : undefined)
  return {
    state: o.state as RosterioLinkState, accountId: str(o.accountId), accountName: str(o.accountName), plan: asPlan(o.plan),
    isTrial: typeof o.isTrial === 'boolean' ? o.isTrial : undefined, trialEndDate: str(o.trialEndDate), by: str(o.by), at: str(o.at),
    accountStatus: str(o.accountStatus), accountState: o.accountState === 'active' || o.accountState === 'deleted' ? o.accountState : undefined, refreshedAt: str(o.refreshedAt),
  }
}

// ── status (shared by every card that needs "is this switched on?") ────────────────────────────────
export type StatusState = { s: 'idle' } | { s: 'loading' } | { s: 'ok'; status: RosterioStatusResponse } | { s: 'error'; message: string }
let status: StatusState = { s: 'idle' }
let version = 0
const subs = new Set<() => void>()
const overlay = new Map<string, RosterioLink>()
/** Companies this browser just unlinked, until the next sync brings the cleared record. */
const unlinkedHere = new Set<string>()

function emit(): void {
  version++
  subs.forEach(f => f())
}
const subscribe = (f: () => void): (() => void) => {
  subs.add(f)
  return () => { subs.delete(f) }
}

function isStatus(v: unknown): v is RosterioStatusResponse {
  const o = v as Partial<RosterioStatusResponse> | null
  return !!o && typeof o.configured === 'boolean' && typeof o.pendingFailures === 'number' && Array.isArray(o.recent)
}

export async function loadRosterioStatus(): Promise<void> {
  if (status.s === 'loading') return
  if (status.s !== 'ok') { status = { s: 'loading' }; emit() }
  try {
    const r = await rosterioStatus()
    status = isStatus(r) ? { s: 'ok', status: { ...r, recent: r.recent.slice(0, 20) } } : { s: 'error', message: 'The Rosterio status came back in an unexpected form.' }
  } catch (e) {
    status = { s: 'error', message: e instanceof SalesNetworkError ? "Can't reach the server. Check your connection and try again." : e instanceof Error ? e.message : 'Could not load the Rosterio status.' }
  }
  emit()
}

/** Reads the status once per session for anyone in Rosterio; `reload()` asks again (after a retry, say). */
export function useRosterioStatus(): StatusState & { reload: () => void } {
  const v = useSyncExternalStore(subscribe, () => version)
  const member = Q.member('ros')
  useEffect(() => {
    if (member && status.s === 'idle') void loadRosterioStatus()
  }, [member, v])
  return { ...status, reload: () => void loadRosterioStatus() }
}

/** Re-render when the link overlay changes. */
export function useRosterioLinks(): number {
  return useSyncExternalStore(subscribe, () => version)
}

/** The company's Rosterio link. The synced copy wins once it says `provisioned`; until then what this browser just learned stands. */
export function rosterioLinkOf(c: Company | undefined): RosterioLink | undefined {
  if (!c) return undefined
  const synced = asLink(c.rosterio)
  if (unlinkedHere.has(c.id)) {
    if (synced) return undefined
    unlinkedHere.delete(c.id)
  }
  if (synced?.state === 'provisioned') return synced
  return overlay.get(c.id) ?? synced
}

/** The Rosterio deal to provision from: a won one first, then an open one, then the newest. */
export function rosDealFor(companyId: string): Deal | undefined {
  const rank = (d: Deal): number => (d.status === 'won' ? 0 : d.status === 'open' ? 1 : 2)
  return S.deals.filter(d => d.businessId === 'ros' && d.companyId === companyId).sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt))[0]
}

/** One answer for every place that offers the Provision button. */
export function canOfferProvision(st: StatusState, link: RosterioLink | undefined): boolean {
  return Q.canEdit('ros') && st.s === 'ok' && st.status.configured && !link
}

/** The plan drift nudge. Informational: SalesOS never changes the deal from it. */
export const planDriftText = (d: RosterioPlanDrift): string => `The account is on ${planLabel(d.accountPlan)}, the deal says ${planLabel(d.dealPlan)}.`

export function linkSummary(l: RosterioLink): string {
  const parts = [l.accountName || 'Rosterio account', l.plan ? planLabel(l.plan) : '']
  if (l.isTrial) parts.push(l.trialEndDate ? 'trial until ' + F.date(l.trialEndDate) : 'trial')
  return parts.filter(Boolean).join(' · ')
}

// ── provisioning ───────────────────────────────────────────────────────────────────────────────────
export type ProvisionResult =
  | { ok: true; link: RosterioLink; adminUser: RosterioProvisionResponse['adminUser'] }
  /** The server said no (bad input, no permission). Nothing was created and the link is clear again. */
  | { ok: false; kind: 'rejected' | 'forbidden'; message: string }
  /** Rosterio already has an account that looks like this one. Nothing was created. */
  | { ok: false; kind: 'match'; message: string; found: RosterioMatchesResponse }
  /** Someone already provisioned this company. */
  | { ok: false; kind: 'already'; message: string; link?: RosterioLink }
  /** No answer, or an error on the way: the account may or may not exist. "Check status" asks again. */
  | { ok: false; kind: 'unsure'; message: string }

export const UNSURE_MESSAGE = 'We could not confirm whether the Rosterio account was created. Press "Check status" to find out. It will not create a second account.'

/** Sends the request. The returned password belongs to the caller's component state and nowhere else. */
export async function provision(companyId: string, req: RosterioProvisionRequest): Promise<ProvisionResult> {
  try {
    const r = await rosterioProvision(req)
    const link = asLink(r?.link)
    if (!link || !r.adminUser) {
      overlay.set(companyId, { state: 'unknown' })
      emit()
      return { ok: false, kind: 'unsure', message: UNSURE_MESSAGE }
    }
    overlay.set(companyId, link)
    emit()
    void pollOnce()
    return { ok: true, link, adminUser: r.adminUser }
  } catch (e) {
    if (e instanceof SalesHttpError && e.status < 500) {
      if (e.status === 409 && e.code === 'ROSTERIO_MATCH') {
        const found = asMatches(e.body?.details)
        if (found) {
          // The server let go of its claim: nothing was created, so a "not sure" marker no longer holds.
          if (overlay.delete(companyId)) emit()
          return { ok: false, kind: 'match', message: e.message, found }
        }
      }
      if (e.status === 409) {
        const details = e.body?.details as { link?: unknown } | undefined
        const link = asLink(details?.link)
        if (link) { overlay.set(companyId, link); emit() }
        void pollOnce()
        return { ok: false, kind: 'already', message: link?.state === 'provisioned' ? 'This company already has a Rosterio account.' : e.message, link }
      }
      // A clear refusal: nothing was created, so any "not sure" marker from an earlier try no longer holds.
      if (overlay.delete(companyId)) emit()
      if (e.status === 403) return { ok: false, kind: 'forbidden', message: 'You need edit access to Rosterio to do this.' }
      return { ok: false, kind: 'rejected', message: e.body?.error ?? 'Rosterio could not set this account up. Check the details and try again.' }
    }
    overlay.set(companyId, { state: 'unknown' })
    emit()
    void pollOnce()
    return { ok: false, kind: 'unsure', message: UNSURE_MESSAGE }
  }
}

const REASONS: readonly string[] = ['name', 'administratorEmail', 'billingEmail']
/** Reads the matches answer field by field; anything that is not shaped like one is treated as no answer. */
export function asMatches(v: unknown): RosterioMatchesResponse | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const o = v as Record<string, unknown>
  if (!Array.isArray(o.matches)) return undefined
  const one = (x: unknown) => {
    if (typeof x !== 'object' || x === null) return undefined
    const m = x as Record<string, unknown>
    if (typeof m.accountId !== 'string' || typeof m.name !== 'string') return undefined
    const matchedOn = (Array.isArray(m.matchedOn) ? m.matchedOn : []).filter((r): r is RosterioMatchReason => typeof r === 'string' && REASONS.includes(r))
    return {
      accountId: m.accountId, name: m.name, plan: typeof m.plan === 'string' ? m.plan : null, isTrial: m.isTrial === true,
      status: typeof m.status === 'string' ? m.status : null, matchedOn,
      companyId: typeof m.companyId === 'string' ? m.companyId : null, companyName: typeof m.companyName === 'string' ? m.companyName : null,
    }
  }
  const matches = o.matches.map(one).filter((m): m is NonNullable<ReturnType<typeof one>> => !!m).map(m => ({ accountId: m.accountId, name: m.name, plan: m.plan, isTrial: m.isTrial, status: m.status, matchedOn: m.matchedOn }))
  const alreadyLinked = (Array.isArray(o.alreadyLinked) ? o.alreadyLinked : []).map(one).filter((m): m is NonNullable<ReturnType<typeof one>> => !!m)
  return { checked: o.checked !== false, matches, alreadyLinked, canConfirmNotDuplicate: o.canConfirmNotDuplicate === true }
}

/**
 * Asks whether Rosterio already has an account for this, before anything is created. Read-only. Any trouble (Rosterio could not
 * be asked, a failed request) answers null: the form carries on as before, and the server checks again when it provisions.
 */
export async function checkMatches(companyId: string, accountName: string, administratorEmail: string): Promise<RosterioMatchesResponse | null> {
  try {
    const found = asMatches(await rosterioMatches({ companyId, accountName, administratorEmail }))
    return found && found.checked ? found : null
  } catch {
    return null
  }
}

export async function retryFailedPushes(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await rosterioRetry()
    await loadRosterioStatus()
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof SalesNetworkError ? "Can't reach the server. Check your connection and try again." : e instanceof SalesHttpError && e.body ? e.message : 'Could not retry. Try again in a moment.' }
  }
}

// ── live accounts (a read of Rosterio each time, never a copy in the store) ────────────────────────
export type AccountsState =
  | { s: 'idle' }
  | { s: 'loading'; previous?: RosterioAccountsResponse }
  | { s: 'ok'; data: RosterioAccountsResponse }
  | { s: 'notConfigured' }
  | { s: 'error'; message: string; previous?: RosterioAccountsResponse }

let accounts: AccountsState = { s: 'idle' }
let accountsAt = 0
let inflight: Promise<void> | null = null
/** What the last good read said, kept only in memory so a card can say "last seen" when Rosterio can't be reached. */
let lastGood: RosterioAccountsResponse | null = null
const ACCOUNTS_TTL_MS = 60_000

const failText = (e: unknown): string =>
  e instanceof SalesNetworkError ? "Can't reach the server. Check your connection and try again."
    : e instanceof SalesHttpError && e.body?.error ? e.body.error
    : 'Could not load the accounts from Rosterio.'

function isAccounts(v: unknown): v is RosterioAccountsResponse {
  const o = v as Partial<RosterioAccountsResponse> | null
  return !!o && Array.isArray(o.accounts) && typeof o.fetchedAt === 'string'
    && o.accounts.every(a => !!a && typeof a.id === 'string' && typeof a.name === 'string')
}

/** One shared request: a second caller while one is running waits for it. */
export function loadRosterioAccounts(): Promise<void> {
  if (inflight) return inflight
  accounts = { s: 'loading', previous: lastGood ?? undefined }
  emit()
  inflight = (async () => {
    try {
      const r = await rosterioAccounts()
      if (isAccounts(r)) {
        const data: RosterioAccountsResponse = { ...r, total: typeof r.total === 'number' ? r.total : r.accounts.length, truncated: r.truncated === true }
        lastGood = data
        accounts = { s: 'ok', data }
        accountsAt = Date.now()
      } else accounts = { s: 'error', message: 'The Rosterio accounts came back in an unexpected form.', previous: lastGood ?? undefined }
    } catch (e) {
      accounts = e instanceof SalesHttpError && e.code === 'NOT_CONFIGURED'
        ? { s: 'notConfigured' }
        : { s: 'error', message: failText(e), previous: lastGood ?? undefined }
    }
    inflight = null
    emit()
  })()
  return inflight
}

/**
 * `always` reads on every mount (the customers page); `ifStale` reads when nothing was read in the last minute
 * (the company card, so many cards share one request).
 */
export function useRosterioAccounts(mode: 'always' | 'ifStale' | 'never' = 'always'): AccountsState & { reload: () => void; lastGood: RosterioAccountsResponse | null } {
  useSyncExternalStore(subscribe, () => version)
  const member = Q.member('ros')
  useEffect(() => {
    if (!member || mode === 'never') return
    const stale = accounts.s === 'idle' || Date.now() - accountsAt > ACCOUNTS_TTL_MS
    if (mode === 'always' || stale) void loadRosterioAccounts()
  }, [member, mode])
  return { ...accounts, reload: () => void loadRosterioAccounts(), lastGood }
}

export const accountOf = (data: RosterioAccountsResponse | undefined, id: string | undefined): RosterioAccount | undefined =>
  id ? data?.accounts.find(a => a.id === id) : undefined

/** Test seam. */
export function resetRosterioAccounts(): void {
  accounts = { s: 'idle' }
  accountsAt = 0
  inflight = null
  lastGood = null
  overlay.clear()
  refreshed.clear()
  refreshing.clear()
  unlinkedHere.clear()
  pendingCreate.clear()
  emit()
}

// ── "Not it": remembered in this browser only ──────────────────────────────────────────────────────
const DISMISS_KEY = 'sos.ros.notIt'
export function readDismissed(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]')
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  } catch { return new Set() }
}
export function dismissAccount(id: string): void {
  try {
    const s = readDismissed()
    s.add(id)
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...s]))
  } catch { /* storage unavailable: the suggestion simply comes back */ }
  emit()
}
export function useDismissed(): Set<string> {
  useSyncExternalStore(subscribe, () => version)
  return readDismissed()
}

// ── linking an existing account to a company ───────────────────────────────────────────────────────
export type LinkResult =
  | { ok: true; link: RosterioLink }
  | { ok: false; kind: 'notSynced' | 'forbidden' | 'conflict' | 'missing' | 'failed'; message: string }

export const NOT_SYNCED_MESSAGE = 'Saved here, not synced yet. Retry'

function linkFail(e: unknown): LinkResult {
  if (e instanceof SalesHttpError) {
    if (e.status === 403) return { ok: false, kind: 'forbidden', message: 'You need edit access to Rosterio to do this.' }
    if (e.status === 409) return { ok: false, kind: 'conflict', message: e.body?.error ?? 'That account or company is already linked.' }
    if (e.status === 404) return { ok: false, kind: 'missing', message: e.body?.error ?? 'That account or company could not be found. Refresh and try again.' }
    if (e.status < 500) return { ok: false, kind: 'failed', message: e.body?.error ?? 'The link could not be saved.' }
  }
  return { ok: false, kind: 'failed', message: failText(e) }
}

/** Saves the account id on the company. The server checks the account exists; the company is put in Rosterio first if it is not. */
export async function linkAccount(companyId: string, accountId: string): Promise<LinkResult> {
  if (!Q.canEdit('ros')) return { ok: false, kind: 'forbidden', message: 'You need edit access to Rosterio to do this.' }
  if (!Q.company(companyId)) return { ok: false, kind: 'missing', message: 'That company could not be found.' }
  if (!Q.rel(companyId, 'ros')) Act.linkCompany(companyId, 'ros')
  if (!(await flushAll())) return { ok: false, kind: 'notSynced', message: NOT_SYNCED_MESSAGE }
  try {
    const r = await rosterioLink({ companyId, accountId })
    const link = asLink(r?.link)
    if (!link) return { ok: false, kind: 'failed', message: 'The link came back in an unexpected form. Refresh to see where it stands.' }
    unlinkedHere.delete(companyId)
    overlay.set(companyId, link)
    emit()
    void pollOnce()
    return { ok: true, link }
  } catch (e) {
    return linkFail(e)
  }
}

export async function unlinkAccount(companyId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!Q.canEdit('ros')) return { ok: false, message: 'You need edit access to Rosterio to do this.' }
  try {
    await rosterioUnlink({ companyId })
    overlay.delete(companyId)
    refreshed.delete(companyId)
    unlinkedHere.add(companyId)
    emit()
    void pollOnce()
    return { ok: true }
  } catch (e) {
    const r = linkFail(e)
    return { ok: false, message: r.ok ? 'Could not unlink.' : r.message }
  }
}

/** Companies made here that are waiting on their link, so Retry links the same company instead of making a second. */
const pendingCreate = new Map<string, string>()

/** Creates a Rosterio company from an account (its name; its website only when the billing email is a business domain) and links it. */
export async function createCompanyFor(account: RosterioAccount): Promise<LinkResult & { companyId?: string }> {
  if (!UI.guard('ros', 'Creating a company')) return { ok: false, kind: 'forbidden', message: 'You need edit access to Rosterio to do this.' }
  let cid = pendingCreate.get(account.id)
  if (!cid || !Q.company(cid)) {
    const dom = businessDomain(account.billingEmail)
    const web = dom ? normaliseUrl(dom) : { ok: true as const, value: '' }
    const c = Act.createCompany({
      name: account.name, website: web.ok ? web.value : '', industry: '', businessId: 'ros', ownerId: Q.me().id, source: 'Rosterio customer',
    })
    cid = c.id
    pendingCreate.set(account.id, cid)
    if (c.website && (await flushAll()) && !Q.company(cid)) {
      pendingCreate.delete(account.id)
      return { ok: false, kind: 'failed', message: 'The server did not accept this company. Link it to an existing company instead.' }
    }
  }
  const r = await linkAccount(cid, account.id)
  if (r.ok) pendingCreate.delete(account.id)
  return { ...r, companyId: cid }
}

export type AccountStanding = { kind: 'paid' | 'trial' | 'trialEnded' | 'inactive'; days?: number; label: string }

/** What to say about an account's standing today. `now` is a parameter so it can be tested. */
export function standing(a: RosterioAccount, now: number = Date.now()): AccountStanding {
  if (!a.isActive) return { kind: 'inactive', label: a.status ? a.status.charAt(0).toUpperCase() + a.status.slice(1) : 'Inactive' }
  if (!a.isTrial) return { kind: 'paid', label: 'Paid' }
  const end = a.trialEndDate ? Date.parse(a.trialEndDate) : NaN
  if (Number.isNaN(end)) return { kind: 'trial', label: 'Trial' }
  const days = Math.ceil((end - now) / 86_400_000)
  if (days < 0) return { kind: 'trialEnded', days: -days, label: `Trial ended ${-days} day${-days === 1 ? '' : 's'} ago` }
  return { kind: 'trial', days, label: days === 0 ? 'Trial · ends today' : `Trial · ${days} day${days === 1 ? '' : 's'} left` }
}

// ── the refreshed snapshot ─────────────────────────────────────────────────────────────────────────
/** What the server last said when a company was opened. Held in memory only; the saved copy reaches the company through sync. */
export interface Refreshed { at: number; link: RosterioLink | null; planDrift: RosterioPlanDrift | null; adminUrl?: string }
const refreshed = new Map<string, Refreshed>()
const refreshing = new Map<string, Promise<void>>()
const FRESH_MS = 60_000

export const refreshedOf = (companyId: string): Refreshed | undefined => refreshed.get(companyId)

/**
 * Asks the server to refresh this company's Rosterio snapshot, once a minute at most. Quiet by design: when Rosterio cannot be
 * reached (refreshed: false, or the request fails) the saved link stands and nothing is shown. The deal is never touched.
 */
export function refreshRosterio(companyId: string): Promise<void> {
  const running = refreshing.get(companyId)
  if (running) return running
  const last = refreshed.get(companyId)
  if (last && Date.now() - last.at < FRESH_MS) return Promise.resolve()
  const run = (async (): Promise<void> => {
    try {
      const r: RosterioRefreshResponse = await rosterioRefresh({ companyId })
      if (unlinkedHere.has(companyId)) return
      const link = asLink(r?.link) ?? null
      const drift = r?.planDrift && asPlan(r.planDrift.dealPlan) && asPlan(r.planDrift.accountPlan) ? r.planDrift : null
      refreshed.set(companyId, {
        at: Date.now(), link: r?.refreshed ? link : null, planDrift: r?.refreshed ? drift : null,
        ...(safeUrl(r?.adminUrl) ? { adminUrl: safeUrl(r.adminUrl) } : {}),
      })
    } catch {
      // Quiet: the saved link is still what the page shows. The attempt still counts, so a failing server is not asked on every mount.
      const prev = refreshed.get(companyId)
      refreshed.set(companyId, { link: null, planDrift: null, ...prev, at: Date.now() })
    } finally {
      refreshing.delete(companyId)
      emit()
    }
  })()
  refreshing.set(companyId, run)
  return run
}

/** An address the page may link to: https, or http on localhost for a developer's machine. Anything else is dropped. */
export function safeUrl(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v) return undefined
  try {
    const u = new URL(v)
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    return u.protocol === 'https:' || (u.protocol === 'http:' && local) ? u.href : undefined
  } catch {
    return undefined
  }
}

/** The refreshed snapshot for a company's card. Starts the refresh when the card opens on a provisioned link. */
export function useRosterioRefresh(companyId: string, enabled: boolean): Refreshed | undefined {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    if (!enabled) return
    void refreshRosterio(companyId)
  }, [companyId, enabled])
  return enabled ? refreshed.get(companyId) : undefined
}

/** The accounts from the last good read, for dialogs opened from the list. */
export function accountSnapshot(id: string): RosterioAccount | undefined {
  return accountOf(accounts.s === 'ok' ? accounts.data : lastGood ?? undefined, id)
}
