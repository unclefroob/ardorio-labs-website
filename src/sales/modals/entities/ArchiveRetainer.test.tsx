import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { ardDeal, invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'

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

const RETAINER = { amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2026-11-01' }

async function openArchive(withRetainer: boolean) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    deals: [rec('dl1', ardDeal('dl1').data)],
    billingPlans: [rec('bp_dl1', { dealId: 'dl1', businessId: 'ard', milestones: [], ...(withRetainer ? { retainer: RETAINER } : {}) })],
  }))
  setArdRole(m, 'admin')
  m.ui.bindNavigate(vi.fn())
  const { ArchiveRecord } = await import('./Archive')
  await act(async () => { root.render(<ArchiveRecord kind="deal" id="dl1" />) })
  await settle()
}

const dialog = (): HTMLElement => {
  const d = document.querySelector<HTMLElement>('[role="dialog"]')
  if (!d) throw new Error('no dialog')
  return d
}
const box = (): HTMLInputElement | null => dialog().querySelector('input[type="checkbox"]')

describe('Archiving a deal that has a retainer', () => {
  it('warns that the retainer keeps drafting, and removes it with the archive by default', async () => {
    await openArchive(true)
    expect(dialog().textContent).toContain('This deal has a monthly retainer of $4,500.00.')
    expect(dialog().textContent).toContain('Archiving does not stop it')
    expect(box()?.checked).toBe(true)
    await click(button(dialog(), 'Archive deal'))
    expect(m.store.S.deals.find(d => d.id === 'dl1')?.archived).toBe(true)
    expect(m.store.S.billingPlans[0].retainer).toBeUndefined()
  })

  it('keeps the retainer when the admin unticks the box', async () => {
    await openArchive(true)
    await click(box())
    expect(box()?.checked).toBe(false)
    await click(button(dialog(), 'Archive deal'))
    expect(m.store.S.deals.find(d => d.id === 'dl1')?.archived).toBe(true)
    expect(m.store.S.billingPlans[0].retainer).toEqual(RETAINER)
  })

  it('says nothing about a retainer when the deal has none', async () => {
    await openArchive(false)
    expect(dialog().textContent).not.toContain('retainer')
    expect(box()).toBeNull()
    await click(button(dialog(), 'Archive deal'))
    expect(m.store.S.deals.find(d => d.id === 'dl1')?.archived).toBe(true)
  })
})
