import { describe, expect, it, vi } from 'vitest'
import type { OpResult, RecordEnvelope } from '../api/contract'
import { bootstrap, rec, user, row } from '../testing/fixtures'
import { loadSales } from '../testing/load'

const CO = { name: 'Acme', tradingName: 'Acme', tags: [], notes: [] }

async function seeded() {
  const m = await loadSales()
  m.bootstrap.hydrate(bootstrap({ companies: [rec('co1', CO, 4)] }, [user('u-other', 'Olivia')]))
  const toast = vi.spyOn(m.ui.UI, 'toast')
  return { ...m, toast }
}

function envelope(over: Partial<RecordEnvelope> = {}): RecordEnvelope {
  return {
    collection: 'companies', id: 'co1', rev: 5, data: { ...CO, id: 'co1' }, demo: false,
    updatedAt: '2026-10-09T10:00:00.000Z', updatedBy: 'u-other', ...over,
  }
}

function result(over: Partial<OpResult>): OpResult {
  return { index: 0, collection: 'companies', id: 'co1', status: 'applied', rev: 5, record: envelope(), ...over }
}

describe('applyResult: success', () => {
  it('adopts the server copy and clears the edit baseline', async () => {
    const { plan, results, store } = await seeded()
    store.S.companies[0].name = 'Mine'
    const [p] = plan.collectPlan()
    const keep = results.applyResult(p, result({ record: envelope({ data: { ...CO, name: 'Mine', id: 'co1' } }) }))
    expect(keep).toBe(false)
    const m = store.metaMap('companies').get('co1')
    expect(m?.rev).toBe(5)
    expect(m?.base).toBeNull()
    expect(m?.snap).toMatchObject({ name: 'Mine' })
    expect(plan.collectPlan()).toEqual([])
  })

  it('keeps edits made while the request was in flight and queues them against the new rev', async () => {
    const { plan, results, store } = await seeded()
    store.S.companies[0].name = 'Sent'
    const [p] = plan.collectPlan()
    store.S.companies[0].tradingName = 'Typed later'
    results.applyResult(p, result({ record: envelope({ data: { ...CO, name: 'Sent', id: 'co1' } }) }))
    expect(store.S.companies[0]).toMatchObject({ name: 'Sent', tradingName: 'Typed later' })
    const [next] = plan.collectPlan()
    expect(next.op).toMatchObject({ baseRev: 5, set: { tradingName: 'Typed later' } })
    expect(next.op).not.toHaveProperty('set.name')
  })

  it('tells the user when the server merged in someone else\'s change', async () => {
    const { plan, results, store, toast } = await seeded()
    store.S.companies[0].name = 'Mine'
    const [p] = plan.collectPlan()
    results.applyResult(p, result({ status: 'merged', record: envelope({ data: { ...CO, name: 'Mine', hq: 'Perth', id: 'co1' } }) }))
    expect(toast).toHaveBeenCalledWith('Updated with changes from Olivia')
    expect(store.S.companies[0]).toMatchObject({ name: 'Mine', hq: 'Perth' })
  })

  it('drops the record when the server returns none', async () => {
    const { plan, results, store } = await seeded()
    store.S.companies[0].name = 'Mine'
    const [p] = plan.collectPlan()
    results.applyResult(p, result({ status: 'applied', record: null }))
    expect(store.S.companies).toHaveLength(0)
    expect(store.metaMap('companies').has('co1')).toBe(false)
  })

  it('a confirmed delete removes the metadata', async () => {
    const { plan, results, store } = await seeded()
    store.S.companies.splice(0, 1)
    const [p] = plan.collectPlan()
    results.applyResult(p, result({ record: null }))
    expect(store.metaMap('companies').has('co1')).toBe(false)
    expect(plan.collectPlan()).toEqual([])
  })
})

describe('applyResult: conflicts', () => {
  it('field conflict: server values win locally and a prompt carries the clashing fields at the server rev', async () => {
    const { plan, results, store, conflicts } = await seeded()
    store.S.companies[0].name = 'Mine'
    const [p] = plan.collectPlan()
    const fields = [{ path: 'name', mine: 'Mine', theirs: 'Theirs', changedBy: 'u-other', changedAt: '2026-10-09T09:00:00.000Z' }]
    const keep = results.applyResult(p, result({
      status: 'conflict', rev: 6, record: envelope({ rev: 6, data: { ...CO, name: 'Theirs', id: 'co1' } }),
      conflict: { kind: 'field', fields },
    }))
    expect(keep).toBe(false)
    expect(store.S.companies[0].name).toBe('Theirs')
    expect(store.metaMap('companies').get('co1')?.rev).toBe(6)
    expect(plan.collectPlan()).toEqual([])
    expect(conflicts.getPrompts()).toMatchObject([{ kind: 'field', collection: 'companies', recId: 'co1', rev: 6, label: 'company "Theirs"', fields }])
  })

  it('deleted conflict: the row goes, and the prompt keeps what the user sent plus who deleted it', async () => {
    const { plan, results, store, conflicts } = await seeded()
    store.S.companies[0].name = 'Mine'
    const [p] = plan.collectPlan()
    results.applyResult(p, result({
      status: 'conflict', rev: 8, record: null,
      conflict: { kind: 'deleted', fields: [{ path: 'name', mine: 'Mine', theirs: undefined, theirsDeleted: true, changedBy: 'u-other', changedAt: 't' }] },
    }))
    expect(store.S.companies).toHaveLength(0)
    expect(store.metaMap('companies').has('co1')).toBe(false)
    const [prompt] = conflicts.getPrompts()
    expect(prompt).toMatchObject({ kind: 'deleted', rev: 8, by: 'Olivia', label: 'company "Mine"', record: { name: 'Mine' } })
  })

  it('modified conflict on delete: the record comes back and the user is asked', async () => {
    const { plan, results, store, conflicts } = await seeded()
    store.S.companies.splice(0, 1)
    const [p] = plan.collectPlan()
    results.applyResult(p, result({
      status: 'conflict', rev: 5, record: envelope({ data: { ...CO, name: 'Edited by them', id: 'co1' } }),
      conflict: { kind: 'modified', fields: [] },
    }))
    expect(store.S.companies[0]).toMatchObject({ id: 'co1', name: 'Edited by them' })
    expect(conflicts.getPrompts()).toMatchObject([{ kind: 'modified', rev: 5, by: 'Olivia' }])
  })
})

describe('applyResult: rejections', () => {
  it('CONTENTION leaves the op queued and changes nothing', async () => {
    const { plan, results, store } = await seeded()
    store.S.companies[0].name = 'Mine'
    const [p] = plan.collectPlan()
    const keep = results.applyResult(p, result({ status: 'rejected', rev: null, record: null, error: { code: 'CONTENTION', message: 'busy' } }))
    expect(keep).toBe(true)
    expect(store.S.companies[0].name).toBe('Mine')
  })

  it('DUPLICATE_SEND on a create removes the local row quietly', async () => {
    const { plan, results, store, toast } = await seeded()
    store.S.companies.push(row({ id: 'co2', name: 'Dup', tags: [], notes: [] }))
    const p = plan.collectPlan().find(x => x.id === 'co2')
    if (!p) throw new Error('no plan')
    results.applyResult(p, result({ id: 'co2', status: 'rejected', rev: null, record: null, error: { code: 'DUPLICATE_SEND', message: 'dup' } }))
    expect(store.S.companies.map(c => c.id)).toEqual(['co1'])
    expect(toast).not.toHaveBeenCalled()
  })

  it('NOT_FOUND forgets the record', async () => {
    const { plan, results, store } = await seeded()
    store.S.companies[0].name = 'Mine'
    const [p] = plan.collectPlan()
    results.applyResult(p, result({ status: 'rejected', rev: null, record: null, error: { code: 'NOT_FOUND', message: 'gone' } }))
    expect(store.S.companies).toHaveLength(0)
    expect(store.metaMap('companies').has('co1')).toBe(false)
  })

  it('a permission code rolls the edit back and says so', async () => {
    const { plan, results, store, toast } = await seeded()
    store.S.companies[0].name = 'Mine'
    const [p] = plan.collectPlan()
    results.applyResult(p, result({ status: 'rejected', rev: null, record: null, error: { code: 'READ_ONLY', message: 'no' } }))
    expect(store.S.companies[0].name).toBe('Acme')
    expect(toast).toHaveBeenCalledWith("You don't have permission to do that.", 'bad')
    expect(plan.collectPlan()).toEqual([])
  })

  it('any other rejection rolls back and shows the server message', async () => {
    const { plan, results, store, toast } = await seeded()
    store.S.companies[0].name = 'Mine'
    const [p] = plan.collectPlan()
    results.applyResult(p, result({ status: 'rejected', rev: null, record: null, error: { code: 'VALIDATION', message: 'linkedin must be http(s)' } }))
    expect(store.S.companies[0].name).toBe('Acme')
    expect(toast).toHaveBeenCalledWith("Couldn't save: linkedin must be http(s)", 'bad')
  })
})

describe('INVALID_URL rejection', () => {
  async function rejected(details: Record<string, unknown> | undefined) {
    const m = await seeded()
    m.store.S.companies[0].name = 'Mine'
    const [p] = m.plan.collectPlan()
    const base = result({ status: 'rejected', rev: null, record: null })
    const body: OpResult = JSON.parse(JSON.stringify({ ...base, error: { code: 'INVALID_URL', message: 'bad url', details } }))
    m.results.applyResult(p, body)
    return m
  }

  it('rolls back and names the field the server pointed at', async () => {
    const { store, toast } = await rejected({ path: 'linkedin', reason: 'protocol' })
    expect(store.S.companies[0].name).toBe('Acme')
    expect(toast).toHaveBeenCalledWith('LinkedIn must start with http:// or https://. Your change was not saved.', 'bad')
  })

  it('still explains itself when the server gives no path', async () => {
    const { toast } = await rejected(undefined)
    expect(toast).toHaveBeenCalledWith('A web address must start with http:// or https://. Your change was not saved.', 'bad')
  })
})

describe('rollback', () => {
  it('keeps edits made after the failed op was sent', async () => {
    const { plan, results, store } = await seeded()
    store.S.companies[0].name = 'Sent'
    const [p] = plan.collectPlan()
    store.S.companies[0].tradingName = 'Later'
    results.rollback(p)
    expect(store.S.companies[0]).toMatchObject({ name: 'Acme', tradingName: 'Later' })
  })

  it('a failed create disappears and a failed delete comes back', async () => {
    const { plan, results, store } = await seeded()
    store.S.companies.push(row({ id: 'co2', name: 'New', tags: [], notes: [] }))
    store.S.companies.splice(0, 1)
    const ops = plan.collectPlan()
    results.rollbackPlan(ops)
    expect(store.S.companies.map(c => c.id)).toEqual(['co1'])
    expect(store.S.companies[0].name).toBe('Acme')
  })
})
