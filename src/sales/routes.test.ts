import { describe, expect, it } from 'vitest'
import { navParent, PAGE_KEYS, pathToRoute, routeToPath } from './routes'

describe('the removed Clock page', () => {
  it('is no longer a page key', () => {
    expect(PAGE_KEYS).not.toContain('clock')
  })

  it('its old address is an unknown route, like any other', () => {
    expect(pathToRoute('/sales/clock', '').known).toBe(false)
    expect(pathToRoute('/sales/does-not-exist', '').known).toBe(false)
  })
})

describe('the Rosterio account page', () => {
  it('has its own address, carrying the account id and a query', () => {
    const path = routeToPath('rosterioAccount', { id: 'acc1', q: { tab: 'billing', from: 'company', companyId: 'co1' } })
    expect(path.startsWith('/sales/rosterio-accounts/acc1?q=')).toBe(true)
    const u = new URL(path, 'https://app.test')
    expect(pathToRoute(u.pathname, u.search)).toMatchObject({ page: 'rosterioAccount', id: 'acc1', known: true, q: { tab: 'billing', from: 'company', companyId: 'co1' } })
  })

  it('lights up Customers in the sidebar', () => {
    expect(navParent('rosterioAccount')).toBe('customers')
    expect(navParent('company')).toBe('companies')
  })
})

describe('/sales/rosterio-accounts with no account', () => {
  it('opens Customers › Rosterio, like the old rosterio-customers address', () => {
    expect(pathToRoute('/sales/rosterio-accounts', '')).toMatchObject({ page: 'customers', q: { product: 'ros' }, known: true })
    expect(pathToRoute('/sales/rosterio-accounts/', '')).toMatchObject({ page: 'customers', q: { product: 'ros' } })
  })
})
