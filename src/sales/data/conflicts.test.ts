import { describe, expect, it } from 'vitest'
import type { FieldConflict } from '../api/contract'
import { bootstrap, rec, user } from '../testing/fixtures'
import { loadSales } from '../testing/load'

const CO = { name: 'Acme', tradingName: 'Acme', hq: 'Sydney', tags: [], notes: [] }

function field(path: string, mine: unknown, theirs: unknown): FieldConflict {
  return { path, mine, theirs, changedBy: 'u-other', changedAt: '2026-10-09T09:00:00.000Z' }
}

describe('prompt list', () => {
  it('adds with increasing ids, removes by id, and resolves paths one at a time', async () => {
    const { conflicts } = await loadSales()
    conflicts.addPrompt({ kind: 'field', collection: 'companies', recId: 'a', label: 'company', rev: 3, fields: [field('name', 1, 2), field('hq', 3, 4)] })
    conflicts.addPrompt({ kind: 'modified', collection: 'companies', recId: 'b', label: 'company', rev: 3, by: 'Olivia' })
    const [first, second] = conflicts.getPrompts()
    expect(second.id).toBeGreaterThan(first.id)

    conflicts.resolvePaths(first.id, ['name'])
    expect(conflicts.getPrompts()[0]).toMatchObject({ kind: 'field', fields: [{ path: 'hq' }] })

    conflicts.resolvePaths(first.id, ['hq'])
    expect(conflicts.getPrompts().map(p => p.id)).toEqual([second.id])

    conflicts.removePrompt(second.id)
    expect(conflicts.getPrompts()).toEqual([])
  })

  it('resolvePaths ignores prompts that are not field prompts and unknown paths', async () => {
    const { conflicts } = await loadSales()
    conflicts.addPrompt({ kind: 'modified', collection: 'companies', recId: 'b', label: 'company', rev: 3, by: 'Olivia' })
    conflicts.addPrompt({ kind: 'field', collection: 'companies', recId: 'a', label: 'company', rev: 3, fields: [field('name', 1, 2)] })
    const [m, f] = conflicts.getPrompts()
    conflicts.resolvePaths(m.id, ['name'])
    conflicts.resolvePaths(f.id, ['nope'])
    expect(conflicts.getPrompts()).toHaveLength(2)
  })
})

describe('names', () => {
  it('userName falls back to a neutral phrase', async () => {
    const { conflicts, bootstrap: b } = await loadSales()
    b.hydrate(bootstrap({}, [user('u-other', 'Olivia')]))
    expect(conflicts.userName('u-other')).toBe('Olivia')
    expect(conflicts.userName('u-gone')).toBe('a teammate')
  })

  it('describeRecord names the record by name, title or subject', async () => {
    const { conflicts } = await loadSales()
    expect(conflicts.describeRecord('companies', { name: 'Acme' })).toBe('company "Acme"')
    expect(conflicts.describeRecord('tasks', { title: 'Call Bob' })).toBe('task "Call Bob"')
    expect(conflicts.describeRecord('threads', { subject: 'Hello' })).toBe('thread "Hello"')
    expect(conflicts.describeRecord('deals', {})).toBe('deal')
    expect(conflicts.describeRecord('deals', undefined)).toBe('deal')
    expect(conflicts.describeRecord('audit', undefined)).toBe('record')
  })
})

describe('resolving a field conflict', () => {
  async function conflicted() {
    const m = await loadSales()
    m.bootstrap.hydrate(bootstrap({ companies: [rec('co1', CO, 4)] }, [user('u-other', 'Olivia')]))
    m.store.S.companies[0].name = 'Mine'
    m.store.S.companies[0].hq = 'Perth'
    const [p] = m.plan.collectPlan()
    m.results.applyResult(p, {
      index: 0, collection: 'companies', id: 'co1', status: 'conflict', rev: 9,
      record: {
        collection: 'companies', id: 'co1', rev: 9, data: { ...CO, name: 'Theirs', hq: 'Hobart', id: 'co1' }, demo: false,
        updatedAt: '2026-10-09T10:00:00.000Z', updatedBy: 'u-other',
      },
      conflict: { kind: 'field', fields: [field('name', 'Mine', 'Theirs'), field('hq', 'Perth', 'Hobart')] },
    })
    const prompt = m.conflicts.getPrompts()[0]
    if (prompt.kind !== 'field') throw new Error('expected a field prompt')
    return { ...m, prompt }
  }

  it('starts with the server values showing', async () => {
    const { store } = await conflicted()
    expect(store.S.companies[0]).toMatchObject({ name: 'Theirs', hq: 'Hobart' })
  })

  it('Keep mine puts my value back and resends it against the conflict rev (contract 5.2)', async () => {
    const { resolve, prompt, plan, store, conflicts } = await conflicted()
    resolve.keepMineFields(prompt, ['name'])
    expect(store.S.companies[0]).toMatchObject({ name: 'Mine', hq: 'Hobart' })
    const [p] = plan.collectPlan()
    expect(p.op).toEqual({ op: 'put', collection: 'companies', id: 'co1', baseRev: 9, set: { name: 'Mine' } })
    expect(conflicts.getPrompts()).toMatchObject([{ kind: 'field', fields: [{ path: 'hq' }] }])
  })

  it('Keep mine still uses the conflict rev after a poll moved the record on, so a newer change is not overwritten unseen', async () => {
    const { resolve, prompt, plan, store } = await conflicted()
    const m = store.metaMap('companies').get('co1')
    if (!m) throw new Error('no meta')
    store.metaMap('companies').set('co1', { ...m, rev: 10 })
    resolve.keepMineFields(prompt, ['hq'])
    expect(plan.collectPlan()[0].op).toMatchObject({ baseRev: 9, set: { hq: 'Perth' } })
  })

  it('Keep theirs changes nothing locally and queues nothing', async () => {
    const { resolve, prompt, plan, store, conflicts } = await conflicted()
    resolve.keepTheirsFields(prompt, ['name', 'hq'])
    expect(store.S.companies[0]).toMatchObject({ name: 'Theirs', hq: 'Hobart' })
    expect(plan.collectPlan()).toEqual([])
    expect(conflicts.getPrompts()).toEqual([])
  })

  it('one of each: mine for one field, theirs for the other', async () => {
    const { resolve, prompt, plan, store, conflicts } = await conflicted()
    resolve.keepMineFields(prompt, ['hq'])
    const rest = conflicts.getPrompts()[0]
    if (rest.kind !== 'field') throw new Error('expected a field prompt')
    resolve.keepTheirsFields(rest, ['name'])
    expect(store.S.companies[0]).toMatchObject({ name: 'Theirs', hq: 'Perth' })
    expect(plan.collectPlan()[0].op).toMatchObject({ baseRev: 9, set: { hq: 'Perth' } })
    expect(conflicts.getPrompts()).toEqual([])
  })

  it('Keep all mine restores every clashing field', async () => {
    const { resolve, prompt, plan } = await conflicted()
    resolve.keepMine(prompt)
    expect(plan.collectPlan()[0].op).toMatchObject({ baseRev: 9, set: { name: 'Mine', hq: 'Perth' } })
  })
})

describe('resolving a deleted or modified conflict', () => {
  it('Restore resurrects the record with my values at the rev the server reported', async () => {
    const m = await loadSales()
    m.bootstrap.hydrate(bootstrap({ companies: [rec('co1', CO, 4)] }, [user('u-other', 'Olivia')]))
    m.store.S.companies[0].name = 'Mine'
    const [p] = m.plan.collectPlan()
    m.results.applyResult(p, {
      index: 0, collection: 'companies', id: 'co1', status: 'conflict', rev: 8, record: null,
      conflict: { kind: 'deleted', fields: [] },
    })
    const prompt = m.conflicts.getPrompts()[0]
    if (prompt.kind !== 'deleted') throw new Error('expected deleted')
    expect(m.store.S.companies).toHaveLength(0)

    m.resolve.restoreDeleted(prompt)
    expect(m.store.S.companies[0]).toMatchObject({ id: 'co1', name: 'Mine' })
    expect(m.conflicts.getPrompts()).toEqual([])
    expect(m.plan.collectPlan()[0].op).toMatchObject({ op: 'put', id: 'co1', baseRev: 8, resurrect: true, set: { name: 'Mine' } })
  })

  it('Delete anyway resends the delete at the new rev', async () => {
    const m = await loadSales()
    m.bootstrap.hydrate(bootstrap({ companies: [rec('co1', CO, 4)] }, [user('u-other', 'Olivia')]))
    m.store.S.companies.splice(0, 1)
    const [p] = m.plan.collectPlan()
    m.results.applyResult(p, {
      index: 0, collection: 'companies', id: 'co1', status: 'conflict', rev: 6,
      record: { collection: 'companies', id: 'co1', rev: 6, data: { ...CO, id: 'co1' }, demo: false, updatedAt: 't', updatedBy: 'u-other' },
      conflict: { kind: 'modified', fields: [] },
    })
    const prompt = m.conflicts.getPrompts()[0]
    if (prompt.kind !== 'modified') throw new Error('expected modified')
    m.resolve.deleteAnyway(prompt)
    expect(m.store.S.companies).toHaveLength(0)
    expect(m.plan.collectPlan()[0].op).toEqual({ op: 'delete', collection: 'companies', id: 'co1', baseRev: 6 })
  })
})
