import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { click, settle } from '../../testing/dom'
import { salesWorld } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('Users on a phone', () => {
  it('shows a card with the name, email and access, and a tap opens the user', async () => {
    const m = await loadSales()
    m.bootstrap.hydrate(salesWorld())
    const { Users } = await import('./Users')
    await act(async () => { root.render(<Users />) })
    await settle(3)
    const card = host.querySelector('ul.tcards > li')
    expect(card?.textContent).toContain('me@example.com')
    expect(card?.textContent).toContain('Super Administrator')
    await click(card?.querySelector('.tcard-b') ?? card)
    expect(m.ui.UI.get().drawer).toMatchObject({ name: 'user' })
  })
})
