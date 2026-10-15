import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { button, click, settle, type } from '../../testing/dom'
import { ardDeal, invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))


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
  vi.restoreAllMocks()
})

const NOTES = 'Line one\n\nLine three with the price: A$50,000 a year.'
const field = (): HTMLTextAreaElement | null => host.querySelector('textarea[aria-label="Scope summary"]')

async function show(description = 'Old scope') {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({ deals: [ardDeal('dl1', { status: 'open', description })] }))
  setArdRole(m, 'admin')
  fakeApi({})
  const { Q } = await import('../../data/Q')
  const { ScopeCard } = await import('./ScopeCard')
  const { Hosts } = await import('../../shell/Hosts')
  const d = Q.deal('dl1')!
  await act(async () => { root.render(<><ScopeCard d={d} can /><Hosts /></>) })
  await settle()
  return () => m.store.S.deals.find(x => x.id === 'dl1')!.description
}

describe('Deal scope editor', () => {
  it('edits in a multi-line text box on the card, not the one-line prompt, and saves the line breaks', async () => {
    const saved = await show()
    await click(button(host, 'Edit'))
    expect(field()).not.toBeNull()
    expect(field()?.value).toBe('Old scope')
    expect(m.ui.UI.get().modals).toHaveLength(0)
    await type(field(), NOTES)
    await click(button(host, 'Save'))
    expect(saved()).toBe(NOTES)
    expect(field()).toBeNull()
  })

  it('Cancel leaves the scope as it was', async () => {
    const saved = await show()
    await click(button(host, 'Edit'))
    await type(field(), 'Changed')
    await click(button(host, 'Cancel'))
    expect(saved()).toBe('Old scope')
    expect(host.textContent).toContain('Old scope')
  })

  it('Ctrl+Enter saves and Escape cancels', async () => {
    const saved = await show()
    await click(button(host, 'Edit'))
    await type(field(), 'Via keyboard')
    await act(async () => { field()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })) })
    expect(saved()).toBe('Via keyboard')
    await click(button(host, 'Edit'))
    await type(field(), 'Not kept')
    await act(async () => { field()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(field()).toBeNull()
    expect(saved()).toBe('Via keyboard')
  })
})
