import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnrichSuggestion } from '../../api/contract'
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

async function setup(contact: Record<string, unknown> = {}, over: Parameters<typeof salesWorld>[0] = {}) {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ businesses: [ROS], contacts: [rec('ct1', { ...CONTACT, ...contact })], ...over }))
  const { Act } = await import('../Act')
  const { Q } = await import('../Q')
  return { ...m, Act, Q }
}

const pub = (field: EnrichSuggestion['field'], value: string, sourceUrl?: string): EnrichSuggestion => ({ field, value, kind: 'published', ...(sourceUrl ? { sourceUrl } : {}) })
const inf = (value: string): EnrichSuggestion => ({ field: 'email', value, kind: 'inferred', pattern: 'first.last' })

describe('Act.applyEnrichment', () => {
  it('never downgrades a Verified email when only other fields are applied', async () => {
    const m = await setup({ verification: 'Verified', verifiedAt: '2026-09-01T09:00', verifiedBy: 'u-me' })
    m.Act.applyEnrichment('ct1', [pub('mobile', '0400 000 000', 'https://acme.com/team'), pub('title', 'Head of Ops')], 'ros')
    const c = m.store.S.contacts[0]
    expect(c.verification).toBe('Verified')
    expect(c.verifiedAt).toBe('2026-09-01T09:00')
    expect(c.mobile).toBe('0400 000 000')
    expect(c.title).toBe('Head of Ops')
  })

  it('leaves a Verified email alone when the suggested email is the same address', async () => {
    const m = await setup({ verification: 'Verified' })
    m.Act.applyEnrichment('ct1', [inf('SAM@example.com')], 'ros')
    expect(m.store.S.contacts[0].verification).toBe('Verified')
  })

  it('a different published email replaces a Verified one and lands Unverified', async () => {
    const m = await setup({ verification: 'Verified', verifiedAt: '2026-09-01T09:00', verifiedBy: 'u-me' })
    m.Act.applyEnrichment('ct1', [pub('email', 'sam@acme.com', 'https://www.acme.com/team')], 'ros')
    const c = m.store.S.contacts[0]
    expect(c.email).toBe('sam@acme.com')
    expect(c.verification).toBe('Unverified')
    expect(c.verifiedAt).toBeUndefined()
    expect(c.verifiedBy).toBeUndefined()
  })

  it('sets Inferred only for an inferred email, and records provenance', async () => {
    const m = await setup({ verification: 'Unverified' })
    m.Act.applyEnrichment('ct1', [inf('sam.buyer@acme.com'), pub('phone', '03 9000 0000', 'https://acme.com/contact')], 'ros')
    const c = m.store.S.contacts[0]
    expect(c.verification).toBe('Inferred')
    expect(c.enrichment?.email).toMatchObject({ kind: 'inferred', pattern: 'first.last', by: 'u-me' })
    expect(c.enrichment?.email?.at).toBeTruthy()
    expect(c.enrichment?.phone).toMatchObject({ kind: 'published', sourceUrl: 'https://acme.com/contact' })
  })

  it('does not set Inferred or change verification when a published non-email field is applied', async () => {
    const m = await setup({ verification: 'Unverified' })
    m.Act.applyEnrichment('ct1', [pub('title', 'CEO', 'https://acme.com/about')], 'ros')
    expect(m.store.S.contacts[0].verification).toBe('Unverified')
  })

  it('a published email lands Unverified (not Verified)', async () => {
    const m = await setup({ verification: 'Inferred' })
    m.Act.applyEnrichment('ct1', [pub('email', 'sam@acme.com', 'https://acme.com/team')], 'ros')
    expect(m.store.S.contacts[0].verification).toBe('Unverified')
  })

  it('keeps the original contact source and records the cited pages in enrichment and the activity only', async () => {
    const m = await setup({ source: 'Conference list' })
    m.Act.applyEnrichment('ct1', [pub('title', 'CEO', 'https://www.acme.com/about'), pub('mobile', '0411 111 111', 'https://news.example.org/a')], 'ros')
    const c = m.store.S.contacts[0]
    expect(c.source).toBe('Conference list')
    expect(c.enrichment?.title?.sourceUrl).toBe('https://www.acme.com/about')
    expect(c.enrichment?.mobile?.sourceUrl).toBe('https://news.example.org/a')
    const a = m.store.S.activities.find(x => x.type === 'enriched')
    expect(a?.subject).toBe('Contact enriched (Grok)')
    expect(a?.desc).toContain('https://www.acme.com/about')
    expect(a?.desc).toContain('https://news.example.org/a')
  })

  it('drops non-http source URLs from provenance', async () => {
    const m = await setup()
    m.Act.applyEnrichment('ct1', [pub('title', 'CEO', 'javascript:alert(1)')], 'ros')
    expect(m.store.S.contacts[0].enrichment?.title?.sourceUrl).toBeUndefined()
  })

  it('caps the applied-results log at 100, newest first', async () => {
    const m = await setup()
    for (let i = 0; i < 105; i++) m.Act.applyEnrichment('ct1', [pub('title', `Title ${i}`)], 'ros')
    const h = m.store.S.wiza.history
    expect(h).toHaveLength(100)
    expect(h[0].result).toContain('title')
    m.Act.enrichLog('Lookup failed', 'cap reached')
    expect(m.store.S.wiza.history).toHaveLength(100)
    expect(m.store.S.wiza.history[0]).toMatchObject({ action: 'Lookup failed', result: 'cap reached' })
  })
})

describe('Q.eligibility with verification', () => {
  it('hard-blocks an Inferred email and does not also warn', async () => {
    const m = await setup({ verification: 'Inferred' }, { enrolments: [] })
    const el = m.Q.eligibility('ct1', 'sq1')
    expect(el.blocks).toContain('Email is inferred, not verified — mark it verified first')
    expect(el.warns).not.toContain('Email not verified')
    expect(m.Act.enrol(['ct1'], 'sq1').skipped).toMatchObject([{ id: 'ct1', why: 'Email is inferred, not verified — mark it verified first' }])
  })

  it('only warns for a plain Unverified email', async () => {
    const m = await setup({ verification: 'Unverified' })
    const el = m.Q.eligibility('ct1', 'sq1')
    expect(el.blocks.filter(b => /inferred/i.test(b))).toHaveLength(0)
    expect(el.warns).toContain('Email not verified')
  })

  it('Inferred earns no verification points in the score', async () => {
    const m = await setup({ verification: 'Inferred' })
    expect(m.Q.score('ct1', 'ros').missing).toContain('Email verification')
  })
})

describe('Act.markVerified', () => {
  it('records who and when, lifts the block, and writes an activity', async () => {
    const m = await setup({ verification: 'Inferred' })
    m.Act.markVerified('ct1')
    const c = m.store.S.contacts[0]
    expect(c.verification).toBe('Verified')
    expect(c.verifiedBy).toBe('u-me')
    expect(c.verifiedAt).toMatch(/^2026-10-09T/)
    expect(m.store.S.activities.some(a => a.type === 'verified' && a.contactId === 'ct1')).toBe(true)
    expect(m.Q.eligibility('ct1', 'sq1').blocks.filter(b => /inferred/i.test(b))).toHaveLength(0)
  })

  it('audits when the email came from a pattern', async () => {
    const m = await setup({ verification: 'Inferred', enrichment: { email: { kind: 'inferred', pattern: 'first.last', at: '2026-10-01T09:00', by: 'u-me' } } })
    m.Act.markVerified('ct1')
    expect(m.store.S.audit.some(a => a.action === 'Inferred email verified')).toBe(true)
  })

  it('updateContact stamps verifiedBy/At when verification changes to Verified, and clears them when it leaves', async () => {
    const m = await setup({ verification: 'Unverified' })
    m.Act.updateContact('ct1', { verification: 'Verified' })
    expect(m.store.S.contacts[0]).toMatchObject({ verification: 'Verified', verifiedBy: 'u-me' })
    const at = m.store.S.contacts[0].verifiedAt
    m.Act.updateContact('ct1', { verification: 'Verified' })
    expect(m.store.S.contacts[0].verifiedAt).toBe(at)
    m.Act.updateContact('ct1', { verification: 'Invalid' })
    expect(m.store.S.contacts[0].verifiedAt).toBeUndefined()
  })
})

describe('Act.updateContact drops stale enrichment provenance', () => {
  const stamp = (kind: 'published' | 'inferred' = 'published') => ({ kind, sourceUrl: 'https://acme.com/team', at: '2026-10-01T09:00', by: 'u-me' })
  const all = { email: stamp('inferred'), email2: stamp(), phone: stamp(), mobile: stamp(), title: stamp(), linkedin: stamp() }

  it('removes only the enrichment entry of each field the patch changes', async () => {
    const m = await setup({ phone: '03 9000 0000', mobile: '0400 000 000', title: 'Director', linkedin: 'https://www.linkedin.com/in/sam', enrichment: all })
    m.Act.updateContact('ct1', { phone: '03 9111 1111', title: 'CEO', mobile: '0400 000 000' })
    const e = m.store.S.contacts[0].enrichment
    expect(e?.phone).toBeUndefined()
    expect(e?.title).toBeUndefined()
    expect(e?.mobile).toBeDefined()   // same value resubmitted: still the Grok value
    expect(e?.email).toBeDefined()
    expect(e?.email2).toBeDefined()
    expect(e?.linkedin).toBeDefined()
  })

  it('drops enrichment entirely once every entry is gone', async () => {
    const m = await setup({ title: 'Director', enrichment: { title: stamp() } })
    m.Act.updateContact('ct1', { title: 'CEO' })
    expect(m.store.S.contacts[0].enrichment).toBeUndefined()
  })

  it('handles email2 and linkedin changes', async () => {
    const m = await setup({ linkedin: 'https://www.linkedin.com/in/sam', enrichment: all })
    m.Act.updateContact('ct1', { email2: 'other@example.com', linkedin: 'https://www.linkedin.com/in/someone-else' })
    const e = m.store.S.contacts[0].enrichment
    expect(e?.email2).toBeUndefined()
    expect(e?.linkedin).toBeUndefined()
    expect(e?.email).toBeDefined()
    expect(m.store.S.contacts[0].verification).toBe('Verified')   // only the primary email resets verification
  })

  it('a hand-typed email clears its enrichment and verification stamps, and lands Unverified', async () => {
    const m = await setup({ verification: 'Verified', verifiedBy: 'u-me', verifiedAt: '2026-09-01T09:00', enrichment: all })
    m.Act.updateContact('ct1', { email: 'new@example.com' })
    const c = m.store.S.contacts[0]
    expect(c.enrichment?.email).toBeUndefined()
    expect(c.verification).toBe('Unverified')
    expect(c.verifiedBy).toBeUndefined()
    expect(c.verifiedAt).toBeUndefined()
  })

  it('an email change that also sets verification keeps what the patch says', async () => {
    const m = await setup({ verification: 'Inferred', enrichment: all })
    m.Act.updateContact('ct1', { email: 'new@example.com', verification: 'Verified' })
    const c = m.store.S.contacts[0]
    expect(c.verification).toBe('Verified')
    expect(c.verifiedBy).toBe('u-me')
    expect(c.enrichment?.email).toBeUndefined()
  })

  it('leaves everything alone when the email is resubmitted unchanged', async () => {
    const m = await setup({ verification: 'Verified', verifiedBy: 'u-me', verifiedAt: '2026-09-01T09:00', enrichment: all })
    m.Act.updateContact('ct1', { email: 'sam@example.com', notes: [] })
    const c = m.store.S.contacts[0]
    expect(c.enrichment?.email).toBeDefined()
    expect(c.verification).toBe('Verified')
    expect(c.verifiedAt).toBe('2026-09-01T09:00')
  })
})

describe('Q.mockVerified', () => {
  const legacy = { id: 'ac1', type: 'enriched', businessId: 'ros', contactId: 'ct1', ts: '2026-09-01T09:00', subject: 'Contact enriched via Wiza (simulated)' }

  it('flags a Verified contact with no verifiedAt and a simulated enrichment activity', async () => {
    const m = await setup({ verification: 'Verified' })
    m.store.S.activities.push(legacy as never)
    expect(m.Q.mockVerified(m.store.S.contacts[0])).toBe(true)
  })

  it('does not flag once someone verified it, or without the simulated activity', async () => {
    const m = await setup({ verification: 'Verified' })
    expect(m.Q.mockVerified(m.store.S.contacts[0])).toBe(false)
    m.store.S.activities.push(legacy as never)
    m.Act.markVerified('ct1')
    expect(m.Q.mockVerified(m.store.S.contacts[0])).toBe(false)
  })
})

const SRC = import.meta.glob<string>('../../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })

describe('legacy simulation string', () => {
  it('appears in src/sales only in the one Q.ts detector', () => {
    const needle = ['Wiza', '(simulated)'].join(' ')
    const hits = Object.entries(SRC).filter(([, text]) => text.includes(needle)).map(([p]) => p)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatch(/(^|\/)Q\.ts$/)
  })
})
