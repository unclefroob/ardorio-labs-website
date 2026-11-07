import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { RosterioInvoice } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, invoice, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root
let m: Sales
type Navigate = (to: string | number, opts?: { replace?: boolean }) => void
let nav: Mock<Navigate>

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

const INV = 'GET /sales/rosterio/invoices'
const DAY = 86_400_000
const iso = (t: number): string => new Date(t).toISOString()
const biz = (id: string, name: string) => rec(id, { name, short: id.toUpperCase(), accent: '#654321', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl2', industries: [], roles: [] })

// Dates come from the app's clock, which the test world fixes.
const invoices = async (): Promise<RosterioInvoice[]> => {
  const n = (await import('../../data/F')).F.now().getTime()
  const owe = (id: string, o: Partial<RosterioInvoice>) => invoice({ id, status: 'open', amountPaidCents: 0, paidAt: null, attemptCount: 0, createdAt: iso(n - 5 * DAY), ...o })
  return [
    invoice({ id: 'p1', amountPaidCents: 30000, paidAt: iso(n - 3 * DAY) }),
    invoice({ id: 'p2', amountPaidCents: 99900, paidAt: iso(n - 45 * DAY) }),
    owe('f', { attemptCount: 2, amountRemainingCents: 12000 }),
    owe('o', { dueAt: iso(n - DAY), amountRemainingCents: 8000 }),
    owe('n', { dueAt: iso(n + 9 * DAY), amountRemainingCents: 50000 }),
  ]
}

async function show(o: { ros?: 'admin' | 'sales'; routes?: Record<string, () => Response | Promise<Response>>; scopeRos?: boolean } = {}) {
  m = await loadSales()
  const w = invoicingWorld()
  m.bootstrap.hydrate(invoicingWorld({ businesses: [w.collections.businesses[0], biz('ros', 'Rosterio')] }))
  setArdRole(m, 'admin', { ros: o.ros ?? 'admin' })
  nav = vi.fn<Navigate>()
  m.ui.bindNavigate(nav)
  const api = fakeApi({
    'GET /sales/invoices': json(200, { invoices: [] }),
    [INV]: async () => json(200, { configured: true, syncedAt: null, syncError: null, invoices: await invoices() }),
    ...o.routes,
  })
  const { Dashboard } = await import('./Dashboard')
  await act(async () => { root.render(<Dashboard />) })
  await settle(4)
  return api
}

const card = (): Element | null => [...host.querySelectorAll('section.card')].find(c => c.querySelector('.card-h h3')?.textContent === 'Rosterio collections') ?? null
const tile = (label: string): { v: string; s: string; el: HTMLElement } | null => {
  const t = [...(card()?.querySelectorAll<HTMLElement>('.kpi') ?? [])].find(x => x.querySelector('.l')?.textContent === label)
  return t ? { v: t.querySelector('.v')?.textContent ?? '', s: t.querySelector('.s')?.textContent ?? '', el: t } : null
}

describe('Dashboard › Rosterio collections', () => {
  it('shows what was collected, what is outstanding and what is overdue or failed', async () => {
    const api = await show()
    expect(api.count(INV)).toBe(1)
    expect(tile('Collected, last 30 days')?.v).toBe('$300')
    expect(tile('Outstanding')?.v).toBe('$700')
    expect(tile('Overdue or failed')).toMatchObject({ v: '$200', s: '2 invoices' })
  })

  it('red means late: a card that is only being retried counts, in the normal colour', async () => {
    const n = (await import('../../data/F')).F.now().getTime()
    await show({ routes: { [INV]: () => json(200, { configured: true, syncedAt: null, syncError: null, invoices: [invoice({ id: 'r', status: 'open', amountPaidCents: 0, paidAt: null, attemptCount: 1, nextAttemptAt: iso(n + DAY), amountRemainingCents: 5000 })] }) } })
    expect(tile('Overdue or failed')).toMatchObject({ v: '$50', s: '1 invoice' })
    expect(tile('Overdue or failed')?.el.querySelector<HTMLElement>('.v')?.style.color).toBe('')
  })

  it('each tile opens Invoices on the Rosterio tab with its filter', async () => {
    await show()
    for (const [label, filter] of [['Collected, last 30 days', 'paid'], ['Outstanding', 'unpaid'], ['Overdue or failed', 'late']] as const) {
      nav.mockClear()
      await click(tile(label)!.el)
      expect(nav).toHaveBeenCalledTimes(1)
      const url = String(nav.mock.calls[0][0])
      expect(url).toContain('/invoices')
      expect(JSON.parse(new URLSearchParams(url.split('?')[1]).get('q') ?? '{}')).toEqual({ tab: 'ros', filter })
    }
  })

  it('is not there for someone who is not a Rosterio admin, and asks for nothing', async () => {
    const api = await show({ ros: 'sales' })
    expect(card()).toBeNull()
    expect(api.count(INV)).toBe(0)
  })

  it('shows a skeleton while loading', async () => {
    let release: (r: Response) => void = () => undefined
    await show({ routes: { [INV]: () => new Promise<Response>(r => { release = r }) } })
    expect(card()?.querySelector('[aria-label="Loading Rosterio collections"], .skel')).not.toBeNull()
    expect(tile('Outstanding')).toBeNull()
    await act(async () => { release(json(200, { configured: true, syncedAt: null, syncError: null, invoices: [] })) })
    await settle(3)
    expect(card()?.textContent).toContain('No Rosterio invoices yet.')
  })

  it('says so plainly with no invoices, instead of zero tiles', async () => {
    await show({ routes: { [INV]: () => json(200, { configured: true, syncedAt: null, syncError: null, invoices: [] }) } })
    expect(card()?.textContent).toContain('No Rosterio invoices yet.')
    expect(tile('Outstanding')).toBeNull()
  })

  it('a failed load is one line with Try again, and the rest of the dashboard stays', async () => {
    let fail = true
    const api = await show({ routes: { [INV]: async () => (fail ? json(500, { error: 'Boom', code: 'SERVER' }) : json(200, { configured: true, syncedAt: null, syncError: null, invoices: await invoices() })) } })
    expect(card()?.textContent).toContain('Rosterio collections could not be loaded')
    expect(host.querySelector('h1')).not.toBeNull()
    fail = false
    await click(button(card()!, 'Try again'))
    await settle(4)
    expect(api.count(INV)).toBe(2)
    expect(tile('Outstanding')?.v).toBe('$700')
  })

  it('says that the owner, team, source and Mine filters do not apply when one is on', async () => {
    await show()
    expect(card()?.textContent).not.toContain('filters above do not apply')
    await click(button(host, 'Mine'))
    expect(card()?.textContent).toContain('filters above do not apply')
  })
})
