import { rosterioAccount } from '../api/rosterio'
import type { RosterioAccount, RosterioAccountDetail } from '../api/contract'
import { useLoad, type Loaded } from './invoicing'
import { standing, type AccountStanding } from './rosterio'

// The Rosterio account page's data: one account as Rosterio has it, read live (nothing is copied into SalesOS).

export const useRosterioAccountDetail = (accountId: string): Loaded<RosterioAccountDetail> =>
  useLoad(sig => rosterioAccount(accountId, sig), `ros-account:${accountId}`)

/** The list shape `standing()` reads, from the page's detail. */
export function detailStanding(d: RosterioAccountDetail): AccountStanding {
  const a: RosterioAccount = {
    id: d.accountId, name: d.name, isActive: d.isActive, isTrial: d.isTrial, memberCount: d.memberCount,
    ...(d.status ? { status: d.status } : {}), ...(d.trialEndDate ? { trialEndDate: d.trialEndDate } : {}),
  }
  return standing(a)
}

/** The account's standing as the page words it: "Live" for a paying account, then the trial or inactive wording. */
export function standingText(st: AccountStanding): string {
  return st.kind === 'paid' ? 'Live' : st.label
}

export const ROLE_LABEL: Readonly<Record<string, string>> = { super_admin: 'Super admin', manager: 'Manager', staff: 'Staff' }
export const roleLabel = (r: string): string => ROLE_LABEL[r] ?? r
