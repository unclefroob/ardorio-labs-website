import { useSyncExternalStore } from 'react'
import { rosterioBilling, type BillingRef } from '../api/rosterio'
import type { RosterioAccount, RosterioBilling, RosterioBillingState } from '../api/contract'
import type { AccountCollection } from '../shared/rosterioCollection'
import { useLoad, type Loaded } from './invoicing'

// A managed Rosterio account's Stripe billing, read from Rosterio through the API. The account page, the company card and the
// Start billing window share it: after a start or stop, billingChanged() has every reader of that account load it again.
// An account is named by its company in SalesOS or by its own Rosterio id.

const versions = new Map<string, number>()
const listeners = new Set<() => void>()

const keyOf = (ref: BillingRef): string => ('accountId' in ref ? `a:${ref.accountId}` : `c:${ref.companyId}`)

/** Name every way the account is known (its id and its company) so each reader of it loads again. */
export function billingChanged(...refs: BillingRef[]): void {
  for (const ref of refs) versions.set(keyOf(ref), (versions.get(keyOf(ref)) ?? 0) + 1)
  for (const l of listeners) l()
}

const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export function useRosterioBilling(ref: BillingRef): Loaded<RosterioBilling> {
  const k = keyOf(ref)
  const v = useSyncExternalStore(subscribe, () => versions.get(k) ?? 0)
  return useLoad(sig => rosterioBilling(ref, sig), `ros-billing:${k}:${v}`)
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

export interface Pill { label: string; tone: string; sub?: string }

const STATE_PILL: Record<RosterioBillingState, Pill> = {
  starting: { label: 'Setting up…', tone: '' },
  awaiting_card: { label: 'Waiting for a card', tone: 'warn' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  active: { label: 'Billing', tone: 'ok' },
  stopping: { label: 'Ending', tone: 'warn' },
  stopped: { label: 'Stopped', tone: '' },
}
const NOT_BILLED: Pill = { label: 'Not billed yet', tone: 'warn' }

/** A billing state in a word. `managed` is whether the account has a contract; without one it pays at checkout. */
export function statePill(state: RosterioBillingState | null | undefined, managed: boolean): Pill {
  if (state) return STATE_PILL[state]
  return managed ? NOT_BILLED : { label: 'Self-serve: pays at checkout', tone: '' }
}

/** Where one account's Stripe billing stands, in a word: the company card and the account page's Billing tab. */
export const billingPill = (b: RosterioBilling): Pill => statePill(b.billing?.state, !!b.terms)

/** Self-serve: on a published plan and paying, so Stripe checkout takes the money and there is nothing to start. */
export const isSelfServe = (a: RosterioAccount): boolean => a.pricingSource === 'plan' && a.isActive && !a.isTrial

/** A managed (custom contract) account with no running billing: the one Rosterio can start billing for. */
export const isNotBilled = (a: RosterioAccount): boolean => a.pricingSource === 'custom' && (!a.billingState || a.billingState === 'stopped')

/** Whether an account has a failed payment, retrying or not. */
export const isFailing = (c: AccountCollection | undefined): boolean => c?.key === 'failed-final' || c?.key === 'retrying'

/**
 * The Billing column on Customers › Rosterio (Rosterio admins). An account with invoices reads from them: its worst open
 * state with the amount owing, or Paid up. Without invoices it reads from the billing state. The list knows only the billing
 * state, not the first bill's date, so a start in the future reads "Scheduled". Stopped billing outranks Paid up: nothing more is coming.
 */
export function listBillingPill(a: RosterioAccount, states: ReadonlyMap<string, AccountCollection>): Pill | null {
  const c = states.get(a.id)
  if (c && c.key !== 'paid-up') return { label: c.label, tone: c.tone, sub: `${rosMoneyOf(c.owingCents)} owing` }
  if (c && a.billingState !== 'stopped') return { label: c.label, tone: c.tone }
  if (isSelfServe(a)) return { label: 'Paid · checkout', tone: 'ok' }
  if (a.pricingSource !== 'custom') return null
  return !a.billingState || a.billingState === 'stopped' ? NOT_BILLED : STATE_PILL[a.billingState]
}
