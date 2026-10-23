import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rec, salesWorld } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../engineNudge', () => ({ nudgeEngine: vi.fn() }))

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T10:00:00Z')) })
afterEach(() => vi.useRealTimers())

const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: '', industries: [], roles: [] })
const co = (id: string, over: Record<string, unknown>) => rec(id, { name: id, hq: '', state: '', country: '', employees: null, locations: null, archived: false, ...over })

async function setup(companies: ReturnType<typeof co>[]) {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ businesses: [ROS], companies }))
  const { Act } = await import('../Act')
  return { ...m, Act }
}

describe('Act.fillCompanyFromResearch', () => {
  const found = { headOffice: 'Sydney, NSW, Australia', employees: { count: 850, basis: 'estimated' as const } }

  it('fills an empty head office and headcount', async () => {
    const m = await setup([co('co1', {})])
    expect(m.Act.fillCompanyFromResearch('co1', found)).toBe(2)
    const c = m.store.S.companies.find(x => x.id === 'co1')
    expect(c).toMatchObject({ hq: 'Sydney', state: 'NSW', country: 'Australia', employees: 850 })
  })

  it('never replaces a value that is already there', async () => {
    const m = await setup([co('co2', { hq: 'Melbourne', employees: 40 })])
    expect(m.Act.fillCompanyFromResearch('co2', found)).toBe(0)
    expect(m.store.S.companies.find(x => x.id === 'co2')).toMatchObject({ hq: 'Melbourne', state: '', employees: 40 })
  })

  it('fills only the part that is empty', async () => {
    const m = await setup([co('co3', { hq: 'Perth' })])
    expect(m.Act.fillCompanyFromResearch('co3', found)).toBe(1)
    expect(m.store.S.companies.find(x => x.id === 'co3')).toMatchObject({ hq: 'Perth', employees: 850 })
  })

  it('does nothing for an unknown company', async () => {
    const m = await setup([])
    expect(m.Act.fillCompanyFromResearch('nope', found)).toBe(0)
  })
})
