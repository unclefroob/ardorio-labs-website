import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnrichDone } from './client'

const done = (n = 1): EnrichDone => ({
  status: 'found', suggestions: [{ field: 'title', value: 'Head of Ops' + n, kind: 'published', sourceUrl: 'https://acme.test' }],
  sources: [], withheld: 0, disclaimer: 'd', usage: { used: n, limit: 300, resetsOn: '2026-11-01' }, model: 'grok-4.7',
})

async function load(userId = 'u1') {
  vi.resetModules()
  const store = await import('../data/store')
  store.S.session.userId = userId
  const cache = await import('./enrichCache')
  return { store, cache }
}

beforeEach(() => { vi.useRealTimers() })

describe('enrich result cache', () => {
  it('returns what was stored, with the time it was stored', async () => {
    const { cache } = await load()
    cache.putEnrich('ct1', done(), 1000)
    expect(cache.getEnrich('ct1')).toEqual({ ts: 1000, res: done() })
    expect(cache.getEnrich('ct2')).toBeUndefined()
  })

  it('replaces an earlier result for the same contact', async () => {
    const { cache } = await load()
    cache.putEnrich('ct1', done(1), 1000)
    cache.putEnrich('ct1', done(2), 2000)
    expect(cache.getEnrich('ct1')).toEqual({ ts: 2000, res: done(2) })
  })

  it('dropEnrich forgets one contact only', async () => {
    const { cache } = await load()
    cache.putEnrich('ct1', done())
    cache.putEnrich('ct2', done())
    cache.dropEnrich('ct1')
    expect(cache.getEnrich('ct1')).toBeUndefined()
    expect(cache.getEnrich('ct2')).toBeDefined()
  })

  it('clear forgets results and usage, and tells subscribers', async () => {
    const { cache } = await load()
    cache.putEnrich('ct1', done())
    cache.setUsage('ros', { used: 3, limit: 300, resetsOn: '2026-11-01' })
    cache.clear()
    expect(cache.getEnrich('ct1')).toBeUndefined()
    expect(cache.getUsage('ros')).toBeUndefined()
  })

  it('does not show one user another user\'s results in the same tab', async () => {
    const { store, cache } = await load('u1')
    cache.putEnrich('ct1', done())
    cache.setUsage('ros', { used: 3, limit: 300, resetsOn: '2026-11-01' })
    expect(cache.getEnrich('ct1')).toBeDefined()
    store.S.session.userId = 'u2'
    expect(cache.getEnrich('ct1')).toBeUndefined()
    expect(cache.getUsage('ros')).toBeUndefined()
  })

  it('is bounded', async () => {
    const { cache } = await load()
    for (let i = 0; i < 520; i++) cache.putEnrich('ct' + i, done())
    expect(cache.getEnrich('ct0')).toBeUndefined()
    expect(cache.getEnrich('ct519')).toBeDefined()
  })

  it('is memory only: nothing is written to browser storage', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem')
    const { cache } = await load()
    cache.putEnrich('ct1', done())
    cache.setUsage('ros', { used: 3, limit: 300, resetsOn: '2026-11-01' })
    expect(set).not.toHaveBeenCalled()
    set.mockRestore()
  })
})

describe('usage', () => {
  it('notifies subscribers only when the numbers change, and on clear', async () => {
    const { cache } = await load()
    const seen = vi.fn()
    const off = cache.subscribe(seen)
    const u = { used: 3, limit: 300, resetsOn: '2026-11-01' }
    cache.setUsage('ros', u)
    expect(seen).toHaveBeenCalledTimes(1)
    cache.setUsage('ros', { ...u })
    expect(seen).toHaveBeenCalledTimes(1)
    cache.setUsage('ros', { ...u, used: 4 })
    expect(seen).toHaveBeenCalledTimes(2)
    cache.clear()
    expect(seen).toHaveBeenCalledTimes(3)
    off()
    cache.setUsage('ros', u)
    expect(seen).toHaveBeenCalledTimes(3)
  })

  it('remaining is the limit less used, never negative, null when unknown', async () => {
    const { cache } = await load()
    expect(cache.remaining(undefined)).toBeNull()
    expect(cache.remaining({ used: 120, limit: 300, resetsOn: 'x' })).toBe(180)
    expect(cache.remaining({ used: 301, limit: 300, resetsOn: 'x' })).toBe(0)
  })
})

describe('labels', () => {
  it('describes how old a result is', async () => {
    const { cache } = await load()
    expect(cache.ageLabel(1_000, 1_000 + 20_000)).toBe('just now')
    expect(cache.ageLabel(0, 60_000)).toBe('1 min ago')
    expect(cache.ageLabel(0, 12 * 60_000 + 5_000)).toBe('12 min ago')
    expect(cache.ageLabel(0, 3 * 3_600_000)).toBe('3 h ago')
  })

  it('formats the reset date in UTC', async () => {
    const { cache } = await load()
    expect(cache.fmtReset('2026-11-01')).toBe('1 Nov 2026')
    expect(cache.fmtReset('garbage')).toBe('garbage')
  })
})

describe('usage expiry', () => {
  it('treats a cached allowance as gone once its resetsOn (00:00 UTC) has passed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-31T23:59:59Z'))
    const { cache } = await load()
    const u = { used: 300, limit: 300, resetsOn: '2026-11-01' }
    cache.setUsage('ros', u)
    expect(cache.getUsage('ros')).toEqual(u)
    expect(cache.remaining(cache.getUsage('ros'))).toBe(0)
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'))
    expect(cache.getUsage('ros')).toBeUndefined()
    expect(cache.remaining(cache.getUsage('ros'))).toBeNull()
  })

  it('usageExpired ignores an unparseable date and accepts a fresh entry after expiry', async () => {
    const { cache } = await load()
    expect(cache.usageExpired({ used: 1, limit: 3, resetsOn: 'soon' }, Date.now() + 1e12)).toBe(false)
    expect(cache.usageExpired({ used: 1, limit: 3, resetsOn: '2026-11-01' }, Date.parse('2026-10-31T23:59:59Z'))).toBe(false)
    expect(cache.usageExpired({ used: 1, limit: 3, resetsOn: '2026-11-01' }, Date.parse('2026-11-01T00:00:00Z'))).toBe(true)
  })

  it('stores a refreshed allowance for the new month after the old one expired', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-02T00:00:00Z'))
    const { cache } = await load()
    cache.setUsage('ros', { used: 300, limit: 300, resetsOn: '2026-11-01' })
    expect(cache.getUsage('ros')).toBeUndefined()
    cache.setUsage('ros', { used: 0, limit: 300, resetsOn: '2026-12-01' })
    expect(cache.remaining(cache.getUsage('ros'))).toBe(300)
  })
})
