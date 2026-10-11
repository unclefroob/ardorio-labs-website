import { useCallback, useEffect, useRef, useState } from 'react'
import type { BillingPlan } from '../api/contract'
import { Q } from './Q'
import { S } from './store'
import type { Company, Deal } from './types'

/**
 * Billing plans live in the 'billingPlans' record collection, added to the store separately. Until it exists
 * this returns nothing, so the milestone picker simply has no plans to offer.
 */
export function billingPlans(): BillingPlan[] {
  const v = (S as unknown as { billingPlans?: unknown }).billingPlans
  return Array.isArray(v) ? (v as BillingPlan[]) : []
}

/** Companies that are in the Ardorio business, by name. */
export function ardCompanies(): Company[] {
  const ids = new Set(S.companyRels.filter(r => r.businessId === 'ard').map(r => r.companyId))
  return S.companies.filter(c => ids.has(c.id) && !c.archived).slice().sort((a, b) => a.name.localeCompare(b.name))
}

export const ardDeals = (companyId: string): Deal[] => S.deals.filter(d => d.businessId === 'ard' && d.companyId === companyId)

export function dealName(id: string | null): string {
  const d = id ? Q.deal(id) : undefined
  return d ? d.title || d.name : ''
}

export interface Loaded<T> { data: T | null; error: unknown; loading: boolean; reload: () => void }

/** Runs a loader on mount and when `key` changes or `reload` is called. A superseded or aborted call is ignored. */
export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, key: string): Loaded<T> {
  const [n, setN] = useState(0)
  const token = `${key}#${n}`
  const [done, setDone] = useState<{ token: string; data: T | null; error: unknown } | null>(null)
  const fn = useRef(load)
  useEffect(() => { fn.current = load })
  useEffect(() => {
    const ac = new AbortController()
    fn.current(ac.signal).then(
      data => { if (!ac.signal.aborted) setDone({ token, data, error: null }) },
      error => { if (!ac.signal.aborted) setDone({ token, data: null, error }) },
    )
    return () => ac.abort()
  }, [token])
  const reload = useCallback(() => setN(x => x + 1), [])
  const fresh = done?.token === token
  // While a reload of the same key is in flight the last good data stays on screen; a different key starts empty.
  const sameKey = !!done && done.token.startsWith(`${key}#`)
  return { data: sameKey ? done.data : null, error: fresh ? done?.error ?? null : null, loading: !fresh, reload }
}
