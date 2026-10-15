import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { F } from './F'

// The org timezone is Melbourne (the default). Mid-October it is UTC+11.
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T05:00:00Z')) }) // 16:00 in Melbourne
afterEach(() => { vi.useRealTimers() })

describe('times the server writes with a zone', () => {
  it('a UTC time is shown as the same moment in Melbourne, not as if its digits were local', () => {
    expect(F.time('2026-10-15T05:30:00.000Z')).toBe('4:30 pm')
    expect(F.date('2026-10-14T14:00:00.000Z')).toBe('15 Oct') // 1:00 am the next day in Melbourne
    expect(F.time('2026-10-15T16:30:00+11:00')).toBe('4:30 pm')
  })

  it('"how long ago" is right for a sync a minute ago written in UTC', () => {
    expect(F.rel('2026-10-15T04:59:00.000Z')).toBe('1m ago')
  })

  it('wall times (no zone) still read as Melbourne time, unchanged', () => {
    expect(F.time('2026-10-15T09:00')).toBe('9:00 am')
    expect(F.time('2026-10-15T09:00:00')).toBe('9:00 am')
    expect(F.date('2026-10-15')).toBe('15 Oct')
  })

  it('sorts a mix of the two by the moment they stand for', () => {
    const a = '2026-10-15T09:00:00'        // 9:00 Melbourne
    const b = '2026-10-14T23:30:00.000Z'   // 10:30 Melbourne
    expect(F.ms(b)).toBeGreaterThan(F.ms(a))
    expect(b.localeCompare(a)).toBeLessThan(0) // which is exactly what plain string sorting got wrong
  })
})
