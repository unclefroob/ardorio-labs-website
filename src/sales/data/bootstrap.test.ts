import { describe, expect, it } from 'vitest'
import { bootstrap, rec } from '../testing/fixtures'
import { loadSales } from '../testing/load'

const COMPANY = { name: 'Acme', tradingName: 'Acme', website: 'https://acme.test', tags: ['a'], notes: [] }

describe('hydrate keeps the live rows apart from the diff baseline', () => {
  it('an edit after load still produces a diff (stale-baseline aliasing regression)', async () => {
    const { bootstrap: b, store, plan } = await loadSales()
    b.hydrate(bootstrap({ companies: [rec('co1', COMPANY, 4)] }))
    expect(plan.collectPlan()).toEqual([])

    const live = store.S.companies[0]
    live.name = 'Acme Renamed'

    const ops = plan.collectPlan()
    expect(ops).toHaveLength(1)
    expect(ops[0].op).toMatchObject({ op: 'put', collection: 'companies', id: 'co1', baseRev: 4, set: { name: 'Acme Renamed' } })
  })

  it('the live row and the stored baseline are different objects, at every depth', async () => {
    const { bootstrap: b, store } = await loadSales()
    b.hydrate(bootstrap({ companies: [rec('co1', COMPANY, 1)] }))
    const snap = store.metaMap('companies').get('co1')?.snap
    const live = store.S.companies[0]
    expect(snap).toBeDefined()
    expect(live).not.toBe(snap)
    expect(live.tags).not.toBe(snap?.tags)
    live.tags.push('b')
    expect(snap?.tags).toEqual(['a'])
  })

  it('an edit made after a second load (reload) still produces a diff', async () => {
    const { bootstrap: b, store, plan } = await loadSales()
    b.hydrate(bootstrap({ companies: [rec('co1', COMPANY, 1)] }))
    store.S.companies[0].name = 'Edited once'
    b.hydrate(bootstrap({ companies: [rec('co1', { ...COMPANY, name: 'Server name' }, 2)] }))
    expect(plan.collectPlan()).toEqual([])

    store.S.companies[0].tradingName = 'Edited after reload'
    const ops = plan.collectPlan()
    expect(ops).toHaveLength(1)
    expect(ops[0].op).toMatchObject({ baseRev: 2, set: { tradingName: 'Edited after reload' } })
  })

  it('settings are separate from their baseline, including nested objects', async () => {
    const { bootstrap: b, store, plan } = await loadSales()
    const org = { name: 'Org', tz: 'Australia/Melbourne', currency: 'AUD', dateFormat: 'D MMM YYYY', notif: { email: true, inApp: true }, sendingLimit: 50 }
    b.hydrate(bootstrap({ settings: [rec('org', org, 3)] }))
    expect(plan.collectPlan()).toEqual([])

    store.S.org.notif.email = false
    const ops = plan.collectPlan()
    expect(ops).toHaveLength(1)
    expect(ops[0].op).toMatchObject({ collection: 'settings', id: 'org', baseRev: 3 })
    expect(store.metaMap('settings').get('org')?.snap?.notif).toEqual({ email: true, inApp: true })
  })
})
