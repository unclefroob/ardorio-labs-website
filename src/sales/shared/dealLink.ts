import type { Deal, Thread } from '../data/types'

// Which deals an email conversation could be linked to: deals of the conversation's own business (a thread never links across businesses),
// not archived, best matches first: the same contact, then the same company, then anything else; open before closed; most recent first.
export interface DealChoice { deal: Deal; why: 'contact' | 'company' | 'other' }

export function dealCandidates(
  t: Pick<Thread, 'businessId' | 'contactId' | 'companyId' | 'dealId'>,
  deals: readonly Deal[],
  opts: { query?: string; limit?: number; companyName?: (id: string) => string } = {},
): DealChoice[] {
  const q = (opts.query ?? '').trim().toLowerCase()
  const rank = (c: DealChoice): number => (c.why === 'contact' ? 0 : c.why === 'company' ? 1 : 2)
  return deals
    .filter(d => d.businessId === t.businessId && d.archived !== true && d.id !== t.dealId)
    .map((deal): DealChoice => ({
      deal,
      why: t.contactId && deal.contactIds?.includes(t.contactId) ? 'contact' : t.companyId && deal.companyId === t.companyId ? 'company' : 'other',
    }))
    .filter(c => !q || `${c.deal.name} ${c.deal.title} ${opts.companyName?.(c.deal.companyId) ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => rank(a) - rank(b)
      || Number(b.deal.status === 'open') - Number(a.deal.status === 'open')
      || String(b.deal.lastActivity ?? '').localeCompare(String(a.deal.lastActivity ?? '')))
    .slice(0, opts.limit ?? 8)
}
