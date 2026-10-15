import { useSyncExternalStore } from 'react'
import type { BusinessId, CompanyProfileItem, EnrichUsage, ResearchSource } from '../api/contract'
import { Q } from '../data/Q'
import { S } from '../data/store'
import { isFailure, runCompanyProfile } from './client'
import { getUsage } from './enrichCache'

/**
 * Company research on demand: one button per company, results as suggestions. A run costs one of the business's monthly lookups, so its result
 * is kept for the session (never saved or synced) until the person applies or discards it. Nothing here changes a company: Apply in the review
 * dialog does that, field by field.
 */

export type ResearchState =
  | { status: 'running' }
  | { status: 'ready'; items: CompanyProfileItem[]; sources: ResearchSource[]; disclaimer: string; withheld: number; at: string }
  | { status: 'nothing'; at: string }
  | { status: 'failed'; kind: 'cap' | 'notConfigured' | 'error'; message: string; usage?: EnrichUsage }

export interface BulkRun { total: number; done: number; ids: string[]; cancelled: boolean }

const states = new Map<string, ResearchState>()
const aborts = new Map<string, AbortController>()
let bulk: BulkRun | null = null
const listeners = new Set<() => void>()
let owner: string | null = null
let version = 0

function emit(): void {
  version++
  for (const l of [...listeners]) l()
}
function guard(): void {
  const who = S.session?.userId || null
  if (owner !== who) {
    const had = states.size > 0 || bulk !== null
    for (const a of aborts.values()) a.abort()
    states.clear()
    aborts.clear()
    bulk = null
    owner = who
    if (had) emit()
  }
}
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export const getResearch = (companyId: string): ResearchState | undefined => { guard(); return states.get(companyId) }
export const getBulk = (): BulkRun | null => { guard(); return bulk }

/** Re-renders when any research state changes. */
export function useResearchVersion(): number { return useSyncExternalStore(subscribe, () => { guard(); return version }) }

/** The business whose monthly lookups a run spends: the first the person can edit that has a relationship with the company. */
export function researchBusiness(companyId: string): BusinessId | null {
  return Q.relsOf(companyId).map(r => r.businessId).find(b => Q.canEdit(b)) ?? null
}

/** Run research for one company. A run already going, or a result waiting, is left alone unless `again`. */
export async function startResearch(companyId: string, opts: { again?: boolean } = {}): Promise<ResearchState | undefined> {
  guard()
  const cur = states.get(companyId)
  if (cur && !opts.again && (cur.status === 'running' || cur.status === 'ready')) return cur
  const b = researchBusiness(companyId)
  if (!b) {
    const failed: ResearchState = { status: 'failed', kind: 'error', message: 'You need edit access to one of this company\'s businesses to research it.' }
    states.set(companyId, failed)
    emit()
    return failed
  }
  const ctl = new AbortController()
  aborts.set(companyId, ctl)
  states.set(companyId, { status: 'running' })
  emit()
  const r = await runCompanyProfile({ businessId: b, companyId }, { signal: ctl.signal })
  if (aborts.get(companyId) !== ctl) return states.get(companyId)
  aborts.delete(companyId)
  const at = new Date().toISOString()
  let next: ResearchState
  if (isFailure(r)) {
    if (r.status === 'cancelled') { states.delete(companyId); emit(); return undefined }
    next = r.status === 'notConfigured' ? { status: 'failed', kind: 'notConfigured', message: 'Research is not set up on the server.', usage: r.usage }
      : r.status === 'cap' ? { status: 'failed', kind: 'cap', message: 'The monthly research limit has been reached.', usage: r.usage }
      : { status: 'failed', kind: 'error', message: r.message }
  } else if (r.items.length === 0) next = { status: 'nothing', at }
  else next = { status: 'ready', items: r.items, sources: r.sources, disclaimer: r.disclaimer, withheld: r.withheld, at }
  states.set(companyId, next)
  emit()
  return next
}

export function cancelResearch(companyId: string): void {
  aborts.get(companyId)?.abort()
  aborts.delete(companyId)
  if (states.get(companyId)?.status === 'running') { states.delete(companyId); emit() }
}

/** Forget a company's result: after Apply, or when the person discards it. */
export function dropResearch(companyId: string): void {
  if (states.delete(companyId)) emit()
}

/** Research several companies one after another. Each result waits to be reviewed; a failure on one does not stop the rest, a limit does. */
export async function startBulk(ids: readonly string[]): Promise<void> {
  guard()
  const todo = [...new Set(ids)].filter(id => { const s = states.get(id); return !(s && (s.status === 'running' || s.status === 'ready')) })
  if (!todo.length || bulk) return
  const run: BulkRun = { total: todo.length, done: 0, ids: todo, cancelled: false }
  bulk = run
  emit()
  for (const id of todo) {
    if (run.cancelled) break
    const s = await startResearch(id)
    run.done++
    emit()
    if (s?.status === 'failed' && (s.kind === 'cap' || s.kind === 'notConfigured')) break
  }
  if (bulk === run) bulk = null
  emit()
}

export function cancelBulk(): void {
  if (!bulk) return
  bulk.cancelled = true
  for (const id of bulk.ids) if (states.get(id)?.status === 'running') cancelResearch(id)
  bulk = null
  emit()
}

/** Remaining monthly lookups for this company's business, from what the session has seen; undefined until a call has answered. */
export function usageFor(companyId: string): EnrichUsage | undefined {
  const b = researchBusiness(companyId)
  return b ? getUsage(b) : undefined
}

export function clearProfileResearch(): void {
  for (const a of aborts.values()) a.abort()
  states.clear()
  aborts.clear()
  bulk = null
  emit()
}
