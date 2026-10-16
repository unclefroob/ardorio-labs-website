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
    expect(host.querySelector('button.ni[aria-current="page"]')!.getAttribute('aria-label')).toBe('Dashboard')
    await click(fold())
    expect(m.ui.UI.get().rail).toBe(true)
    expect(fold()!.getAttribute('aria-label')).toBe('Expand sidebar')
    const dash = [...host.querySelectorAll<HTMLButtonElement>('button.ni')].find(b => b.textContent?.includes('Dashboard'))!
    expect(dash.getAttribute('aria-label')).toBe('Dashboard')
    expect(dash.querySelector('.ni-l')?.getAttribute('aria-hidden')).toBe('true') // the name is read once, from the label
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

  it('when folded, a name shows beside an icon on hover, and the Administration pages are one menu', async () => {
    await sidebar()
    await click(fold())
    const dash = host.querySelector<HTMLButtonElement>('button.ni[aria-label="Dashboard"]')!
    await act(async () => { dash.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) })
    expect(host.querySelector('.side-tip')?.textContent).toBe('Dashboard')
    await act(async () => { dash.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })) })
    expect(host.querySelector('.side-tip')).toBeNull()
    expect(host.querySelector('button.ni[aria-label="Settings"]')).toBeNull()
    await click(host.querySelector('button.ni[aria-label="Administration"]'))
    expect([...document.querySelectorAll('[role="menu"] button')].map(b => b.textContent?.trim())).toContain('Settings')
  })
})

describe('the sidebar, expanded', () => {
  it('reads counts with their meaning, not as bare numbers', async () => {
    await sidebar()
    const inbox = [...host.querySelectorAll<HTMLButtonElement>('button.ni')].find(b => b.textContent?.includes('Inbox'))!
    expect(inbox.getAttribute('aria-label') ?? '').toMatch(/^Inbox(, \d+ unread)?$/)
    expect(host.querySelector('button.ni[aria-label="Dashboard"]')).not.toBeNull()
  })

  it('keeps Administration folded until opened, remembers that, and opens it while on one of its pages', async () => {
    await sidebar()
    const head = (): HTMLButtonElement => [...host.querySelectorAll<HTMLButtonElement>('button.ng-btn')].find(b => b.textContent?.includes('Administration'))!
    expect(head().getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelector('button.ni[aria-label="Settings"]')).toBeNull()
    await click(head())
    expect(head().getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('button.ni[aria-label="Settings"]')).not.toBeNull()
    expect(localStorage.getItem('sos.sidebar.admin')).toBe('1')
    await click(head())
    expect(localStorage.getItem('sos.sidebar.admin')).toBe('0')
    await act(async () => { m.ui.syncRoute({ page: 'settings' }) })
    await settle(2)
    expect(head().getAttribute('aria-expanded')).toBe('true')
    expect(head().disabled).toBe(true)
  })

  it('says what the mail and calendar connections are doing in a status dot, not a paragraph', async () => {
    await sidebar()
    const dot = host.querySelector('.side-status')!
    expect(dot.getAttribute('aria-label')).toMatch(/simulated|Gmail connected/)
    expect(host.textContent).not.toContain('read only). Calendar')
  })
})
