import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, field, settle, type } from '../../testing/dom'
import { rec, salesWorld } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'
import { setRole } from '../../testing/rosterioWorld'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  // A phone: every media query matches.
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))
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

const co = rec('co1', { name: 'Acme', tradingName: 'Acme', tags: [], notes: [], domain: 'acme.test', industry: 'Retail', hq: 'Sydney', state: 'NSW', archived: false })
const crel = rec('cr1', { companyId: 'co1', businessId: 'ros', ownerId: 'u-me', status: 'Prospecting', prospectStatus: 'Open', source: '', priority: 'High', tags: [] })

async function load() {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ companies: [co], companyRels: [crel] }))
  setRole(m, 'sales')
  return m
}

describe('Companies on a phone', () => {
  it('shows cards with the name and facts, and a tap opens the company', async () => {
    const m = await load()
    const go = vi.fn()
    m.ui.bindNavigate(go)
    const { Companies } = await import('./Companies')
    await act(async () => { root.render(<Companies route={{ page: 'companies' }} />) })
    await settle(3)
    const card = host.querySelector('ul.tcards > li')
    expect(card?.textContent).toContain('Acme')
    expect(card?.textContent).toContain('acme.test')
    expect(card?.textContent).toContain('Retail · Sydney, NSW')
    expect(host.querySelector('table')).toBeNull()
    await click(card?.querySelector('.tcard-b') ?? card)
    expect(go).toHaveBeenCalledWith(expect.stringContaining('co1'), expect.anything())
  })

  it('counts a changed filter on the Filters button', async () => {
    await load()
    const { Companies } = await import('./Companies')
    await act(async () => { root.render(<Companies route={{ page: 'companies' }} />) })
    await settle(3)
    expect(button(host, 'Filters')).toBeDefined()
    await click(button(host, 'Filters'))
    await type(field(host, 'Industry') ?? host.querySelector('select[aria-label="Industry"]'), 'Retail')
    expect(button(host, /Filters \(1\)|Hide filters/)).toBeDefined()
    await click(button(host, 'Hide filters'))
    expect(button(host, 'Filters (1)')).toBeDefined()
  })
})

describe('Contacts on a phone', () => {
  it('shows cards with the name, title and company, and a tap opens the contact', async () => {
    const m = await load()
    const go = vi.fn()
    m.ui.bindNavigate(go)
    const { Contacts } = await import('./Contacts')
    await act(async () => { root.render(<Contacts route={{ page: 'contacts' }} />) })
    await settle(3)
    const card = host.querySelector('ul.tcards > li')
    expect(card?.textContent).toContain('Sam Buyer')
    expect(card?.textContent).toContain('Director · Acme')
    expect(card?.textContent).toContain('Contacted')
    await click(card?.querySelector('.tcard-b') ?? card)
    expect(go).toHaveBeenCalledWith(expect.stringContaining('ct1'), expect.anything())
  })
})
