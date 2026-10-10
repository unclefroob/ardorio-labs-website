import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { settle } from './sales/testing/dom'
import App from './App'

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

async function visit(url: string): Promise<string> {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.localStorage.clear()
  window.history.replaceState(null, '', url)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => { root.render(<App />) })
  await settle(10)
  const where = window.location.pathname + window.location.search
  act(() => root.unmount())
  host.remove()
  return where
}

describe('SalesOS entry point', () => {
  it('sends a signed-out visitor from /sales to login and remembers where they were going', async () => {
    expect(await visit('/sales/deals?stage=won')).toBe('/admin/login?next=%2Fsales%2Fdeals%3Fstage%3Dwon')
  })
  it('moves an old /admin/sales bookmark to /sales (then through login)', async () => {
    expect(await visit('/admin/sales/deals')).toBe('/admin/login?next=%2Fsales%2Fdeals')
  })
})
