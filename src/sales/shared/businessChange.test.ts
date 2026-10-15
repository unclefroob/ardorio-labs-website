import { describe, expect, it } from 'vitest'
import type { BusinessId, CompanyRel, Contact, ContactRel, Deal, Enrolment } from '../data/types'
import { businessCounts, planBusinessChange, type BizData } from './businessChange'

const crel = (id: string, companyId: string, businessId: BusinessId): CompanyRel => ({ id, companyId, businessId, ownerId: 'u', status: 'Prospecting', prospectStatus: '', source: '', priority: 'Medium', tags: [], createdAt: '' })
const xrel = (id: string, contactId: string, businessId: BusinessId): ContactRel => ({ id, contactId, businessId, ownerId: 'u', leadStatus: 'New', qualification: '', influence: '', priority: 'Medium', lastActivity: null, eligible: true, tags: [] } as ContactRel)
const person = (id: string, companyId: string, archived = false): Contact => ({ id, companyId, name: id, archived } as Contact)
const deal = (id: string, companyId: string, businessId: BusinessId, status = 'open'): Deal => ({ id, companyId, businessId, status } as Deal)
const seq = (contactId: string, businessId: BusinessId, status = 'active'): Enrolment => ({ id: 'e' + contactId, contactId, businessId, status } as Enrolment)

const data = (over: Partial<BizData> = {}): BizData => ({
  companyRels: [crel('r1', 'c1', 'ros'), crel('r2', 'c1', 'adv'), crel('r3', 'c2', 'ros'), crel('r4', 'c2', 'adv'), crel('r5', 'c3', 'ros')],
  contactRels: [xrel('x1', 'p1', 'ros'), xrel('x2', 'p1', 'adv'), xrel('x3', 'p2', 'ros'), xrel('x4', 'p2', 'adv'), xrel('x5', 'p3', 'ros')],
  contacts: [person('p1', 'c1'), person('p2', 'c2'), person('p3', 'c3'), person('p4', 'c3', true)],
  deals: [], enrolments: [], canEdit: () => true, ...over,
})

describe('planning a business change', () => {
  it('adds a business to every company without it, and to their contacts when asked', () => {
    const p = planBusinessChange({ companyIds: ['c1', 'c2', 'c3'], add: ['ard'], remove: [], withContacts: true }, data())
    expect(p.addCo.map(x => x.companyId)).toEqual(['c1', 'c2', 'c3'])
    expect(p.addCt.map(x => x.contactId)).toEqual(['p1', 'p2', 'p3'])
    expect(p.removeCo).toEqual([])
  })
  it('skips an archived contact, and a company or contact that already has the business', () => {
    const p = planBusinessChange({ companyIds: ['c1', 'c3'], add: ['adv'], remove: [], withContacts: true }, data())
    expect(p.addCo.map(x => x.companyId)).toEqual(['c3'])
    expect(p.addCt.map(x => x.contactId)).toEqual(['p3'])
  })
  it('adds only to the companies when the contacts are left out', () => {
    const p = planBusinessChange({ companyIds: ['c1'], add: ['ard'], remove: [], withContacts: false }, data())
    expect(p.addCo).toHaveLength(1)
    expect(p.addCt).toEqual([])
  })
  it('removes a business and the contacts that follow, never a business the company is not in', () => {
    const p = planBusinessChange({ companyIds: ['c1', 'c3'], add: [], remove: ['adv'], withContacts: false }, data())
    expect(p.removeCo.map(x => x.relId)).toEqual(['r2'])
    expect(p.removeCt.map(x => x.relId)).toEqual(['x2'])
  })
  it('refuses to remove a business where the company has an open deal, and keeps its contacts there too', () => {
    const p = planBusinessChange({ companyIds: ['c1', 'c2'], add: [], remove: ['adv'], withContacts: true }, data({ deals: [deal('d1', 'c1', 'adv')] }))
    expect(p.blocked).toEqual([{ companyId: 'c1', businessId: 'adv', reason: 'Open deal' }])
    expect(p.removeCo.map(x => x.companyId)).toEqual(['c2'])
    expect(p.removeCt.map(x => x.contactId)).toEqual(['p2'])
  })
  it('does not count a closed deal, or an open deal in another business', () => {
    const p = planBusinessChange({ companyIds: ['c1'], add: [], remove: ['adv'], withContacts: true }, data({ deals: [deal('d1', 'c1', 'adv', 'won'), deal('d2', 'c1', 'ros')] }))
    expect(p.blocked).toEqual([])
    expect(p.removeCo).toHaveLength(1)
  })
  it('refuses to remove a business where a contact is in a live sequence, but not where it is finished', () => {
    const live = planBusinessChange({ companyIds: ['c1'], add: [], remove: ['adv'], withContacts: true }, data({ enrolments: [seq('p1', 'adv')] }))
    expect(live.blocked).toEqual([{ companyId: 'c1', businessId: 'adv', reason: 'Contact in a sequence' }])
    expect(live.removeCo).toEqual([])
    const ended = planBusinessChange({ companyIds: ['c1'], add: [], remove: ['adv'], withContacts: true }, data({ enrolments: [seq('p1', 'adv', 'completed')] }))
    expect(ended.removeCo).toHaveLength(1)
  })
  it('will not touch a business the person cannot edit', () => {
    const p = planBusinessChange({ companyIds: ['c1'], add: ['ard'], remove: ['adv'], withContacts: true }, data({ canEdit: b => b !== 'ard' }))
    expect(p.blocked).toEqual([{ companyId: 'c1', businessId: 'ard', reason: 'No edit access' }])
    expect(p.addCo).toEqual([])
    expect(p.removeCo).toHaveLength(1)
  })
  it('counts how many of the selected companies are in each business', () => {
    expect(businessCounts(['c1', 'c2', 'c3'], data().companyRels, ['ros', 'adv', 'ard'])).toEqual([
      { businessId: 'ros', on: 3, total: 3 }, { businessId: 'adv', on: 2, total: 3 }, { businessId: 'ard', on: 0, total: 3 },
    ])
  })
})
