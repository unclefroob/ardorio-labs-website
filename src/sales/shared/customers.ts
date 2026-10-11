import type { BusinessId, RosterioAccount } from '../api/contract'
import type { Company, Deal } from '../data/types'
import { standing, type AccountStanding } from '../data/rosterio'

export type RosterioTab = 'paid' | 'trials' | 'ended' | 'needs'
export const ROSTERIO_TABS: readonly RosterioTab[] = ['paid', 'trials', 'ended', 'needs']
export const isRosterioTab = (v: unknown): v is RosterioTab => ROSTERIO_TABS.includes(v as RosterioTab)

/** Which status tab an account belongs to. "Needs linking" is not a status: any account without a CRM company also appears there. */
export function statusTab(st: AccountStanding): Exclude<RosterioTab, 'needs'> {
  if (st.kind === 'paid') return 'paid'
  if (st.kind === 'trial') return 'trials'
  return 'ended'
}

export const accountTab = (a: RosterioAccount, now: number = Date.now()): Exclude<RosterioTab, 'needs'> => statusTab(standing(a, now))

/** Whole days until a trial ends, or undefined when the account is not on a running trial. */
export const trialDaysLeft = (st: AccountStanding): number | undefined => (st.kind === 'trial' ? st.days : undefined)

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
