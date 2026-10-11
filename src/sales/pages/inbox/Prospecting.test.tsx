import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { settle } from '../../testing/dom'
import { loadSales } from '../../testing/load'
import { rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('Prospecting tabs with the lead list held back (the default for this release)', () => {
  it('has no Lead list tab, and a link to it falls back to company research', async () => {
    const m = await loadSales()
    m.bootstrap.hydrate(rosterioWorld())
    setRole(m, 'sales')
    const { Prospecting } = await import('./Prospecting')
    await act(async () => { root.render(<Prospecting route={{ page: 'prospecting', q: { tab: 'leads' } }} />) })
    await settle(3)
    const tabs = [...host.querySelectorAll('[role=tab], .tab, button')].map(e => e.textContent?.trim())
    expect(tabs).toContain('Company research')
    expect(tabs).toContain('Import leads (CSV)')
    expect(tabs).not.toContain('Lead list')
    expect(host.textContent).toContain('Research a company')
  })
})
