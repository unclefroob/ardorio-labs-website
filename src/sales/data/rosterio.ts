import { useEffect, useSyncExternalStore } from 'react'
import { rosterioProvision, rosterioRetry, rosterioStatus } from '../api/rosterio'
import { ROSTERIO_PLANS } from '../api/contract'
import type { RosterioLink, RosterioLinkState, RosterioPlan, RosterioProvisionRequest, RosterioProvisionResponse, RosterioStatusResponse } from '../api/contract'
import { SalesHttpError, SalesNetworkError } from '../api/http'
import { F } from './F'
import { Q } from './Q'
import { S } from './store'
import { pollOnce } from './sync'
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
  }
}

// ── status (shared by every card that needs "is this switched on?") ────────────────────────────────
export type StatusState = { s: 'idle' } | { s: 'loading' } | { s: 'ok'; status: RosterioStatusResponse } | { s: 'error'; message: string }
let status: StatusState = { s: 'idle' }
let version = 0
const subs = new Set<() => void>()
const overlay = new Map<string, RosterioLink>()

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

export async function retryFailedPushes(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await rosterioRetry()
    await loadRosterioStatus()
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof SalesNetworkError ? "Can't reach the server. Check your connection and try again." : e instanceof SalesHttpError && e.body ? e.message : 'Could not retry. Try again in a moment.' }
  }
}
