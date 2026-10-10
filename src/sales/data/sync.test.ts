import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse, OpResult } from '../api/contract'
import { appliedResult, bootstrap, change, changes, rec, user, row } from '../testing/fixtures'
import { loadSales } from '../testing/load'

vi.mock('../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../api/me', () => ({ getMe: vi.fn() }))

const CO = { name: 'Acme', tradingName: 'Acme', tags: [], notes: [] }

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

async function setup(over: Parameters<typeof bootstrap>[0] = { companies: [rec('co1', CO, 4)] }) {
  const m = await loadSales()
  m.bootstrap.hydrate(bootstrap(over, [user('u-other', 'Olivia')]))
  const stop = m.sync.startSync()
  const post = vi.mocked(m.records.postBatch)
  const poll = vi.mocked(m.records.getChanges)
  const toast = vi.spyOn(m.ui.UI, 'toast')
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const echo = (req: BatchRequest): BatchResponse => ({
    serverNow: '2026-10-09T10:00:00.000Z',
    results: req.ops.map((op, i): OpResult => {
      if (op.op === 'delete') return { index: i, collection: op.collection, id: op.id, status: 'applied', rev: 9, record: null }
      return appliedResult(i, op.collection, op.id, 5 + i, { ...CO, ...op.set })
    }),
  })
  post.mockImplementation(async req => echo(req))
  return { ...m, stop, post, poll, toast, echo }
}

function edit(m: Awaited<ReturnType<typeof setup>>, name: string): void {
  m.store.S.companies[0].name = name
  m.sync.scheduleFlush()
}

function httpError(m: Awaited<ReturnType<typeof setup>>, status: number, code?: 'LEASE_LOST' | 'VALIDATION', msg = 'boom') {
  return new m.http.SalesHttpError(status, code ? { error: msg, code } : null, msg)
}

describe('flush scheduling', () => {
  it('waits 300ms after the last edit and sends everything in one request', async () => {
    const m = await setup()
    edit(m, 'a')
    await vi.advanceTimersByTimeAsync(200)
    edit(m, 'ab')
    await vi.advanceTimersByTimeAsync(299)
    expect(m.post).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(m.post).toHaveBeenCalledTimes(1)
    expect(m.post.mock.calls[0][0].ops).toEqual([{ op: 'put', collection: 'companies', id: 'co1', baseRev: 4, set: { name: 'ab' } }])
    expect(m.sync.getSyncStatus()).toMatchObject({ state: 'idle', failures: 0, queued: 0 })
    expect(m.store.metaMap('companies').get('co1')?.rev).toBe(5)
    m.stop()
  })

  it('reports unsaved work until the server has acknowledged it', async () => {
    const m = await setup()
    expect(m.sync.hasUnsaved()).toBe(false)
    edit(m, 'x')
    expect(m.sync.hasUnsaved()).toBe(true)
    await vi.advanceTimersByTimeAsync(300)
    expect(m.sync.hasUnsaved()).toBe(false)
    m.stop()
  })

  it('does not flush when nothing differs from the server copy', async () => {
    const m = await setup()
    m.sync.scheduleFlush()
    await vi.advanceTimersByTimeAsync(300)
    expect(m.post).not.toHaveBeenCalled()
    expect(m.sync.getSyncStatus().state).toBe('idle')
    m.stop()
  })
})

describe('retry backoff', () => {
  it('doubles from 1s to a 30s cap on network failure, and shows the failure state', async () => {
    const m = await setup()
    m.post.mockRejectedValue(new Error('down'))
    edit(m, 'x')
    await vi.advanceTimersByTimeAsync(300)
    expect(m.post).toHaveBeenCalledTimes(1)
    expect(m.sync.getSyncStatus()).toMatchObject({ state: 'error', failures: 1, message: 'down' })

    let calls = 1
    for (const wait of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      await vi.advanceTimersByTimeAsync(wait - 1)
      expect(m.post).toHaveBeenCalledTimes(calls)
      await vi.advanceTimersByTimeAsync(1)
      calls++
      expect(m.post).toHaveBeenCalledTimes(calls)
    }
    expect(m.sync.getSyncStatus().failures).toBe(8)
    m.stop()
  })

  it('treats a 5xx like a network failure and keeps the server message', async () => {
    const m = await setup()
    m.post.mockRejectedValueOnce(httpError(m, 503, undefined, 'Service unavailable'))
    edit(m, 'x')
    await vi.advanceTimersByTimeAsync(300)
    expect(m.sync.getSyncStatus()).toMatchObject({ state: 'error', failures: 1, message: 'Service unavailable' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(m.post).toHaveBeenCalledTimes(2)
    expect(m.sync.getSyncStatus()).toMatchObject({ state: 'idle', failures: 0 })
    m.stop()
  })

  it('resets the backoff after a success', async () => {
    const m = await setup()
    m.post.mockRejectedValueOnce(new Error('down')).mockRejectedValueOnce(new Error('down'))
    edit(m, 'x')
    await vi.advanceTimersByTimeAsync(300 + 1000 + 2000)
    expect(m.post).toHaveBeenCalledTimes(3)
    expect(m.sync.getSyncStatus().state).toBe('idle')
    m.post.mockRejectedValueOnce(new Error('down again'))
    edit(m, 'y')
    await vi.advanceTimersByTimeAsync(300)
    expect(m.post).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(999)
    expect(m.post).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(m.post).toHaveBeenCalledTimes(5)
    m.stop()
  })

  it('does not arm a retry after the page has stopped syncing', async () => {
    const m = await setup()
    m.post.mockRejectedValue(new Error('down'))
    edit(m, 'x')
    m.stop()
    await vi.advanceTimersByTimeAsync(300)
    expect(m.post).not.toHaveBeenCalled()
    await m.sync.flush()
    expect(m.post).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60000)
    expect(m.post).toHaveBeenCalledTimes(1)
  })
})

describe('request size and refusals', () => {
  async function manyTasks(m: Awaited<ReturnType<typeof setup>>, n: number) {
    for (let i = 0; i < n; i++) m.store.S.tasks.push(row({ id: `t${i}`, title: `T${i}` }))
    m.sync.scheduleFlush()
  }

  it('halves the chunk on 413 until it fits', async () => {
    const m = await setup()
    m.post.mockImplementation(async req => {
      if (req.ops.length > 2) throw httpError(m, 413)
      return m.echo(req)
    })
    await manyTasks(m, 4)
    await vi.advanceTimersByTimeAsync(300)
    expect(m.post.mock.calls.map(c => c[0].ops.length)).toEqual([4, 2, 2])
    expect(m.sync.getSyncStatus().state).toBe('idle')
    expect(m.store.S.tasks).toHaveLength(4)
    m.stop()
  })

  it('rolls back a single record that is too large and says so', async () => {
    const m = await setup()
    m.post.mockRejectedValue(httpError(m, 413))
    await manyTasks(m, 1)
    await vi.advanceTimersByTimeAsync(300)
    expect(m.store.S.tasks).toHaveLength(0)
    expect(m.toast).toHaveBeenCalledWith("Couldn't save: that record is too large.", 'bad')
    expect(m.post).toHaveBeenCalledTimes(1)
    m.stop()
  })

  it('a 400-class refusal rolls the batch back and toasts the server message without retrying', async () => {
    const m = await setup()
    m.post.mockRejectedValue(httpError(m, 400, 'VALIDATION', 'linkedin must be an http(s) URL'))
    edit(m, 'x')
    await vi.advanceTimersByTimeAsync(300)
    expect(m.store.S.companies[0].name).toBe('Acme')
    expect(m.toast).toHaveBeenCalledWith("Couldn't save: linkedin must be an http(s) URL", 'bad')
    await vi.advanceTimersByTimeAsync(60000)
    expect(m.post).toHaveBeenCalledTimes(1)
    m.stop()
  })

  it('a 403 says the user lacks permission', async () => {
    const m = await setup()
    m.post.mockRejectedValue(httpError(m, 403))
    edit(m, 'x')
    await vi.advanceTimersByTimeAsync(300)
    expect(m.toast).toHaveBeenCalledWith("You don't have permission to do that.", 'bad')
    m.stop()
  })

  it('retries after 3s when the server reports contention, without counting a failure', async () => {
    const m = await setup()
    const busy = (req: BatchRequest): BatchResponse => ({
      serverNow: 'x',
      results: req.ops.map((op, i): OpResult => ({
        index: i, collection: op.collection, id: op.id, status: 'rejected', rev: null, record: null,
        error: { code: 'CONTENTION', message: 'busy' },
      })),
    })
    m.post.mockImplementationOnce(async req => busy(req))
    edit(m, 'x')
    await vi.advanceTimersByTimeAsync(300)
    expect(m.post).toHaveBeenCalledTimes(1)
    expect(m.sync.getSyncStatus().failures).toBe(0)
    await vi.advanceTimersByTimeAsync(2999)
    expect(m.post).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(m.post).toHaveBeenCalledTimes(2)
    expect(m.sync.getSyncStatus().state).toBe('idle')
    m.stop()
  })
})

describe('a retired lease refusal', () => {
  it('treats an unexpected LEASE_LOST like any refused op: rolled back, toasted, not retried', async () => {
    const m = await setup()
    m.post.mockRejectedValue(httpError(m, 409, 'LEASE_LOST', 'lease gone'))
    edit(m, 'nope')
    await vi.advanceTimersByTimeAsync(300)
    expect(m.store.S.companies[0].name).toBe('Acme')
    expect(m.toast).toHaveBeenCalledWith("Couldn't save: lease gone", 'bad')
    await vi.advanceTimersByTimeAsync(60000)
    expect(m.post).toHaveBeenCalledTimes(1)
    expect(m.sync.getSyncStatus().failures).toBe(0)
    m.stop()
  })
})

describe('session expiry (401)', () => {
  it('discards pending edits, shows one expired state and never retries', async () => {
    const m = await setup()
    m.post.mockRejectedValue(httpError(m, 401))
    m.store.S.tasks.push(row({ id: 't1', title: 'New task' }))
    edit(m, 'unsaved name')
    await vi.advanceTimersByTimeAsync(300)

    expect(m.post).toHaveBeenCalledTimes(1)
    expect(m.sync.isSessionExpired()).toBe(true)
    expect(m.sync.getSyncStatus()).toMatchObject({ state: 'expired', discarded: 2, failures: 0, queued: 0 })
    expect(m.store.S.companies[0].name).toBe('Acme')
    expect(m.store.S.tasks).toHaveLength(0)
    expect(m.sync.hasUnsaved()).toBe(false)
    expect(m.toast).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(120000)
    expect(m.post).toHaveBeenCalledTimes(1)
    expect(m.poll).not.toHaveBeenCalled()
    m.stop()
  })

  it('ignores edits made after expiry instead of queuing them', async () => {
    const m = await setup()
    m.post.mockRejectedValue(httpError(m, 401))
    edit(m, 'x')
    await vi.advanceTimersByTimeAsync(300)
    edit(m, 'y')
    await vi.advanceTimersByTimeAsync(60000)
    expect(m.post).toHaveBeenCalledTimes(1)
    expect(await m.sync.flush()).toBe(false)
    expect(m.post).toHaveBeenCalledTimes(1)
    m.stop()
  })

  it('stops after the first refused chunk when a large batch expires mid-way', async () => {
    const m = await setup()
    m.post.mockRejectedValue(httpError(m, 401))
    for (let i = 0; i < 450; i++) m.store.S.tasks.push(row({ id: `t${i}`, title: 'x' }))
    m.sync.scheduleFlush()
    await vi.advanceTimersByTimeAsync(300)
    expect(m.post).toHaveBeenCalledTimes(1)
    expect(m.sync.getSyncStatus()).toMatchObject({ state: 'expired', discarded: 450 })
    m.stop()
  })

  it('reports expiry once even if several requests discover it', async () => {
    const m = await setup()
    m.sync.expireSession()
    const first = m.sync.getSyncStatus()
    m.sync.expireSession()
    expect(m.sync.getSyncStatus()).toBe(first)
    m.stop()
  })

  it('startSync after signing in clears the expired state', async () => {
    const m = await setup()
    m.sync.expireSession()
    m.stop()
    const stop = m.sync.startSync()
    expect(m.sync.isSessionExpired()).toBe(false)
    expect(m.sync.getSyncStatus()).toMatchObject({ state: 'idle', discarded: 0 })
    stop()
  })
})

describe('polling and applyChange', () => {
  async function polled(over?: Parameters<typeof setup>[0]) {
    const m = await setup(over)
    const run = async (...entries: ReturnType<typeof change>[]) => {
      m.poll.mockResolvedValueOnce(changes(entries))
      await m.sync.pollOnce()
    }
    return { ...m, run }
  }

  it('asks for changes since the stored cursor and advances it', async () => {
    const m = await polled()
    await m.run()
    expect(m.poll).toHaveBeenLastCalledWith('c0')
    await m.run()
    expect(m.poll).toHaveBeenLastCalledWith('c1')
    m.stop()
  })

  it('polls on the 15s timer', async () => {
    const m = await polled()
    m.poll.mockResolvedValue(changes([]))
    await vi.advanceTimersByTimeAsync(14999)
    expect(m.poll).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(m.poll).toHaveBeenCalledTimes(1)
    m.stop()
  })

  it('applies a newer remote copy to an unedited record', async () => {
    const m = await polled()
    await m.run(change('companies', 'co1', 5, { ...CO, name: 'Remote' }))
    expect(m.store.S.companies[0].name).toBe('Remote')
    expect(m.store.metaMap('companies').get('co1')).toMatchObject({ rev: 5, base: null })
    expect(m.plan.collectPlan()).toEqual([])
    m.stop()
  })

  it('ignores a change that is not newer than what we hold', async () => {
    const m = await polled()
    await m.run(change('companies', 'co1', 4, { ...CO, name: 'Stale' }), change('companies', 'co1', 3, { ...CO, name: 'Older' }))
    expect(m.store.S.companies[0].name).toBe('Acme')
    m.stop()
  })

  it('keeps my unsaved edit to one field while taking their edit to another, and queues mine against the old rev', async () => {
    const m = await polled()
    m.store.S.companies[0].name = 'Mine'
    await m.run(change('companies', 'co1', 6, { ...CO, hq: 'Perth' }))
    expect(m.store.S.companies[0]).toMatchObject({ name: 'Mine', hq: 'Perth' })
    const [p] = m.plan.collectPlan()
    expect(p.op).toEqual({ op: 'put', collection: 'companies', id: 'co1', baseRev: 4, set: { name: 'Mine' } })
    m.stop()
  })

  it('an edit made after a poll insert still produces a diff (no shared objects with the baseline)', async () => {
    const m = await polled()
    await m.run(change('companies', 'co2', 1, { name: 'Brand new', tags: ['x'], notes: [] }))
    expect(m.store.S.companies.map(c => c.id)).toEqual(['co1', 'co2'])
    expect(m.plan.collectPlan()).toEqual([])
    m.store.S.companies[1].tags.push('y')
    const [p] = m.plan.collectPlan()
    expect(p.op).toMatchObject({ id: 'co2', baseRev: 1, set: { tags: ['x', 'y'] } })
    m.stop()
  })

  it('removes a record someone else deleted', async () => {
    const m = await polled()
    await m.run(change('companies', 'co1', 5, null))
    expect(m.store.S.companies).toHaveLength(0)
    expect(m.store.metaMap('companies').has('co1')).toBe(false)
    expect(m.toast).not.toHaveBeenCalled()
    m.stop()
  })

  it('warns when the removed record had unsaved edits, naming who removed it', async () => {
    const m = await polled()
    m.store.S.companies[0].name = 'Mine'
    await m.run(change('companies', 'co1', 5, null, 'u-other'))
    expect(m.toast).toHaveBeenCalledWith('A record you were editing was removed by Olivia', 'warn')
    expect(m.store.S.companies).toHaveLength(0)
    m.stop()
  })

  describe('hidden entries (the caller lost access)', () => {
    // The server sends only {id, collection, hidden:true}: no data, and the record's rev is unchanged.
    const hiddenEntry = (id: string, rev = 4, collection: 'companies' | 'deals' = 'companies') =>
      ({ ...change(collection, id, rev, null), deleted: false, hidden: true as const })

    it('removes the record even though its rev is not newer than ours', async () => {
      const m = await polled()
      m.poll.mockResolvedValueOnce(changes([hiddenEntry('co1', 4)]))
      await m.sync.pollOnce()
      expect(m.store.S.companies).toHaveLength(0)
      expect(m.store.metaMap('companies').has('co1')).toBe(false)
      expect(m.store.isRevoked('companies', 'co1')).toBe(true)
      expect(m.toast).not.toHaveBeenCalled()
      m.stop()
    })

    it('copes with an entry that has no rev at all', async () => {
      const m = await polled()
      const bare = { collection: 'companies', id: 'co1', hidden: true, deleted: false, data: null } as unknown as ReturnType<typeof change>
      m.poll.mockResolvedValueOnce(changes([bare]))
      await m.sync.pollOnce()
      expect(m.store.S.companies).toHaveLength(0)
      m.stop()
    })

    it('tells the user when it throws away unsaved edits', async () => {
      const m = await polled()
      m.store.S.companies[0].name = 'Mine'
      m.poll.mockResolvedValueOnce(changes([hiddenEntry('co1')]))
      await m.sync.pollOnce()
      expect(m.toast).toHaveBeenCalledWith('You no longer have access to a record you were editing. Your unsaved changes to it were discarded.', 'warn')
      expect(m.sync.hasUnsaved()).toBe(false)
      expect(m.plan.collectPlan()).toEqual([])
      m.stop()
    })

    it('does not send a save for the record afterwards', async () => {
      const m = await polled()
      m.store.S.companies[0].name = 'Mine'
      m.poll.mockResolvedValueOnce(changes([hiddenEntry('co1')]))
      await m.sync.pollOnce()
      await m.sync.flush()
      expect(m.post).not.toHaveBeenCalled()
      m.stop()
    })

    it('leaves other records alone', async () => {
      const m = await setup({ companies: [rec('co1', CO, 4), rec('co2', { ...CO, name: 'Other' }, 2)] })
      m.poll.mockResolvedValueOnce(changes([hiddenEntry('co2', 2)]))
      await m.sync.pollOnce()
      expect(m.store.S.companies.map(c => c.id)).toEqual(['co1'])
      expect(m.store.isRevoked('companies', 'co1')).toBe(false)
      m.stop()
    })

    it('ignores a hidden entry for a record that was never loaded', async () => {
      const m = await polled()
      m.poll.mockResolvedValueOnce(changes([hiddenEntry('nope')]))
      await m.sync.pollOnce()
      expect(m.store.S.companies).toHaveLength(1)
      expect(m.toast).not.toHaveBeenCalled()
      m.stop()
    })

    it('keeps a record that is only an unsent local create', async () => {
      const m = await polled()
      m.store.S.companies.push(row({ id: 'new1', name: 'Draft', tradingName: '', tags: [], notes: [] }))
      m.poll.mockResolvedValueOnce(changes([hiddenEntry('new1', 0)]))
      await m.sync.pollOnce()
      expect(m.store.S.companies.map(c => c.id)).toEqual(['co1', 'new1'])
      expect(m.store.isRevoked('companies', 'new1')).toBe(false)
      m.stop()
    })

    it('shows the record again when access is later restored', async () => {
      const m = await polled()
      m.poll.mockResolvedValueOnce(changes([hiddenEntry('co1')]))
      await m.sync.pollOnce()
      expect(m.store.isRevoked('companies', 'co1')).toBe(true)
      m.poll.mockResolvedValueOnce(changes([change('companies', 'co1', 6, { ...CO })]))
      await m.sync.pollOnce()
      expect(m.store.S.companies.map(c => c.id)).toEqual(['co1'])
      expect(m.store.isRevoked('companies', 'co1')).toBe(false)
      m.stop()
    })
  })

  it('ignores collections it does not sync', async () => {
    const m = await polled()
    await m.run(change('users', 'u9', 2, { name: 'x' }))
    expect(m.store.S.companies).toHaveLength(1)
    m.stop()
  })

  it('keeps fetching while the server says there is more', async () => {
    const m = await polled()
    m.poll.mockResolvedValueOnce(changes([change('companies', 'co2', 1, { name: 'B', tags: [], notes: [] })], { more: true, cursor: 'c5' }))
    m.poll.mockResolvedValueOnce(changes([change('companies', 'co3', 1, { name: 'C', tags: [], notes: [] })]))
    await m.sync.pollOnce()
    expect(m.poll.mock.calls.map(c => c[0])).toEqual(['c0', 'c5'])
    expect(m.store.S.companies.map(c => c.id)).toEqual(['co1', 'co2', 'co3'])
    m.stop()
  })

  it('counts failed polls and clears the count on success', async () => {
    const m = await polled()
    m.poll.mockRejectedValue(new Error('offline'))
    await m.sync.pollOnce()
    await m.sync.pollOnce()
    expect(m.sync.getSyncStatus().pollFailures).toBe(2)
    m.poll.mockResolvedValue(changes([]))
    await m.sync.pollOnce()
    expect(m.sync.getSyncStatus().pollFailures).toBe(0)
    m.stop()
  })

  it('does not poll while a save is in flight', async () => {
    const m = await polled()
    let release: () => void = () => undefined
    m.post.mockImplementationOnce(req => new Promise<BatchResponse>(res => {
      release = () => res(m.echo(req))
    }))
    edit(m, 'x')
    await vi.advanceTimersByTimeAsync(300)
    await m.sync.pollOnce()
    expect(m.poll).not.toHaveBeenCalled()
    release()
    await vi.advanceTimersByTimeAsync(0)
    m.stop()
  })
})
