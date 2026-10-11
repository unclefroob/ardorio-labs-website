import { describe, expect, it } from 'vitest'
import { ADMIN_PAGES, NAV } from './nav'

describe('navigation', () => {
  it('has no Clock item', () => {
    const items = NAV.flatMap(g => g.items)
    expect(items.some(i => i.page === 'clock' || i.label === 'Clock')).toBe(false)
    expect(ADMIN_PAGES).not.toContain('clock')
  })
})
