import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, settle } from '../../testing/dom'
import { ardDeal, CLIENT, dto, invoicingWorld, PLAN_DATA, setArdRole, SETTINGS } from '../../testing/invoicingWorld'
import { loadSales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root

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

const text = (): string => host.textContent ?? ''
const rowsText = (): string[] => [...host.querySelectorAll('tbody tr')].map(r => r.textContent ?? '')
const VOIDED = { voidedAt: '2026-10-12T04:41:00.000Z', voidedBy: 'u-me', reason: 'mistake' as const, note: '', linkDeactivated: true }

async function show(invoices: ReturnType<typeof dto>[]) {
  const m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], billingPlans: [rec('bp_dl1', PLAN_DATA)] }))
  setArdRole(m, 'admin')
  fakeApi({ 'GET /sales/invoices?dealId=dl1': () => json(200, { invoices }), 'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }), 'GET /sales/invoices/settings': () => json(200, SETTINGS) })
  const { BillingCard } = await import('./BillingCard')
  const { Q } = await import('../../data/Q')
  await act(async () => { root.render(<BillingCard deal={Q.deal('dl1')!} />) })
  await settle(8)
}

describe('Deal billing card with a cancelled invoice', () => {
  const paid = dto({ id: 'p1', invoiceNumber: 'INV-0029', milestoneId: 'm1', status: 'paid', subtotalCents: 1800000, payment: { method: 'bank-transfer', paidAt: '2026-08-20', amountCents: 1980000, reference: '' } })
  const gone = dto({ id: 'v', invoiceNumber: 'INV-0042', milestoneId: 'm2', status: 'void', subtotalCents: 1800000, voided: VOIDED })

  it('the milestone is Planned again, not Draft invoice, Invoiced or Paid, and can be invoiced afresh', async () => {
    await show([paid, gone])
    const r = rowsText()
    expect(r[1]).toContain('Core platform')
    expect(r[1]).toContain('Planned')
    expect(r[1]).not.toMatch(/Draft invoice|Invoiced|Paid/)
    expect(r[1]).toContain('INV-0042 cancelled 12 Oct 2026')
    expect(button(host.querySelectorAll('tbody tr')[1], 'Create invoice')).toBeDefined()
    expect(button(host.querySelectorAll('tbody tr')[1], 'Mark paid')).toBeUndefined()
  })

  it('billed progress leaves the cancelled invoice out', async () => {
    await show([paid, gone])
    expect(text()).toContain('Billed $18,000.00 of $60,000.00 quoted')
    expect(host.querySelector('.prog')?.getAttribute('aria-label')).toBe('Paid $18,000.00, invoiced $0.00, not yet billed $42,000.00 of $60,000.00')
  })

  it('Create invoice for all unbilled counts the cancelled milestone', async () => {
    await show([paid, gone])
    expect(button(host, 'Create invoice for all unbilled')?.disabled).toBe(false)
  })
})
