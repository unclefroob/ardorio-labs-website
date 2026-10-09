import { describe, expect, it } from 'vitest'
import { bootstrap, rec } from '../testing/fixtures'
import { loadSales } from '../testing/load'

const CT = { firstName: 'Sam', lastName: 'Buyer', name: 'Sam Buyer', email: 'Sam@Example.com', email2: 'sam.alt@example.com', companyId: 'co1', notes: [] }

async function setup(sup: Array<Record<string, unknown>>) {
  const m = await loadSales()
  m.bootstrap.hydrate(bootstrap({
    contacts: [rec('ct1', CT)],
    suppressions: sup.map((s, i) => rec(`sp${i}`, { scope: 'global', businessId: null, reason: 'Unsubscribe', source: 't', date: '2026-10-01T09:00', by: 'u', ...s })),
  }))
  const { Q } = await import('./Q')
  const ct = m.store.S.contacts[0]
  return { Q, ct, m }
}

describe('Q.suppressed (contract 3.7, vectors S1-S6)', () => {
  it('S1 matches by contactId', async () => {
    const { Q, ct } = await setup([{ contactId: 'ct1', email: 'someone.else@example.com' }])
    expect(Q.suppressed(ct, 'ros')).toBeTruthy()
  })
  it('S2 matches by primary email with a different contactId', async () => {
    const { Q, ct } = await setup([{ contactId: 'other', email: 'sam@example.com' }])
    expect(Q.suppressed(ct, 'ros')).toBeTruthy()
  })
  it('S3 matches by email2', async () => {
    const { Q, ct } = await setup([{ contactId: 'other', email: 'sam.alt@example.com' }])
    expect(Q.suppressed(ct, 'ros')).toBeTruthy()
  })
  it('S4 is case-insensitive', async () => {
    const { Q, ct } = await setup([{ contactId: 'other', email: 'SAM.ALT@EXAMPLE.COM' }])
    expect(Q.suppressed(ct, 'ros')).toBeTruthy()
  })
  it('S5 ignores another business scope', async () => {
    const { Q, ct } = await setup([{ contactId: 'ct1', scope: 'business', businessId: 'adv' }])
    expect(Q.suppressed(ct, 'ros')).toBeNull()
    expect(Q.suppressed(ct, 'adv')).toBeTruthy()
  })
  it('S6 ignores removed suppressions', async () => {
    const { Q, ct } = await setup([{ contactId: 'ct1', email: 'sam@example.com', removed: '2026-10-02T09:00' }])
    expect(Q.suppressed(ct, 'ros')).toBeNull()
  })
  it('returns null when nothing matches and tolerates a contact with no email', async () => {
    const { Q, ct } = await setup([{ contactId: 'zzz', email: 'nobody@example.com' }, { contactId: 'yyy' }])
    expect(Q.suppressed(ct, 'ros')).toBeNull()
    expect(Q.suppressed({ ...ct, id: 'blank', email: '', email2: '' }, 'ros')).toBeNull()
  })
})

describe('Q.suppressedAddr (compose to/cc)', () => {
  it('matches a raw address, case-insensitively, trimmed', async () => {
    const { Q } = await setup([{ contactId: 'other', email: 'x@example.com' }])
    expect(Q.suppressedAddr('  X@Example.COM ', 'ros')).toBeTruthy()
    expect(Q.suppressedAddr('y@example.com', 'ros')).toBeNull()
  })
  it('honours business scope and removed', async () => {
    const { Q } = await setup([
      { contactId: 'a', email: 'scoped@example.com', scope: 'business', businessId: 'adv' },
      { contactId: 'b', email: 'gone@example.com', removed: '2026-10-02T09:00' },
    ])
    expect(Q.suppressedAddr('scoped@example.com', 'ros')).toBeNull()
    expect(Q.suppressedAddr('scoped@example.com', 'adv')).toBeTruthy()
    expect(Q.suppressedAddr('gone@example.com', 'ros')).toBeNull()
  })
  it('also matches the thread contact by id when given', async () => {
    const { Q } = await setup([{ contactId: 'ct1', email: 'unrelated@example.com' }])
    expect(Q.suppressedAddr('typed.by.hand@example.com', 'ros', 'ct1')).toBeTruthy()
    expect(Q.suppressedAddr('typed.by.hand@example.com', 'ros')).toBeNull()
  })
})
