import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, settle } from '../../testing/dom'
import { salesWorld } from '../../testing/fixtures'
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
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function show(role: 'sales' | 'viewer') {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld())
  setRole(m, role)
  const { Contact } = await import('./Contact')
  await act(async () => { root.render(<Contact route={{ page: 'contact', id: 'ct1' }} />) })
  await settle(3)
  return m
}

describe('Find mobile on the contact page', () => {
  it('sits beside Enrich contact and opens the modal on click', async () => {
    const m = await show('sales')
    expect(button(host, 'Enrich contact')).toBeDefined()
    await click(button(host, 'Find mobile'))
    const ms = m.ui.UI.get().modals
    expect(ms[ms.length - 1]).toMatchObject({ name: 'findMobile', props: { contactId: 'ct1' } })
  })

  it('is not offered to a viewer', async () => {
    await show('viewer')
    expect(button(host, 'Find mobile')).toBeUndefined()
  })

  it('labels a looked-up number as Phone lookup, Unverified, with its source on hover', async () => {
    const m = await loadSales()
    const w = salesWorld()
    m.bootstrap.hydrate(w)
    setRole(m, 'sales')
    const { Act } = await import('../../data/Act')
    Act.applyPhoneLookup('ct1', 'ros', { field: 'mobile', value: '0412 345 678', source: 'Phone lookup (LeadMagic) 11 Oct 2026' })
    const { Contact } = await import('./Contact')
    await act(async () => { root.render(<Contact route={{ page: 'contact', id: 'ct1' }} />) })
    await settle(3)
    const chip = [...host.querySelectorAll('.chip')].find(c => c.textContent === 'Phone lookup, Unverified')
    expect(chip).toBeDefined()
    expect(chip?.getAttribute('title')).toContain('Phone lookup (LeadMagic) 11 Oct 2026')
  })
})
