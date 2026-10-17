import { useSyncExternalStore } from 'react'
import { rosterioBilling } from '../api/rosterio'
import type { RosterioBilling } from '../api/contract'
import { useLoad, type Loaded } from './invoicing'

// A managed Rosterio account's Stripe billing, read from Rosterio through the API. The company card and the Start billing
// window share it: after a start or stop, billingChanged() has every reader of that company load it again.

const versions = new Map<string, number>()
const listeners = new Set<() => void>()

export function billingChanged(companyId: string): void {
  versions.set(companyId, (versions.get(companyId) ?? 0) + 1)
  for (const l of listeners) l()
}

const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export function useRosterioBilling(companyId: string): Loaded<RosterioBilling> {
  const v = useSyncExternalStore(subscribe, () => versions.get(companyId) ?? 0)
  return useLoad(sig => rosterioBilling(companyId, sig), `ros-billing:${companyId}:${v}`)
}

export const rosMoneyOf = (cents: number): string =>
  'A$' + (cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const perOf = (interval: 'monthly' | 'yearly'): string => (interval === 'yearly' ? 'a year' : 'a month')

/** YYYY-MM-DD as "1 Nov 2026" (a calendar day, so no time zone shift). */
export const dayText = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** The 1st of the month after `today` (YYYY-MM-DD). */
export function firstOfNextMonth(today: string): string {
  const [y, m] = today.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}
