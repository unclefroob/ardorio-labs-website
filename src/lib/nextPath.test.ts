import { describe, expect, it } from 'vitest'
import { loginPath, safeNext } from './nextPath'

describe('safeNext', () => {
  it('keeps same-site paths and rejects anything that could leave the site', () => {
    expect(safeNext('/sales/deals?x=1#a')).toBe('/sales/deals?x=1#a')
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '', null, undefined]) {
      expect(safeNext(bad)).toBeNull()
    }
  })
})

describe('loginPath', () => {
  it('builds the plain login path with no options', () => {
    expect(loginPath()).toBe('/admin/login')
  })
  it('carries the reason and a safe next path, encoded', () => {
    expect(loginPath({ reason: 'expired', next: '/sales/deals?x=1' })).toBe('/admin/login?reason=expired&next=%2Fsales%2Fdeals%3Fx%3D1')
  })
  it('drops an unsafe next and never loops back to the login page', () => {
    expect(loginPath({ next: '//evil.com' })).toBe('/admin/login')
    expect(loginPath({ next: '/admin/login?next=/sales' })).toBe('/admin/login')
  })
})
