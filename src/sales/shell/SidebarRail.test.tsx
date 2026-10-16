import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../testing/fixtures'
import { click, settle } from '../testing/dom'
import { invoicingWorld, setArdRole } from '../testing/invoicingWorld'
import { loadSales, type Sales } from '../testing/load'

// The sidebar folds to an icon strip and back, and the browser remembers which.

vi.mock('../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

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

async function sidebar(): Promise<void> {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld())
  setArdRole(m, 'admin')
  const { Sidebar } = await import('./Sidebar')
  await act(async () => { root.render(<Sidebar />) })
  await settle(3)
}
const fold = (): HTMLButtonElement | null => host.querySelector('button.side-fold')

describe('a collapsible sidebar', () => {
  it('Collapse folds it to icons, each still named for screen readers and on hover; Expand opens it out again', async () => {
    await sidebar()
    expect(fold()!.getAttribute('aria-label')).toBe('Collapse sidebar')
    expect(host.querySelector('button.ni[aria-current="page"]')!.getAttribute('aria-label')).toBeNull()
    await click(fold())
    expect(m.ui.UI.get().rail).toBe(true)
    expect(fold()!.getAttribute('aria-label')).toBe('Expand sidebar')
    const dash = [...host.querySelectorAll<HTMLButtonElement>('button.ni')].find(b => b.textContent?.includes('Dashboard'))!
    expect(dash.getAttribute('aria-label')).toBe('Dashboard')
    expect(dash.title).toBe('Dashboard')
    await click(fold())
    expect(m.ui.UI.get().rail).toBe(false)
  })

  it('is remembered in this browser, and opens folded next time', async () => {
    await sidebar()
    await click(fold())
    expect(localStorage.getItem('sos.sidebar.rail')).toBe('1')
    act(() => root.unmount())
    root = createRoot(host)
    await sidebar() // fresh modules: the UI store reads the saved choice
    expect(m.ui.UI.get().rail).toBe(true)
    expect(fold()!.getAttribute('aria-label')).toBe('Expand sidebar')
  })
})
