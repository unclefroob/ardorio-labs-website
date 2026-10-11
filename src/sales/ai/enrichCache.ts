import { useSyncExternalStore } from 'react'
import type { BusinessId, EnrichUsage } from '../api/contract'
import { S } from '../data/store'
import type { EnrichDone } from './client'

/**
 * Session-only memory for contact enrichment. A lookup costs one of the business's monthly calls, so the
 * result is kept per contact for "Review & apply" to reuse. Never persisted and never synced: it lives
 * in this module, is tied to the signed-in user, and goes with the page.
 */

export interface CachedEnrich { ts: number; res: EnrichDone }

const MAX_ENTRIES = 500
const results = new Map<string, CachedEnrich>()
const usage = new Map<BusinessId, EnrichUsage>()
const competitor = new Map<BusinessId, boolean>()
const listeners = new Set<() => void>()
let owner: string | null = null

function emit(): void {
  for (const l of [...listeners]) l()
}

/** A different user in the same tab must never see the previous user's results. */
function guard(): void {
  const who = S.session?.userId || null
  if (owner !== who) {
    const had = results.size > 0 || usage.size > 0 || competitor.size > 0
    results.clear()
    usage.clear()
    competitor.clear()
    owner = who
    if (had) emit()
  }
}

export function getEnrich(contactId: string): CachedEnrich | undefined {
  guard()
  return results.get(contactId)
}

export function putEnrich(contactId: string, res: EnrichDone, now: number = Date.now()): void {
  guard()
  results.delete(contactId)
  results.set(contactId, { ts: now, res })
  if (results.size > MAX_ENTRIES) {
    const oldest = results.keys().next().value
    if (oldest !== undefined) results.delete(oldest)
  }
}

export function dropEnrich(contactId: string): void {
  results.delete(contactId)
}

/** Whether a cached allowance has rolled over: resetsOn is 00:00 UTC on the 1st of next month. Unparseable dates never expire. */
export function usageExpired(u: EnrichUsage, now: number = Date.now()): boolean {
  const t = Date.parse(`${u.resetsOn}T00:00:00Z`)
  return !Number.isNaN(t) && now >= t
}

/** The cached allowance for this business; undefined once its month has rolled over, so callers refetch. */
export function getUsage(b: BusinessId): EnrichUsage | undefined {
  guard()
  const u = usage.get(b)
  if (u && usageExpired(u)) {
    usage.delete(b)
    return undefined
  }
  return u
}

export function setUsage(b: BusinessId, u: EnrichUsage): void {
  guard()
  const cur = usage.get(b)
  if (cur && cur.used === u.used && cur.limit === u.limit && cur.resetsOn === u.resetsOn) return
  usage.set(b, u)
  emit()
}

/** Whether the server has a competitor list for this business (a competitor's tool adds to the score). Unknown until a usage call answers. */
export function getCompetitorRule(b: BusinessId): boolean | undefined {
  guard()
  return competitor.get(b)
}

export function setCompetitorRule(b: BusinessId, v: boolean): void {
  guard()
  if (competitor.get(b) === v) return
  competitor.set(b, v)
  emit()
}

export function useCompetitorRule(b: BusinessId | undefined): boolean | undefined {
  return useSyncExternalStore(subscribe, () => (b ? getCompetitorRule(b) : undefined))
}

/** Forget everything. Call on sign-out. */
export function clear(): void {
  results.clear()
  usage.clear()
  competitor.clear()
  owner = null
  emit()
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The last usage seen for this business (from any lookup or the usage endpoint); undefined until one has been made. */
export function useEnrichUsage(b: BusinessId | undefined): EnrichUsage | undefined {
  return useSyncExternalStore(subscribe, () => (b ? getUsage(b) : undefined))
}

export function remaining(u: EnrichUsage | undefined): number | null {
  return u ? Math.max(0, u.limit - u.used) : null
}

/** "just now", "1 min ago", "12 min ago", "3 h ago". */
export function ageLabel(ts: number, now: number = Date.now()): string {
  const m = Math.floor(Math.max(0, now - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  return `${Math.floor(m / 60)} h ago`
}

/** resetsOn is 'YYYY-MM-01' (UTC); shown as "1 Nov 2026". Anything unparseable is shown as given. */
export function fmtReset(resetsOn: string): string {
  const d = new Date(`${resetsOn}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return resetsOn
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
