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

async function openArchive(withRetainer: boolean, mode: 'archive' | 'restore' = 'archive', retainer: Record<string, unknown> = RETAINER) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    deals: [rec('dl1', { ...ardDeal('dl1').data, ...(mode === 'restore' ? { archived: true } : {}) })],
    billingPlans: [rec('bp_dl1', { dealId: 'dl1', businessId: 'ard', milestones: [], ...(withRetainer ? { retainer } : {}) })],
  }))
  setArdRole(m, 'admin')
  m.ui.bindNavigate(vi.fn())
  const { ArchiveRecord } = await import('./Archive')
  await act(async () => { root.render(<ArchiveRecord kind="deal" id="dl1" mode={mode} />) })
  await settle()
}

const dialog = (): HTMLElement => {
  const d = document.querySelector<HTMLElement>('[role="dialog"]')
  if (!d) throw new Error('no dialog')
  return d
}
const box = (): HTMLInputElement | null => dialog().querySelector('input[type="checkbox"]')

describe('Archiving a deal that has a retainer', () => {
  // The API scheduler drafts only for a won deal that is not archived, and leaves the plan as it is meanwhile.
  it('says drafting pauses while archived and resumes on restore, and keeps the retainer', async () => {
    await openArchive(true)
    expect(dialog().textContent).toContain('This deal has a monthly retainer of $4,500.00.')
    expect(dialog().textContent).toContain('No retainer invoices are drafted while the deal is archived')
    expect(dialog().textContent).toContain('picks up where it stopped when the deal is restored')
    expect(dialog().textContent).not.toContain('Archiving does not stop it')
    expect(box()).toBeNull()
    await click(button(dialog(), 'Archive deal'))
    expect(m.store.S.deals.find(d => d.id === 'dl1')?.archived).toBe(true)
    expect(m.store.S.billingPlans[0].retainer).toEqual(RETAINER)
  })

  it('keeps the server-owned last drafted period, so a restore cannot draft a billed month again', async () => {
    const drafted = { ...RETAINER, lastDraftedFor: '2026-10-01' }
    await openArchive(true, 'archive', drafted)
    await click(button(dialog(), 'Archive deal'))
    expect(m.store.S.billingPlans[0].retainer).toEqual(drafted)
  })

  it('says nothing about a retainer when the deal has none', async () => {
    await openArchive(false)
    expect(dialog().textContent).not.toContain('retainer')
    expect(box()).toBeNull()
    await click(button(dialog(), 'Archive deal'))
    expect(m.store.S.deals.find(d => d.id === 'dl1')?.archived).toBe(true)
  })
})

describe('Restoring a deal that has a retainer', () => {
  it('says the retainer resumes with the next draft date', async () => {
    await openArchive(true, 'restore')
    expect(dialog().textContent).toContain('Its monthly retainer resumes, with the next draft on 1 Nov 2026')
    await click(button(dialog(), 'Restore deal'))
    expect(m.store.S.deals.find(d => d.id === 'dl1')?.archived).not.toBe(true)
    expect(m.store.S.billingPlans[0].retainer).toEqual(RETAINER)
  })

  it('warns on restore that only the latest missed month is drafted and the rest are skipped', async () => {
    // The fixture clock is 9 Oct 2026, so July to October are all due.
    await openArchive(true, 'restore', { ...RETAINER, nextInvoiceDate: '2026-07-01', lastDraftedFor: '2026-06-01' })
    expect(dialog().textContent).toContain('Retainer drafting resumes, 4 months behind.')
    expect(dialog().textContent).toContain('Only October 2026 is drafted, on the next run.')
    expect(dialog().textContent).toContain('July 2026 to September 2026 are skipped')
  })
})
