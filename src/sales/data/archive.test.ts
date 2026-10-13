import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ME, rec, salesWorld } from '../testing/fixtures'
import { loadSales } from '../testing/load'

vi.mock('../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../api/me', () => ({ getMe: vi.fn() }))
vi.mock('./engineNudge', () => ({ nudgeEngine: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('TZ', 'UTC')
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

const deal = (id: string, over: Record<string, unknown> = {}) => rec(id, {
  name: id, title: id, businessId: 'ros', companyId: 'co1', pipelineId: 'pl1', stageId: 's1', ownerId: 'u-me', type: 'New', value: 1000, mrr: null,
  recurring: false, contractMonths: 12, close: '2026-12-01', probability: 50, forecast: 'Pipeline', source: '', contactIds: ['ct1'], primaryContact: 'ct1',
  next: '', description: '', lostReason: '', status: 'open', createdAt: '2026-10-01T09:00', stageChangedAt: '2026-10-01T09:00', lastActivity: '2026-10-01T09:00',
  closedAt: null, priority: 'Medium', fields: {}, stageHistory: [], notes: [], ...over,
})
const call = (id: string, dealId: string | null) => rec(id, { type: 'call', businessId: 'ros', actorId: 'u-me', ts: '2026-10-09T12:00', visibility: 'business', dealId, outcome: 'Connected' })
const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl1', industries: [], roles: [] })

async function setup(over: Parameters<typeof salesWorld>[0] = {}) {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({
    businesses: [ROS], deals: [deal('dl1'), deal('dl2')], activities: [call('a1', 'dl1'), call('a2', 'dl2'), call('a3', null)],
    companyRels: [rec('cr1', { companyId: 'co1', businessId: 'ros', ownerId: 'u-me', status: 'Prospect', prospectStatus: '', source: '', priority: 'Medium', tags: [] })],
    ...over,
  }))
  const { Act } = await import('./Act')
  const { Q } = await import('./Q')
  const A = await import('./archive')
  return { ...m, Act, Q, A }
}

function role(m: Awaited<ReturnType<typeof setup>>, r: 'admin' | 'manager' | 'sales') {
  const u = m.store.S.users.find(x => x.id === ME.userId)
  if (!u) throw new Error('no user')
  u.super = false
  u.m = { ros: r }
  m.store.reindex()
}

describe('archiving a deal', () => {
  it('stamps who and when, and the deal leaves Q.deals for Q.archivedDeals', async () => {
    const m = await setup()
    m.Act.archiveDeal('dl1')
    expect(m.Q.deal('dl1')).toMatchObject({ archived: true, archivedAt: '2026-10-09T21:00', archivedBy: 'u-me' })
    expect(m.Q.deals().map(d => d.id)).toEqual(['dl2'])
    expect(m.Q.archivedDeals().map(d => d.id)).toEqual(['dl1'])
    expect(m.store.S.audit.at(-1)).toMatchObject({ action: 'Record archived', target: 'Deal: dl1' })
  })

  it('restore clears the stamp and puts it back where it was', async () => {
    const m = await setup()
    m.Act.archiveDeal('dl1')
    m.Act.restoreDeal('dl1')
    const d = m.Q.deal('dl1')
    expect(d?.archived).toBe(false)
    expect(d?.archivedAt).toBeUndefined()
    expect(d?.archivedBy).toBeUndefined()
    expect(d?.stageId).toBe('s1')
    expect(m.Q.deals().map(x => x.id).sort()).toEqual(['dl1', 'dl2'])
  })

  it('activity logged on an archived deal stops counting toward goals', async () => {
    const m = await setup()
    const n = () => m.Q.metric(['u-me'], 'calls', '2026-10-09T00:00', '2026-10-09T23:59', 'ros')
    expect(n()).toBe(3)
    m.Act.archiveDeal('dl1')
    expect(n()).toBe(2)
    expect(m.A.onArchivedDeal({ dealId: 'dl1' })).toBe(true)
    expect(m.A.onArchivedDeal({ dealId: null })).toBe(false)
  })

  it('countableActs drops activity on an archived deal and simulated activity, the same set every screen counts', async () => {
    const m = await setup({
      activities: [call('a1', 'dl1'), call('a2', 'dl2'), call('a3', null), rec('a4', { type: 'meeting_booked', businessId: 'ros', actorId: 'u-me', ts: '2026-10-09T12:00', visibility: 'business', dealId: 'dl2', simulated: true })],
    })
    const ids = () => m.A.countableActs(m.store.S.activities).map(a => a.id).sort()
    expect(ids()).toEqual(['a1', 'a2', 'a3'])
    m.Act.archiveDeal('dl1')
    expect(ids()).toEqual(['a2', 'a3'])
  })

  it('only admins of the business may archive or restore deals and sequences', async () => {
    const m = await setup()
    const d = m.Q.deal('dl1')
    const s = m.Q.seq('sq1')
    if (!d || !s) throw new Error('fixture')
    role(m, 'manager')
    expect(m.A.canArchive('deal', d)).toBe(false)
    expect(m.A.canArchive('sequence', s)).toBe(false)
    expect(m.A.whoMay('deal', d)).toBe('An admin of Rosterio')
    role(m, 'admin')
    expect(m.A.canArchive('deal', d)).toBe(true)
    expect(m.A.canArchive('sequence', s)).toBe(true)
  })
})

describe('archiving a contact', () => {
  it('counts and stops live enrolments; restoring does not restart them', async () => {
    const m = await setup()
    expect(m.A.stoppableEnrolments('ct1')).toBe(1)
    m.Act.archiveContact('ct1')
    expect(m.Q.contact('ct1')?.archived).toBe(true)
    expect(m.Q.enrol('en1')).toMatchObject({ status: 'removed', reason: 'Contact archived' })
    expect(m.Q.archivedContacts().map(c => c.id)).toEqual(['ct1'])
    m.Act.restoreContact('ct1')
    expect(m.Q.contact('ct1')?.archived).toBe(false)
    expect(m.Q.enrol('en1')?.status).toBe('removed')
    expect(m.store.S.audit.at(-1)).toMatchObject({ action: 'Record restored', target: 'Contact: Sam Buyer' })
  })

  it('a sales rep with edit access may archive and restore companies and contacts', async () => {
    const m = await setup()
    role(m, 'sales')
    const ct = m.Q.contact('ct1')
    const co = m.Q.company('co1')
    if (!ct || !co) throw new Error('fixture')
    expect(m.A.canArchive('contact', ct)).toBe(true)
    expect(m.A.canArchive('company', co)).toBe(true)
  })

  it('companies restore too', async () => {
    const m = await setup()
    m.Act.archiveCompany('co1')
    expect(m.Q.archivedCompanies().map(c => c.id)).toEqual(['co1'])
    m.Act.restoreCompany('co1')
    expect(m.Q.company('co1')?.archived).toBe(false)
    expect(m.Q.archivedCompanies()).toEqual([])
  })
})

describe('archiving a sequence', () => {
  it('sets the flag and status archived; restore brings it back paused when it has enrolments', async () => {
    const m = await setup()
    m.Act.archiveSequence('sq1')
    const s = m.Q.seq('sq1')
    expect(s).toMatchObject({ archived: true, status: 'archived', archivedBy: 'u-me', archivedAt: '2026-10-09T21:00' })
    if (!s) throw new Error('fixture')
    expect(m.A.seqArchived(s)).toBe(true)
    m.Act.restoreSequence('sq1')
    expect(m.Q.seq('sq1')).toMatchObject({ archived: false, status: 'paused' })
  })

  it('a sequence nobody was enrolled in comes back as a draft', async () => {
    const m = await setup({ enrolments: [] })
    m.Act.archiveSequence('sq1')
    m.Act.restoreSequence('sq1')
    expect(m.Q.seq('sq1')?.status).toBe('draft')
  })

  it('a sequence archived before the flag existed (status only) still reads as archived and restores', async () => {
    const m = await setup()
    const s = m.Q.seq('sq1')
    if (!s) throw new Error('fixture')
    s.status = 'archived'
    expect(m.A.seqArchived(s)).toBe(true)
    expect(m.A.isArchived('sequence', s)).toBe(true)
    m.Act.restoreSequence('sq1')
    expect(m.Q.seq('sq1')).toMatchObject({ archived: false, status: 'paused' })
  })
})
