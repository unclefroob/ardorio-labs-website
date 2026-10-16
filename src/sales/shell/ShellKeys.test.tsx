import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../testing/fixtures'
import { settle } from '../testing/dom'
import { invoicingWorld, setArdRole } from '../testing/invoicingWorld'
import { loadSales, type Sales } from '../testing/load'

// "[" folds or opens the sidebar, but never while someone is typing.

vi.mock('../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
vi.mock('./PageView', () => ({ PageView: () => <input aria-label="A field" /> }))
vi.mock('./RouteSync', () => ({ RouteSync: () => null }))
vi.mock('./Topbar', () => ({ Topbar: () => null }))

let host: HTMLDivElement
let root: Root
let m: Sales
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const press = async (target: EventTarget): Promise<void> => {
  await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true, cancelable: true })) })
}

describe('the [ shortcut', () => {
  it('folds and opens the sidebar, and is ignored in a text field', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, 'admin')
    const { Shell } = await import('./Shell')
    await act(async () => { root.render(<Shell />) })
    await settle(2)
    await press(document.body)
    expect(m.ui.UI.get().rail).toBe(true)
    expect(host.querySelector('.app')?.classList.contains('rail')).toBe(true)
    await press(document.body)
    expect(m.ui.UI.get().rail).toBe(false)
    await press(host.querySelector('input[aria-label="A field"]')!)
    expect(m.ui.UI.get().rail).toBe(false)
  })
})
