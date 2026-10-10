import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const order: string[] = []
const flushAll = vi.fn(async () => {
  order.push('flush')
  return true
})
const nudge = vi.fn(async () => {
  order.push('nudge')
  return { ran: true, businessIds: [], serverNow: '' }
})

vi.mock('./sync', () => ({ flushAll: () => flushAll() }))
vi.mock('../api/engine', () => ({ nudge: () => nudge() }))

async function load() {
  vi.resetModules()
  return import('./engineNudge')
}

beforeEach(() => {
  vi.useFakeTimers()
  order.length = 0
  flushAll.mockClear()
  nudge.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('nudgeEngine', () => {
  it('flushes pending writes first, then nudges the server', async () => {
    const { nudgeEngine } = await load()
    nudgeEngine()
    await vi.advanceTimersByTimeAsync(1000)
    expect(order).toEqual(['flush', 'nudge'])
  })

  it('coalesces a burst of calls inside the window into one nudge', async () => {
    const { nudgeEngine } = await load()
    nudgeEngine()
    nudgeEngine()
    await vi.advanceTimersByTimeAsync(400)
    nudgeEngine()
    await vi.advanceTimersByTimeAsync(2000)
    expect(nudge).toHaveBeenCalledTimes(1)
    expect(flushAll).toHaveBeenCalledTimes(1)
  })

  it('a later call after the window nudges again', async () => {
    const { nudgeEngine } = await load()
    nudgeEngine()
    await vi.advanceTimersByTimeAsync(1500)
    nudgeEngine()
    await vi.advanceTimersByTimeAsync(1500)
    expect(nudge).toHaveBeenCalledTimes(2)
  })

  it('does not nudge when the flush failed (nothing for the server to act on)', async () => {
    flushAll.mockResolvedValueOnce(false)
    const { nudgeEngine } = await load()
    nudgeEngine()
    await vi.advanceTimersByTimeAsync(1000)
    expect(nudge).not.toHaveBeenCalled()
  })

  it('swallows a failed nudge and keeps working', async () => {
    nudge.mockRejectedValueOnce(new Error('offline'))
    const { nudgeEngine } = await load()
    nudgeEngine()
    await vi.advanceTimersByTimeAsync(1000)
    nudgeEngine()
    await vi.advanceTimersByTimeAsync(1500)
    expect(nudge).toHaveBeenCalledTimes(2)
  })
})
