import type { RosterioAccount } from '../api/contract'
import type { Deal } from '../data/types'
import { accountTab, mrrOf, type Mrr } from './customers'

// The dashboard's subscription ARR. Won subscription deals carry a value; Rosterio also reports its own live customers with a price,
// which the deals do not hold. Where Rosterio's prices are available they are the source for Rosterio, and Rosterio's won deals are
// left out so the same customer is never counted twice. Nothing is estimated: no prices, no account figure.

export interface SubscriptionArr {
  /** Dollars a year. */
  total: number
  /** From won recurring deals (Rosterio's left out when its accounts supply the figure). */
  fromDeals: number
  /** From Rosterio's paying accounts: twelve months of the monthly cost they came with. 0 when not used. */
  fromAccounts: number
  /** Paying Rosterio accounts that came with a price, and all that are paying; both 0 when accounts are not used. */
  priced: number
  paying: number
  /** Dollars a year by business: Rosterio's from its accounts when they are used, every business's from its won recurring deals otherwise. */
  byBusiness: Record<string, number>
  /** Rosterio is in view but its accounts are not used, and why. */
  rosterioNote: 'filtered' | 'no-prices' | null
}

/** The paying accounts (test accounts left out) of a Rosterio account list, as the customers page counts them. */
export const payingAccounts = (accounts: readonly RosterioAccount[], tests: ReadonlySet<string>, now: number = Date.now()): RosterioAccount[] =>
  accounts.filter(a => accountTab(a, now, tests) === 'paid')

export function subscriptionArr(o: {
  /** The deals in view (already narrowed by the owner, team and source filters). */
  deals: readonly Deal[]
  rosterioInView: boolean
  /** Paying Rosterio accounts, when they have been read; undefined while they have not or cannot be. */
  paying?: readonly RosterioAccount[]
  /** An owner, team, source or Mine filter is on: accounts have no owner, so they cannot follow it. */
  filtered: boolean
}): SubscriptionArr {
  const mrr: Mrr | undefined = o.rosterioInView && !o.filtered && o.paying ? mrrOf(o.paying) : undefined
  // Rosterio's own prices are the only source for Rosterio when it is in view and unfiltered: with no prices it is left out and says so,
  // rather than being half-counted from whichever of its deals happen to be won.
  const leaveRosterioOut = o.rosterioInView && !o.filtered && !mrr
  const byBusiness: Record<string, number> = {}
  for (const d of o.deals) {
    if (d.status !== 'won' || !d.recurring) continue
    if (d.businessId === 'ros' && (mrr || leaveRosterioOut)) continue
    byBusiness[d.businessId] = (byBusiness[d.businessId] ?? 0) + (d.value || 0)
  }
  const fromDeals = Object.values(byBusiness).reduce((a, n) => a + n, 0)
  if (mrr) {
    const fromAccounts = mrr.total * 12
    byBusiness.ros = fromAccounts
    return { total: fromDeals + fromAccounts, fromDeals, fromAccounts, priced: mrr.priced, paying: mrr.paying, byBusiness, rosterioNote: null }
  }
  return { total: fromDeals, fromDeals, fromAccounts: 0, priced: 0, paying: 0, byBusiness, rosterioNote: !o.rosterioInView ? null : o.filtered ? 'filtered' : 'no-prices' }
}
