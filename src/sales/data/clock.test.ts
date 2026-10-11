import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('the web clock', () => {
  it('is real time before the server has spoken', async () => {
    const clock = await import('./clock')
    expect(clock.now()).toBe(Date.parse('2026-10-09T10:00:00Z'))
    vi.advanceTimersByTime(90_000)
    expect(clock.now()).toBe(Date.parse('2026-10-09T10:01:30Z'))
  })

  it('is corrected to server time and nothing else', async () => {
    const clock = await import('./clock')
    clock.setServerNow('2026-10-09T10:00:05Z')
    expect(clock.now()).toBe(Date.parse('2026-10-09T10:00:05Z'))
  })

  it('ignores an unparseable server time', async () => {
    const clock = await import('./clock')
    clock.setServerNow('not a date')
    expect(clock.now()).toBe(Date.parse('2026-10-09T10:00:00Z'))
  })

  it('has no offset controls left', async () => {
    const clock = await import('./clock')
    expect(Object.keys(clock).sort()).toEqual(['bumpClock', 'now', 'setServerNow', 'subscribeClock', 'useNow'])
  })
})
