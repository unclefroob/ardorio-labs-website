import { describe, expect, it } from 'vitest'
import type { Deal } from '../data/types'
import { dealCandidates } from './dealLink'

const deal = (id: string, o: Partial<Deal> = {}): Deal => ({
  id, name: id, title: id, businessId: 'ros', companyId: 'co9', contactIds: [], status: 'open', lastActivity: '2026-10-01T00:00', archived: false, ...o,
} as unknown as Deal)
const t = { businessId: 'ros' as const, contactId: 'ct1', companyId: 'co1', dealId: null }

describe('which deals a conversation could be linked to', () => {
  it('puts the same contact first, then the same company, then the rest; open before closed; newest first', () => {
    const ds = [
      deal('other-old', { lastActivity: '2026-09-01T00:00' }), deal('other-new', { lastActivity: '2026-10-05T00:00' }),
      deal('company', { companyId: 'co1' }), deal('contact', { contactIds: ['ct1'] }), deal('company-won', { companyId: 'co1', status: 'won' }),
    ]
    expect(dealCandidates(t, ds).map(c => [c.deal.id, c.why])).toEqual([
      ['contact', 'contact'], ['company', 'company'], ['company-won', 'company'], ['other-new', 'other'], ['other-old', 'other'],
    ])
  })

  it('never offers another business\'s deal, an archived one, or the one already linked', () => {
    const ds = [deal('a', { businessId: 'ard' }), deal('b', { archived: true }), deal('c'), deal('d')]
    expect(dealCandidates({ ...t, dealId: 'd' }, ds).map(c => c.deal.id)).toEqual(['c'])
  })

  it('searches deal names and company names, and caps the list', () => {
    const ds = Array.from({ length: 20 }, (_, i) => deal('deal' + i, { name: 'Roster ' + i, companyId: i === 3 ? 'coX' : 'co9' }))
    expect(dealCandidates(t, ds)).toHaveLength(8)
    expect(dealCandidates(t, ds, { limit: 3 })).toHaveLength(3)
    expect(dealCandidates(t, ds, { query: 'roster 1' }).every(c => c.deal.name.toLowerCase().includes('roster 1'))).toBe(true)
    expect(dealCandidates(t, ds, { query: 'zebra corp', companyName: id => (id === 'coX' ? 'Zebra Corp' : 'Other') }).map(c => c.deal.id)).toEqual(['deal3'])
  })
})
