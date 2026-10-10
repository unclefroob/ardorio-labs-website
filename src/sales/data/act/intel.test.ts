import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTACT, rec, salesWorld } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../engineNudge', () => ({ nudgeEngine: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
})
afterEach(() => vi.useRealTimers())

const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: '', industries: [], roles: [] })

async function setup() {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({
    businesses: [ROS],
    companies: [rec('co1', { name: 'Acme', tags: [], tech: ['Xero'], notes: [], industry: '', subindustry: '', hq: '', state: '' })],
    contacts: [rec('ct1', { ...CONTACT, companyId: 'co1' })],
  }))
  const { Act } = await import('../Act')
  const { Q } = await import('../Q')
  return { ...m, Act, Q }
}

const base = { companyId: 'co1', businessId: 'ros' as const, provider: 'xai' as const, model: 'grok', sources: [{ title: 'Site', url: 'https://acme.test/' }], disclaimer: 'd' }
const sig = (headline: string) => ({ kind: 'expansion' as const, headline, sourceUrl: 'https://acme.test/n', date: '2026-10-01' })

describe('Act.saveIntel', () => {
  it('writes one record per company, business and kind, under the agreed id', async () => {
    const m = await setup()
    const r = m.Act.saveIntel({ ...base, kind: 'signals', items: [sig('Opens 3 sites')] })
    expect(r?.id).toBe('in_co1_ros_signals')
    expect(m.store.S.intel).toHaveLength(1)
    expect(m.store.S.intel[0]).toMatchObject({ businessId: 'ros', companyId: 'co1', kind: 'signals', by: m.store.S.session.userId, provider: 'xai', model: 'grok' })
    expect(m.Q.intel('co1', 'signals', 'ros')?.items).toHaveLength(1)
  })

  it('a refresh replaces the record instead of adding another', async () => {
    const m = await setup()
    m.Act.saveIntel({ ...base, kind: 'signals', items: [sig('One')] })
    vi.setSystemTime(new Date('2026-10-10T10:00:00Z'))
    m.Act.saveIntel({ ...base, kind: 'signals', items: [sig('Two'), sig('Three')] })
    expect(m.store.S.intel).toHaveLength(1)
    expect(m.store.S.intel[0].items).toHaveLength(2)
    expect(m.store.S.intel[0].ts).toBe('2026-10-10T10:00:00.000Z')
  })

  it('keeps signals, tech and contact as separate records', async () => {
    const m = await setup()
    m.Act.saveIntel({ ...base, kind: 'signals', items: [] })
    m.Act.saveIntel({ ...base, kind: 'tech', items: [] })
    m.Act.saveIntel({ ...base, kind: 'contact', items: [] })
    expect(m.store.S.intel.map(i => i.id).sort()).toEqual(['in_co1_ros_contact', 'in_co1_ros_signals', 'in_co1_ros_tech'])
  })

  it('does not touch the company', async () => {
    const m = await setup()
    const before = JSON.stringify(m.Q.company('co1'))
    m.Act.saveIntel({ ...base, kind: 'contact', items: [{ field: 'phone', value: '03 9000 0000', sourceUrl: 'https://acme.test/contact' }] })
    expect(JSON.stringify(m.Q.company('co1'))).toBe(before)
  })

  it('ignores a company that is not in the CRM', async () => {
    const m = await setup()
    expect(m.Act.saveIntel({ ...base, companyId: 'nope', kind: 'signals', items: [] })).toBeUndefined()
    expect(m.store.S.intel).toHaveLength(0)
  })

  it('moves the contact lead score through Q.score', async () => {
    const m = await setup()
    const before = m.Q.score('ct1', 'ros').total
    m.Act.saveIntel({ ...base, kind: 'signals', items: [sig('Opens 3 sites')] })
    const after = m.Q.score('ct1', 'ros')
    expect(after.total).toBeGreaterThan(before)
    expect(after.adjust?.parts.map(p => p.label)).toEqual(['expansion'])
  })
})

describe('Act.addKnownTech', () => {
  it('merges new names without duplicates and reports how many were new', async () => {
    const m = await setup()
    expect(m.Act.addKnownTech('co1', ['xero', 'Deputy', 'Deputy'])).toBe(1)
    expect(m.Q.company('co1')?.tech).toEqual(['Xero', 'Deputy'])
    expect(m.Act.addKnownTech('co1', ['Deputy'])).toBe(0)
  })
})
