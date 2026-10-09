import { describe, expect, it } from 'vitest'
import type { RecordData } from '../api/contract'
import { bootstrap, rec, row } from '../testing/fixtures'
import { loadSales } from '../testing/load'
import type { Planned } from './plan'

const CO = { name: 'Acme', tradingName: 'Acme', tags: [], notes: [] }

async function seeded(over: Parameters<typeof bootstrap>[0] = { companies: [rec('co1', CO, 4)] }) {
  const m = await loadSales()
  m.bootstrap.hydrate(bootstrap(over))
  return m
}

function stub(kind: Planned['kind'], c: Planned['c'], id: string, sent: RecordData | null = null): Planned {
  const op = kind === 'delete'
    ? ({ op: 'delete', collection: c, id, baseRev: 1 } as const)
    : ({ op: 'put', collection: c, id, baseRev: kind === 'create' ? null : 1, set: { id } } as const)
  return { op, c, id, kind, sent }
}

describe('collectPlan', () => {
  it('is empty when nothing changed', async () => {
    const { plan } = await seeded()
    expect(plan.collectPlan()).toEqual([])
  })

  it('creates a record the server has never seen with the full payload and a null baseRev', async () => {
    const { plan, store } = await seeded()
    store.S.companies.push(row({ id: 'co2', name: 'New Co', tradingName: 'New Co', tags: [], notes: [] }))
    const ops = plan.collectPlan()
    expect(ops).toHaveLength(1)
    expect(ops[0].kind).toBe('create')
    expect(ops[0].op).toMatchObject({ op: 'put', collection: 'companies', id: 'co2', baseRev: null, set: { id: 'co2', name: 'New Co' } })
  })

  it('updates send only the changed paths against the synced rev', async () => {
    const { plan, store } = await seeded()
    store.S.companies[0].name = 'Acme 2'
    const [p] = plan.collectPlan()
    expect(p.kind).toBe('update')
    expect(p.op).toEqual({ op: 'put', collection: 'companies', id: 'co1', baseRev: 4, set: { name: 'Acme 2' } })
  })

  it('cleared keys go in unset', async () => {
    const { plan, store } = await seeded({ companies: [rec('co1', { ...CO, hq: 'Melbourne' }, 4)] })
    delete (store.S.companies[0] as Record<string, unknown>).hq
    const [p] = plan.collectPlan()
    expect(p.op).toMatchObject({ set: {}, unset: ['hq'] })
  })

  it('note changes travel as keyed items, not as a replaced list', async () => {
    const { plan, store } = await seeded()
    store.S.companies[0].notes.push({ id: 'n1', body: 'hi', by: 'u', ts: 't', businessId: 'ard', visibility: 'business' })
    const [p] = plan.collectPlan()
    expect(p.op).toMatchObject({ items: { notes: { upsert: [{ id: 'n1', body: 'hi' }] } } })
    expect(p.op).not.toHaveProperty('set.notes')
  })

  it('a removed row becomes a delete at the synced rev', async () => {
    const { plan, store } = await seeded()
    store.S.companies.splice(0, 1)
    const [p] = plan.collectPlan()
    expect(p.kind).toBe('delete')
    expect(p.op).toEqual({ op: 'delete', collection: 'companies', id: 'co1', baseRev: 4 })
    expect(p.sent).toBeNull()
  })

  it('a record being restored after a delete conflict is sent whole with resurrect', async () => {
    const { plan, store } = await seeded()
    store.metaMap('companies').set('co1', { rev: 7, snap: null, snapStr: '', base: 7, demo: false })
    const [p] = plan.collectPlan()
    expect(p.op).toMatchObject({ op: 'put', id: 'co1', baseRev: 7, resurrect: true, set: { name: 'Acme' } })
  })

  it('uses the edit baseline (base) in preference to the latest rev', async () => {
    const { plan, store } = await seeded()
    store.S.companies[0].name = 'Edited'
    const m = store.metaMap('companies').get('co1')
    if (!m) throw new Error('no meta')
    store.metaMap('companies').set('co1', { ...m, rev: 9, base: 4 })
    const [p] = plan.collectPlan()
    expect(p.op).toMatchObject({ baseRev: 4 })
  })

  it('settings that exist only as server defaults are created at baseRev 0', async () => {
    const { plan, store } = await seeded()
    expect(plan.collectPlan()).toEqual([])
    store.S.org.sendingLimit = 10
    const ops = plan.collectPlan()
    expect(ops).toHaveLength(1)
    expect(ops[0].op).toMatchObject({ collection: 'settings', id: 'org', baseRev: 0, set: { id: 'org', sendingLimit: 10 } })
  })

  it('stored settings update by diff at their rev', async () => {
    const org = { name: 'Org', tz: 'UTC', currency: 'AUD', dateFormat: 'D MMM YYYY', notif: { email: true, inApp: true }, sendingLimit: 50 }
    const { plan, store } = await seeded({ settings: [rec('org', org, 2)] })
    store.S.org.sendingLimit = 11
    const [p] = plan.collectPlan()
    expect(p.op).toEqual({ op: 'put', collection: 'settings', id: 'org', baseRev: 2, set: { sendingLimit: 11 } })
  })

  it('orders entity creates, rels, other creates, updates, then deletes', async () => {
    const { plan, store } = await seeded({
      companies: [rec('co1', CO, 1)], tasks: [rec('t1', { title: 'old' }, 1)], lists: [rec('l1', { name: 'gone', contactIds: [] }, 1)],
    })
    store.S.lists.splice(0, 1)
    store.S.tasks[0].title = 'new'
    store.S.tasks.push(row({ id: 't2', title: 'fresh' }))
    store.S.companyRels.push(row({ id: 'r1', companyId: 'co9' }))
    store.S.companies.push(row({ id: 'co9', name: 'Nine', tags: [], notes: [] }))
    const order = plan.collectPlan().map(p => `${p.kind}:${p.c}`)
    expect(order).toEqual(['create:companies', 'create:companyRels', 'create:tasks', 'update:tasks', 'delete:lists'])
  })
})

describe('toAtoms and takeChunk', () => {
  it('keeps an entity create together with its rels', async () => {
    const { plan } = await seeded()
    const atoms = plan.toAtoms([
      stub('create', 'contacts', 'ct1'),
      stub('create', 'contactRels', 'x1', { contactId: 'ct1' }),
      stub('create', 'contactRels', 'x2', { contactId: 'ct1' }),
      stub('create', 'companies', 'co1'),
      stub('create', 'companyRels', 'r1', { companyId: 'co1' }),
      stub('create', 'tasks', 't1'),
    ])
    expect(atoms.map(a => a.map(p => p.id))).toEqual([['ct1', 'x1', 'x2'], ['co1', 'r1'], ['t1']])
  })

  it('a rel whose entity is not in this plan stands alone', async () => {
    const { plan } = await seeded()
    const atoms = plan.toAtoms([stub('create', 'contactRels', 'x1', { contactId: 'elsewhere' })])
    expect(atoms).toHaveLength(1)
  })

  it('chunks never split an atom and always make progress', async () => {
    const { plan } = await seeded()
    const a = (n: number, p: string) => Array.from({ length: n }, (_, i) => stub('create', 'tasks', `${p}${i}`))
    const atoms = [a(3, 'a'), a(3, 'b'), a(5, 'c')]
    const first = plan.takeChunk(atoms, 0, 4)
    expect(first.items.map(p => p.id)).toEqual(['a0', 'a1', 'a2'])
    expect(first.next).toBe(1)
    const second = plan.takeChunk(atoms, first.next, 4)
    expect(second.items).toHaveLength(3)
    const third = plan.takeChunk(atoms, second.next, 4)
    expect(third.items).toHaveLength(5)
    expect(third.next).toBe(3)
  })
})
