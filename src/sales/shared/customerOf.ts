import type { Company, CompanyRel, Deal } from '../data/types'
import type { RosterioLink } from '../api/contract'

/**
 * Is this company a paying customer of this business, and why. SalesOS has no separate account record: a customer is a company that is
 * marked Customer for the business, or has a won deal there, or (Rosterio) has a live account that is not a trial.
 */
export interface CustomerStanding { customer: boolean; why: string }

export function customerOf(
  c: Pick<Company, 'id'> | undefined, businessId: string, o: { deals: readonly Deal[]; rel?: Pick<CompanyRel, 'status'>; rosterio?: RosterioLink },
): CustomerStanding {
  if (!c) return { customer: false, why: '' }
  const won = o.deals.filter(d => d.companyId === c.id && d.businessId === businessId && d.status === 'won' && d.archived !== true)
  if (businessId === 'ros' && o.rosterio?.state === 'provisioned') {
    if (o.rosterio.isTrial) return { customer: false, why: 'On a Rosterio trial' }
    return { customer: true, why: `Rosterio account${o.rosterio.plan ? ` (${o.rosterio.plan})` : ''}` }
  }
  if (won.length) return { customer: true, why: won.length === 1 ? `Won: ${won[0].name}` : `${won.length} won deals` }
  if (o.rel?.status === 'Customer') return { customer: true, why: 'Marked as a customer' }
  return { customer: false, why: '' }
}
