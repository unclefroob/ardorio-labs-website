import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvoiceDto } from '../../api/contract'
import { changes } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { boardInvoices, dto, invoicingWorld, setArdRole, SUMMARY } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const LIST = 'GET /sales/invoices'
const SUM = 'GET /sales/invoices/summary'

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

const text = (): string => host.textContent ?? ''
const rows = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('tbody tr')]
const tab = (label: string): Element | undefined => [...host.querySelectorAll('[role="tab"]')].find(t => t.textContent?.startsWith(label))

const VOIDED = { voidedAt: '2026-10-12T04:41:00.000Z', voidedBy: 'u-me', reason: 'mistake' as const, note: '', linkDeactivated: true }
const cancelled = dto({ id: 'v', invoiceNumber: 'INV-0042', status: 'void', overdue: false, createdAt: '2026-10-05T00:00:00Z', voided: VOIDED, subtotalCents: 400000, gstCents: 40000, totalCents: 440000 })
const REFUND = { amountCents: 440000, receivedAt: '2026-10-13T01:00:00.000Z', reference: 'pi_3Qx', acknowledgedAt: null, acknowledgedBy: null }

async function show(list: InvoiceDto[], tiles: Partial<typeof SUMMARY.tiles> = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld())
  setArdRole(m, 'admin')
  const api = fakeApi({ [LIST]: () => json(200, { invoices: list }), [SUM]: () => json(200, { ...SUMMARY, tiles: { ...SUMMARY.tiles, ...tiles } }) })
  const { Invoices } = await import('./Invoices')
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<><Invoices /><Hosts /></>) })
  await settle(8)
  return api
}

describe('Invoices list with cancelled invoices', () => {
  it('keeps them in the All tab, muted, with a struck-through amount and a Cancelled chip with an icon', async () => {
    await show([...boardInvoices(), cancelled])
    const row = rows().find(r => r.textContent?.includes('INV-0042'))!
    expect(row).toBeDefined()
    expect(row.querySelector('.money.strike')?.textContent).toContain('$4,400.00')
    expect(row.querySelector('.void-cell')).not.toBeNull()
    const chip = [...row.querySelectorAll('.chip')].find(c => c.textContent === 'Cancelled')!
    expect(chip.querySelector('svg')).not.toBeNull()
    expect(row.textContent).toContain('Raised by mistake · 12 Oct 2026')
  })

  it('adds no new tab, and counts them only in All', async () => {
    await show([...boardInvoices(), cancelled])
    expect([...host.querySelectorAll('[role="tab"]')].map(t => t.textContent)).toEqual(['All6', 'Drafts1', 'Sent2', 'Overdue1', 'Paid2'])
  })

  it('the Overdue tab never shows a cancelled invoice, even one the server left flagged', async () => {
    await show([...boardInvoices(), { ...cancelled, overdue: true }])
    await click(tab('Overdue'))
    expect(rows().map(r => r.textContent?.slice(0, 8))).toEqual(['INV-0033'])
    await click(tab('Sent'))
    expect(rows().map(r => r.textContent?.slice(0, 8))).not.toContain('INV-0042')
  })

  it('offers only Open and Download PDF on a cancelled row: no Mark paid, Edit or link to copy', async () => {
    await show([cancelled])
    const r = rows()[0]
    expect([...r.querySelectorAll('button')].map(b => b.textContent)).toEqual(['⋯'])
    await click(r.querySelector('button'))
    expect([...host.querySelectorAll('[role="menuitem"]')].map(i => i.textContent?.trim())).toEqual(['Open', 'Download PDF'])
  })

  it('a cancelled invoice with an unacknowledged payment carries a Needs refund badge with an icon', async () => {
    await show([{ ...cancelled, refundDue: REFUND }, ...boardInvoices()])
    const badge = [...host.querySelectorAll('tbody .chip')].find(c => c.textContent === 'Needs refund')!
    expect(badge).toBeDefined()
    expect(badge.querySelector('svg')).not.toBeNull()
    expect(badge.closest('tr')?.textContent).toContain('INV-0042')
  })

  it('an acknowledged refund has no badge', async () => {
    await show([{ ...cancelled, refundDue: { ...REFUND, acknowledgedAt: '2026-10-14T00:00:00Z', acknowledgedBy: 'u-me' } }])
    expect(text()).not.toContain('Needs refund')
  })

  it('a banner counts the payments needing a refund, and Review narrows the list to them', async () => {
    await show([{ ...cancelled, refundDue: REFUND }, ...boardInvoices()], { needsRefundCount: 1, needsRefundCents: 440000 })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('1 payment on cancelled invoices needs a refund ($4,400.00)')
    expect(rows()).toHaveLength(6)
    await click(button(host, 'Review'))
    expect(rows().map(r => r.textContent?.slice(0, 8))).toEqual(['INV-0042'])
    await click(button(host, 'Show all'))
    expect(rows()).toHaveLength(6)
  })

  it('no banner when nothing needs a refund', async () => {
    await show([cancelled], { needsRefundCount: 0, needsRefundCents: 0 })
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })
})
