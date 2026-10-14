import type { BusinessId, RosterioAccount } from '../api/contract'
import type { Company, Deal } from '../data/types'
import { standing, type AccountStanding } from '../data/rosterio'

export type RosterioTab = 'paid' | 'trials' | 'ended' | 'needs' | 'test'
export const ROSTERIO_TABS: readonly RosterioTab[] = ['paid', 'trials', 'ended', 'needs', 'test']
export const isRosterioTab = (v: unknown): v is RosterioTab => ROSTERIO_TABS.includes(v as RosterioTab)

/** Which status tab an account belongs to. "Needs linking" is not a status: any account without a CRM company also appears there. */
export function statusTab(st: AccountStanding): Exclude<RosterioTab, 'needs'> {
  if (st.kind === 'paid') return 'paid'
  if (st.kind === 'trial') return 'trials'
  return 'ended'
}

const NO_TESTS: ReadonlySet<string> = new Set()

/**
 * The one tab an account belongs to. A test account (settings/rosterioTest) goes to Test accounts and nowhere else,
 * whatever its standing, so no customer count or revenue figure built from the other tabs ever includes it.
 */
export const accountTab = (a: RosterioAccount, now: number = Date.now(), test: ReadonlySet<string> = NO_TESTS): Exclude<RosterioTab, 'needs'> =>
  test.has(a.id) ? 'test' : statusTab(standing(a, now))

/** The accounts that count as customers: every one that is not a test account. */
export const customerAccounts = <T extends RosterioAccount>(accounts: readonly T[], test: ReadonlySet<string>): T[] => accounts.filter(a => !test.has(a.id))

/** Paying customers, test accounts left out: the count on the Customers product toggle and the Paying customers tile. */
export const payingCount = (accounts: readonly RosterioAccount[], test: ReadonlySet<string>, now: number = Date.now()): number =>
  accounts.filter(a => accountTab(a, now, test) === 'paid').length

/** Whole days until a trial ends, or undefined when the account is not on a running trial. */
export const trialDaysLeft = (st: AccountStanding): number | undefined => (st.kind === 'trial' ? st.days : undefined)

/** A usable price: the server sent a finite, non-negative monthly cost. Anything else is treated as "no price returned". */
export const isPriced = (a: RosterioAccount): a is RosterioAccount & { monthlyCost: number } =>
  typeof a.monthlyCost === 'number' && Number.isFinite(a.monthlyCost) && a.monthlyCost >= 0

export interface Mrr {
  /** Dollars per month, summed over the paying accounts that came with a price. */
  total: number
  /** Paying accounts with a price. */
  priced: number
  /** Paying accounts in all. */
  paying: number
}

/**
 * Monthly recurring revenue across the paying accounts, from the cost Rosterio itself returned.
 * Undefined when no account has a price (not an admin, or Rosterio not yet returning it): nothing is estimated.
 */
export function mrrOf(paying: readonly RosterioAccount[]): Mrr | undefined {
  const priced = paying.filter(isPriced)
  if (!priced.length) return undefined
  return { total: priced.reduce((n, a) => n + a.monthlyCost, 0), priced: priced.length, paying: paying.length }
}

export interface WonCustomer {
  company: Company
  /** Most recent won deal. */
  deal: Deal
  wonOn: string
  value: number
  deals: number
}

export const wonDate = (d: Deal): string => d.closedAt ?? d.stageChangedAt

/**
 * Customers of one business that has no account feed: companies with at least one won deal in it.
 * Archived companies and deals of other businesses never count. Newest win first.
 */
export function wonCustomers(deals: readonly Deal[], companies: readonly Company[], business: BusinessId): WonCustomer[] {
  const byId = new Map(companies.map(c => [c.id, c] as const))
  const out = new Map<string, WonCustomer>()
  for (const d of deals) {
    if (d.businessId !== business || d.status !== 'won') continue
    const company = byId.get(d.companyId)
    if (!company || company.archived) continue
    const on = wonDate(d)
    const cur = out.get(company.id)
    if (!cur) out.set(company.id, { company, deal: d, wonOn: on, value: d.value || 0, deals: 1 })
    else {
      cur.value += d.value || 0
      cur.deals += 1
      if (on > cur.wonOn) { cur.deal = d; cur.wonOn = on }
    }
  }
  return [...out.values()].sort((a, b) => b.wonOn.localeCompare(a.wonOn))
}

/** Won deals of a business closed since the start of the calendar quarter containing `now`. */
export function wonThisQuarter(deals: readonly Deal[], companies: readonly Company[], business: BusinessId, now: Date = new Date()): number {
  const start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).getTime()
  const live = new Set(companies.filter(c => !c.archived).map(c => c.id))
  return deals.filter(d => d.businessId === business && d.status === 'won' && live.has(d.companyId) && Date.parse(wonDate(d)) >= start).length
}

/** The product the page opens on: an explicit choice if the viewer belongs to it, else the workspace they are in, else the first. */
export function defaultProduct(mine: readonly BusinessId[], picked: unknown, workspace: BusinessId | null): BusinessId | undefined {
  if (typeof picked === 'string' && (mine as readonly string[]).includes(picked)) return picked as BusinessId
  if (workspace && mine.includes(workspace)) return workspace
  return mine[0]
}
