import { describe, expect, it } from 'vitest'
import { PAGE_KEYS, pathToRoute } from './routes'

describe('the removed Clock page', () => {
  it('is no longer a page key', () => {
    expect(PAGE_KEYS).not.toContain('clock')
  })

  it('its old address is an unknown route, like any other', () => {
    expect(pathToRoute('/sales/clock', '').known).toBe(false)
    expect(pathToRoute('/sales/does-not-exist', '').known).toBe(false)
  })
})
