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

describe('Act.saveIntel: empty and repeat results', () => {
  it('stamps both ts and checkedAt on a first save', async () => {
    const m = await setup()
    const r = m.Act.saveIntel({ ...base, kind: 'signals', items: [sig('One')] })
    expect(r?.ts).toBe('2026-10-09T10:00:00.000Z')
    expect(r?.checkedAt).toBe('2026-10-09T10:00:00.000Z')
  })

  it('a successful lookup that finds nothing keeps the earlier items and only moves checkedAt', async () => {
    const m = await setup()
    m.Act.saveIntel({ ...base, kind: 'signals', items: [sig('One'), sig('Two')], sources: [{ title: 'Site', url: 'https://acme.test/' }] })
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'))
    const r = m.Act.saveIntel({ ...base, kind: 'signals', items: [], sources: [] })
    expect(m.store.S.intel).toHaveLength(1)
    expect(r?.items).toHaveLength(2)
    expect(r?.ts).toBe('2026-10-09T10:00:00.000Z')
    expect(r?.checkedAt).toBe('2026-10-20T10:00:00.000Z')
    expect(r?.sources).toHaveLength(1)
  })

  it('an empty result for a company with nothing saved still records that it was checked', async () => {
    const m = await setup()
    const r = m.Act.saveIntel({ ...base, kind: 'tech', items: [] })
    expect(r?.items).toEqual([])
    expect(m.store.S.intel).toHaveLength(1)
  })

  it('a non-empty refresh replaces the items and moves both stamps', async () => {
    const m = await setup()
    m.Act.saveIntel({ ...base, kind: 'signals', items: [sig('One')] })
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'))
    const r = m.Act.saveIntel({ ...base, kind: 'signals', items: [sig('Two')] })
    expect(r?.items.map(i => (i as { headline: string }).headline)).toEqual(['Two'])
    expect(r?.ts).toBe('2026-10-20T10:00:00.000Z')
    expect(r?.checkedAt).toBe('2026-10-20T10:00:00.000Z')
  })
})

describe('Act.reviewClosure', () => {
  const closing = (headline = 'Acme to close', sourceUrl = 'https://news.test/closing') => ({ kind: 'closure' as const, headline, sourceUrl, date: '2026-10-01' })

  it('records who answered and when, without a web lookup, and changes nothing else', async () => {
    const m = await setup()
    m.Act.saveIntel({ ...base, kind: 'signals', items: [closing(), sig('Opens 3 sites')] })
    expect(m.Act.reviewClosure('co1', 'ros', closing(), 'confirmed')).toBe(true)
    const items = m.store.S.intel[0].items as unknown as Array<Record<string, unknown>>
    expect(items[0]).toMatchObject({ review: 'confirmed', reviewedBy: m.store.S.session.userId, reviewedAt: '2026-10-09T10:00:00.000Z' })
    expect(items[1].review).toBeUndefined()
  })

  it('refuses a closure that is not saved', async () => {
    const m = await setup()
    expect(m.Act.reviewClosure('co1', 'ros', closing(), 'dismissed')).toBe(false)
    m.Act.saveIntel({ ...base, kind: 'signals', items: [sig('Opens 3 sites')] })
    expect(m.Act.reviewClosure('co1', 'ros', closing(), 'dismissed')).toBe(false)
  })

  it('a refresh that reports the same closure again keeps the answer, matched by page or by headline', async () => {
    const m = await setup()
    m.Act.saveIntel({ ...base, kind: 'signals', items: [closing()] })
    m.Act.reviewClosure('co1', 'ros', closing(), 'dismissed')
    m.Act.saveIntel({ ...base, kind: 'signals', items: [closing('Acme shutting down', 'https://www.news.test/closing/')] })
    expect(m.store.S.intel[0].items[0]).toMatchObject({ review: 'dismissed' })
    m.Act.saveIntel({ ...base, kind: 'signals', items: [closing('ACME SHUTTING DOWN', 'https://other.test/x')] })
    expect(m.store.S.intel[0].items[0]).toMatchObject({ review: 'dismissed' })
  })

  it('a different story starts unreviewed', async () => {
    const m = await setup()
    m.Act.saveIntel({ ...base, kind: 'signals', items: [closing()] })
    m.Act.reviewClosure('co1', 'ros', closing(), 'confirmed')
    m.Act.saveIntel({ ...base, kind: 'signals', items: [closing('Acme closes Hobart store', 'https://news.test/hobart')] })
    expect((m.store.S.intel[0].items[0] as { review?: string }).review).toBeUndefined()
  })

  it('a model-supplied review on a fresh result is not trusted over the saved answer', async () => {
    const m = await setup()
    m.Act.saveIntel({ ...base, kind: 'signals', items: [closing()] })
    m.Act.reviewClosure('co1', 'ros', closing(), 'dismissed')
    m.Act.saveIntel({ ...base, kind: 'signals', items: [{ ...closing(), review: 'confirmed' as const }] })
    expect(m.store.S.intel[0].items[0]).toMatchObject({ review: 'dismissed' })
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
