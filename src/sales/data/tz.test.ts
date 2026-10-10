import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadSales } from '../testing/load'

const MEL = 'Australia/Melbourne'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function tzModule() {
  return import('./tz')
}

describe('contract vectors (section 10), timezone Australia/Melbourne', () => {
  it('T1 wall to instant, normal', async () => {
    const { msFromWall } = await tzModule()
    expect(new Date(msFromWall('2026-07-01T09:00:00', MEL)).toISOString()).toBe('2026-06-30T23:00:00.000Z')
  })
  it('T2 gap (DST start) resolves forward', async () => {
    const { msFromWall } = await tzModule()
    expect(new Date(msFromWall('2026-10-04T02:30:00', MEL)).toISOString()).toBe('2026-10-03T16:30:00.000Z')
  })
  it('T3 overlap (DST end) takes the earlier instant', async () => {
    const { msFromWall } = await tzModule()
    expect(new Date(msFromWall('2026-04-05T02:30:00', MEL)).toISOString()).toBe('2026-04-04T15:30:00.000Z')
  })
  it('T4/T5 instant to wall at the gap edge', async () => {
    const { wallFromMs } = await tzModule()
    expect(wallFromMs(Date.parse('2026-10-03T15:59:00Z'), MEL)).toBe('2026-10-04T01:59:00')
    expect(wallFromMs(Date.parse('2026-10-03T16:00:00Z'), MEL)).toBe('2026-10-04T03:00:00')
  })
  it('T6 instant to wall at the overlap edges', async () => {
    const { wallFromMs } = await tzModule()
    expect(wallFromMs(Date.parse('2026-04-04T15:59:00Z'), MEL)).toBe('2026-04-05T02:59:00')
    expect(wallFromMs(Date.parse('2026-04-04T16:00:00Z'), MEL)).toBe('2026-04-05T02:00:00')
    expect(wallFromMs(Date.parse('2026-04-04T17:00:00Z'), MEL)).toBe('2026-04-05T03:00:00')
  })
  it('accepts minute-precision wall strings, which the web has always written', async () => {
    const { msFromWall } = await tzModule()
    expect(msFromWall('2026-07-01T09:00', MEL)).toBe(msFromWall('2026-07-01T09:00:00', MEL))
  })
})

describe('resolveTz', () => {
  it('falls back to Melbourne for missing or invalid zones', async () => {
    const { resolveTz } = await tzModule()
    expect(resolveTz(undefined)).toBe(MEL)
    expect(resolveTz('')).toBe(MEL)
    expect(resolveTz('Not/AZone')).toBe(MEL)
    expect(resolveTz('America/New_York')).toBe('America/New_York')
  })
})

describe('the web clock is org-tz wall time, independent of the browser zone', () => {
  for (const browserTz of ['UTC', 'America/New_York', 'Pacific/Auckland']) {
    it(`F.nowIso in Melbourne when the browser is ${browserTz}`, async () => {
      vi.stubEnv('TZ', browserTz)
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
      const m = await loadSales()
      const { F } = await import('./F')
      expect(m.store.S.org.tz).toBe(MEL)
      expect(F.nowIso()).toBe('2026-10-09T21:00')
      expect(F.today()).toBe('2026-10-09')
      expect(F.now().getHours()).toBe(21)
    })
  }

  it('follows settings org.tz', async () => {
    vi.stubEnv('TZ', 'UTC')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
    const m = await loadSales()
    const { F } = await import('./F')
    m.store.S.org.tz = 'America/New_York'
    expect(F.nowIso()).toBe('2026-10-09T06:00')
  })

  it('includes the simulated clock offset', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
    await loadSales()
    const { F } = await import('./F')
    const clock = await import('./clock')
    clock.setOffsetMinutes(3 * 1440)
    expect(F.nowIso()).toBe('2026-10-12T21:00')
  })
})
