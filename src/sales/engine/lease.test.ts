import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BusinessId, LeaseInfo, LeaseRequest, LeaseResponse } from '../api/contract'
import { bootstrap } from '../testing/fixtures'

vi.mock('../api/engine', () => ({ acquireLease: vi.fn(), releaseLease: vi.fn() }))
vi.mock('../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('./engine', () => ({ tick: vi.fn() }))

const BUSINESSES: BusinessId[] = ['ard', 'ros', 'pth', 'adv']

function leaseReply(held: boolean, over: Partial<LeaseResponse> = {}): LeaseResponse {
  return {
    ttlMs: 45000, renewEveryMs: 15000, serverNow: '2026-10-09T10:00:00.000Z',
    leases: BUSINESSES.map((businessId): LeaseInfo => held
      ? { businessId, held: true, expiresAt: '2026-10-09T10:00:45.000Z' }
      : { businessId, held: false, expiresAt: '2026-10-09T10:00:45.000Z', holder: { userId: 'u-other', name: 'Olivia' } }),
    ...over,
  }
}

async function setup(held = true, over: Partial<LeaseResponse> = {}) {
  vi.resetModules()
  const engineApi = await import('../api/engine')
  const tickMod = await import('./engine')
  const lease = await import('./lease')
  const bootstrapMod = await import('../data/bootstrap')
  const sync = await import('../data/sync')
  bootstrapMod.hydrate(bootstrap({}))
  const acquire = vi.mocked(engineApi.acquireLease)
  const release = vi.mocked(engineApi.releaseLease)
  const tick = vi.mocked(tickMod.tick)
  acquire.mockResolvedValue(leaseReply(held, over))
  release.mockResolvedValue({ released: [] })
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  return { lease, sync, acquire, release, tick }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('engine lease', () => {
  it('acquires on start and reports the businesses held', async () => {
    const m = await setup()
    const stop = m.lease.startEngine()
    await vi.advanceTimersByTimeAsync(0)
    expect(m.acquire).toHaveBeenCalledTimes(1)
    const req: LeaseRequest = m.acquire.mock.calls[0][0]
    expect(req.businessIds.slice().sort()).toEqual(['adv', 'ard', 'pth', 'ros'])
    expect(m.lease.getLeaseStatus()).toMatchObject({ ok: true, held: expect.arrayContaining(['ard', 'ros']) })
    stop()
  })

  it('renews at the interval the server asks for', async () => {
    const m = await setup(true, { renewEveryMs: 10000 })
    const stop = m.lease.startEngine()
    await vi.advanceTimersByTimeAsync(0)
    expect(m.acquire).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(9999)
    expect(m.acquire).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(m.acquire).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(10000)
    expect(m.acquire).toHaveBeenCalledTimes(3)
    stop()
  })

  it('holds nothing when the server says another tab has the lease', async () => {
    const m = await setup(false)
    const stop = m.lease.startEngine()
    await vi.advanceTimersByTimeAsync(1000)
    expect(m.lease.getLeaseStatus().held).toEqual([])
    expect(m.tick).not.toHaveBeenCalled()
    stop()
  })

  it('runs the engine for held businesses shortly after start', async () => {
    const m = await setup()
    const stop = m.lease.startEngine()
    await vi.advanceTimersByTimeAsync(399)
    expect(m.tick).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(m.tick).toHaveBeenCalledTimes(1)
    expect(m.tick.mock.calls[0][0].slice().sort()).toEqual(['adv', 'ard', 'pth', 'ros'])
    stop()
  })

  it('collapses a burst of tick requests into one pass', async () => {
    const m = await setup()
    const stop = m.lease.startEngine()
    await vi.advanceTimersByTimeAsync(500)
    m.tick.mockClear()
    for (let i = 0; i < 6; i++) m.lease.requestEngineTick()
    await vi.advanceTimersByTimeAsync(400)
    expect(m.tick).toHaveBeenCalledTimes(1)
    stop()
  })

  it('ignores tick requests before the engine has started', async () => {
    const m = await setup()
    m.lease.requestEngineTick()
    await vi.advanceTimersByTimeAsync(1000)
    expect(m.tick).not.toHaveBeenCalled()
  })

  it('also ticks every 30 seconds', async () => {
    const m = await setup(true, { renewEveryMs: 600000 })
    const stop = m.lease.startEngine()
    await vi.advanceTimersByTimeAsync(1000)
    m.tick.mockClear()
    await vi.advanceTimersByTimeAsync(30000)
    expect(m.tick).toHaveBeenCalledTimes(1)
    stop()
  })

  it('stops holding a lease once its ttl passes without a successful renewal', async () => {
    const m = await setup(true, { ttlMs: 20000, renewEveryMs: 15000 })
    const stop = m.lease.startEngine()
    await vi.advanceTimersByTimeAsync(0)
    expect(m.lease.getLeaseStatus().held.length).toBe(4)
    m.acquire.mockRejectedValue(new Error('offline'))
    await vi.advanceTimersByTimeAsync(15000)
    expect(m.lease.getLeaseStatus()).toMatchObject({ ok: false })
    expect(m.lease.getLeaseStatus().held.length).toBe(4)
    await vi.advanceTimersByTimeAsync(15000)
    expect(m.lease.getLeaseStatus()).toMatchObject({ ok: false, held: [] })
    stop()
  })

  it('releases on pagehide and does not resurrect the lease from a renewal already in flight', async () => {
    const m = await setup()
    let finish: (r: LeaseResponse) => void = () => undefined
    m.acquire.mockReset()
    m.acquire.mockImplementationOnce(() => new Promise<LeaseResponse>(res => { finish = res }))
    const stop = m.lease.startEngine()
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event('pagehide'))
    expect(m.release).toHaveBeenCalledTimes(1)
    expect(m.release.mock.calls[0][1]).toBe(true)
    finish(leaseReply(true))
    await vi.advanceTimersByTimeAsync(0)
    expect(m.lease.getLeaseStatus().held).toEqual([])
    stop()
  })

  it('stops timers and releases when cleaned up', async () => {
    const m = await setup()
    const stop = m.lease.startEngine()
    await vi.advanceTimersByTimeAsync(1000)
    stop()
    m.acquire.mockClear()
    m.tick.mockClear()
    await vi.advanceTimersByTimeAsync(120000)
    expect(m.acquire).not.toHaveBeenCalled()
    expect(m.tick).not.toHaveBeenCalled()
    expect(m.release).toHaveBeenCalled()
    expect(m.lease.getLeaseStatus()).toEqual({ ok: true, leases: [], held: [] })
  })

  it('a second startEngine while running does nothing', async () => {
    const m = await setup()
    const a = m.lease.startEngine()
    m.lease.startEngine()()
    await vi.advanceTimersByTimeAsync(0)
    expect(m.acquire).toHaveBeenCalledTimes(1)
    expect(m.release).not.toHaveBeenCalled()
    a()
  })

  it('reports the lease as not ok and holds nothing once the session has expired', async () => {
    const m = await setup()
    const stop = m.lease.startEngine()
    await vi.advanceTimersByTimeAsync(0)
    expect(m.lease.getLeaseStatus().held.length).toBe(4)
    m.sync.expireSession()
    m.acquire.mockClear()
    await vi.advanceTimersByTimeAsync(15000)
    expect(m.acquire).not.toHaveBeenCalled()
    expect(m.lease.getLeaseStatus()).toEqual({ ok: false, leases: [], held: [] })
    stop()
  })
})
