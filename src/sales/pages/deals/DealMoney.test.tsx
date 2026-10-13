import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvoiceDto } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle, type } from '../../testing/dom'
import { ardDeal, CLIENT, dto, invoicingWorld, setArdRole, SETTINGS } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'
import { formatCents } from '../../shared/money'

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

const fmt = formatCents
const text = (): string => host.textContent ?? ''

/**
 * The Deal board (2): $48,000 baseline, VO-1 +$6,000 approved, VO-2 +$2,400 proposed, so $54,000 contracted. Milestones
 * $50,000: discovery paid, build invoiced, the VO-1 module delivered, launch planned. Estimate on the deal $48,000.
 */
const CONTRACT = { baselineCents: 4800000, engagementType: 'fixed-price', contractedOn: '2026-09-03', contractedBy: 'u-me', estimateAtWonCents: 4800000 }
const VO1 = { id: 'v1', label: 'VO-1 Reporting module', amountCents: 600000, reason: 'Reports', status: 'approved', createdAt: '2026-09-20T01:00:00.000Z', createdBy: 'u-me', decidedAt: '2026-09-24T01:00:00.000Z', decidedBy: 'u-me' }
const VO2 = { id: 'v2', label: 'VO-2 Single sign-on', amountCents: 240000, reason: 'SSO', status: 'proposed', createdAt: '2026-10-02T01:00:00.000Z', createdBy: 'u-me' }
const MILESTONES = [
  { id: 'm1', label: 'Discovery and design', amountCents: 800000, deliveredOn: '2026-09-10', deliveredBy: 'Ryan' },
  { id: 'm2', label: 'Build: portal and integrations', amountCents: 2400000, deliveredOn: '2026-10-01', deliveredBy: 'Ryan' },
  { id: 'm3', label: 'Reporting module (VO-1)', amountCents: 600000, deliveredOn: '2026-10-05', deliveredBy: 'Ryan' },
  { id: 'm4', label: 'Launch and handover', amountCents: 1200000 },
]
const PLAN = { dealId: 'dl1', businessId: 'ard', contract: CONTRACT, variations: [VO1, VO2], milestones: MILESTONES }
const BOARD: InvoiceDto[] = [
  dto({ id: 'i11', invoiceNumber: 'INV-0011', milestoneId: 'm1', status: 'paid', subtotalCents: 800000, payment: { method: 'bank-transfer', paidAt: '2026-09-20', amountCents: 880000, reference: '' } }),
  dto({ id: 'i14', invoiceNumber: 'INV-0014', milestoneId: 'm2', status: 'sent', subtotalCents: 2400000 }),
]
const LIST = 'GET /sales/invoices?dealId=dl1'

async function show(o: { plan?: Record<string, unknown>; invoices?: InvoiceDto[]; deal?: Record<string, unknown>; role?: Parameters<typeof setArdRole>[1] } = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1', { value: 48000, close: '2026-09-03', ...o.deal }).data)], billingPlans: [rec('bp_dl1', o.plan ?? PLAN)] }))
  setArdRole(m, o.role ?? 'admin')
  m.ui.bindNavigate(vi.fn())
  const api = fakeApi({
    [LIST]: () => json(200, { invoices: o.invoices ?? BOARD }),
    'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }),
    'GET /sales/invoices/settings': () => json(200, SETTINGS),
  })
  const { BillingCard } = await import('./BillingCard')
  const { Q } = await import('../../data/Q')
  const { F } = await import('../../data/F')
  const { Hosts } = await import('../../shell/Hosts')
  const Page = () => { const d = Q.deal('dl1'); return d ? <BillingCard deal={d} /> : null }
  await act(async () => { root.render(<><Page /><Hosts /></>) })
  await settle(8)
  return { api, today: F.today(), plan: () => m.store.S.billingPlans.find(p => p.dealId === 'dl1')! }
}

const bar = (name: string): Element | null => host.querySelector(`.bul[data-bar="${name}"]`)
const fig = (name: string): string => host.querySelector(`[data-fig="${name}"]`)?.textContent ?? ''
const msTable = (): HTMLTableElement => host.querySelector('table[aria-label="Milestones"]') as HTMLTableElement
const msRows = (): HTMLTableRowElement[] => [...msTable().querySelectorAll<HTMLTableRowElement>('tbody tr')]
const foot = (): string => msTable().querySelector('tfoot')?.textContent ?? ''
const stateChip = (i: number): string => msRows()[i].querySelectorAll('td')[3].querySelector('.chip')?.textContent ?? ''

describe('Project money: the bullet chart and the five figures', () => {
  it('draws earned, invoiced and collected against the contracted marker, each value written as text', async () => {
    await show()
    expect(bar('Earned')?.getAttribute('aria-label')).toBe(`Earned ${fmt(3800000)} of ${fmt(5400000)} contracted`)
    expect(bar('Invoiced')?.getAttribute('aria-label')).toBe(`Invoiced ${fmt(3200000)} of ${fmt(5400000)} contracted`)
    expect(bar('Collected')?.getAttribute('aria-label')).toBe(`Collected ${fmt(800000)} of ${fmt(5400000)} contracted`)
    for (const [b, v] of [['Earned', 3800000], ['Invoiced', 3200000], ['Collected', 800000]] as const) {
      expect(bar(b)?.getAttribute('role')).toBe('img')
      expect(bar(b)?.querySelector('.lab')?.textContent).toBe(b)
      expect(bar(b)?.querySelector('.val')?.textContent).toBe(fmt(v))
    }
    // The marker sits at the contract on every bar, on a scale a tenth past the largest figure.
    const markers = [...host.querySelectorAll('.bul .bt b')].map(b => (b as HTMLElement).style.left)
    expect(markers).toEqual(['90.9%', '90.9%', '90.9%'])
    expect((bar('Invoiced')?.querySelector('.bt i') as HTMLElement).style.width).toBe('53.9%')
    expect(text()).toContain('as recorded in SalesOS')
  })

  it('writes the five figures beside the chart with tabular figures', async () => {
    await show()
    expect(fig('Contracted')).toBe(`${fmt(5400000)}Contracted`)
    expect(fig('Earned')).toBe(`${fmt(3800000)}Earned`)
    expect(fig('Invoiced')).toBe(`${fmt(3200000)}Invoiced`)
    expect(fig('Collected')).toBe(`${fmt(800000)}Collected`)
    expect(fig('Outstanding')).toBe(`${fmt(2400000)}Outstanding (invoiced, not yet paid · none overdue)`)
    for (const v of host.querySelectorAll('[data-fig] .v')) expect(v.className).toContain('money')
  })

  it('says how much of Outstanding is overdue', async () => {
    await show({ invoices: [BOARD[0], { ...BOARD[1], overdue: true }] })
    expect(fig('Outstanding')).toContain(`${fmt(2400000)} overdue`)
  })

  it('an approved variation moves the denominator; a proposed one does not', async () => {
    await show({ plan: { ...PLAN, variations: [VO1, { ...VO2, status: 'approved', decidedAt: '2026-10-13T01:00:00.000Z', decidedBy: 'u-me' }] } })
    expect(fig('Contracted')).toBe(`${fmt(5640000)}Contracted`)
    expect(bar('Earned')?.getAttribute('aria-label')).toBe(`Earned ${fmt(3800000)} of ${fmt(5640000)} contracted`)
  })

  it('leaves void, test, draft and retainer invoices out of invoiced and collected', async () => {
    const extra = [
      dto({ id: 'void', milestoneId: 'm4', status: 'void', subtotalCents: 1200000 }),
      dto({ id: 'test', milestoneId: 'm4', status: 'paid', subtotalCents: 1200000, test: { markedAt: '2026-10-01T00:00:00Z', markedBy: 'u-me', reason: 'trying' } }),
      dto({ id: 'draft', milestoneId: 'm3', status: 'draft', subtotalCents: 600000 }),
      dto({ id: 'ret-auto', invoiceNumber: 'INV-0020', milestoneId: null, status: 'paid', subtotalCents: 120000, source: 'retainer' }),
      dto({ id: 'ret-hand', invoiceNumber: 'INV-0021', milestoneId: null, status: 'sent', subtotalCents: 120000 }),
    ]
    await show({ plan: { ...PLAN, retainer: { amountCents: 120000, interval: 'monthly', nextInvoiceDate: '2027-03-01' } }, invoices: [...BOARD, ...extra] })
    expect(fig('Invoiced')).toBe(`${fmt(3200000)}Invoiced`)
    expect(fig('Collected')).toBe(`${fmt(800000)}Collected`)
    expect(fig('Outstanding')).toContain(fmt(2400000))
    expect(text()).toContain(`Support retainer invoices (${fmt(240000)}) are not counted here.`)
    // The retainer has its own card, with its invoices and what they come to.
    const titles = [...host.querySelectorAll('.card-h h3')].map(h => h.textContent)
    expect(titles).toEqual(['Project money', 'Contract ledger', 'Milestones', 'Support retainer'])
    const retainer = [...host.querySelectorAll('section.card')].find(c => c.querySelector('h3')?.textContent === 'Support retainer')!
    expect(retainer.textContent).toContain('Separate from project progress')
    expect(retainer.textContent).toContain('INV-0020')
    expect(retainer.textContent).toContain('INV-0021')
    expect(retainer.querySelector('[aria-label="Retainer invoiced"]')?.textContent).toBe(`Retainer invoiced ${fmt(240000)} ex GST, not counted in Contracted, Invoiced or Collected above.`)
    // A void invoice of a milestone leaves it as it was.
    expect(stateChip(3)).toBe('Planned')
  })

  it('on a time and materials contract an invoice with no milestone counts as project and is listed under the milestones', async () => {
    await show({
      plan: { ...PLAN, contract: { ...CONTRACT, engagementType: 'time-materials' }, milestones: [] },
      invoices: [dto({ id: 'tm', invoiceNumber: 'INV-0050', milestoneId: null, status: 'sent', subtotalCents: 1500000 })],
    })
    expect(fig('Invoiced')).toBe(`${fmt(1500000)}Invoiced`)
    expect(text()).toContain('Project invoices without a milestone')
    expect(text()).toContain('INV-0050')
  })

  it('with no contract the estimate is the marker, and it says so', async () => {
    await show({ plan: { dealId: 'dl1', businessId: 'ard', milestones: MILESTONES } })
    expect(fig('Estimate (no contract)')).toBe(`${fmt(4800000)}Estimate (no contract)`)
    expect(bar('Earned')?.getAttribute('aria-label')).toBe(`Earned ${fmt(3800000)} of ${fmt(4800000)} estimated, no contract recorded`)
    expect(text()).toContain('no contract is recorded yet')
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('shows a skeleton while the invoices load, and no figures it cannot know', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1', { value: 48000 }).data)], billingPlans: [rec('bp_dl1', PLAN)] }))
    setArdRole(m, 'admin')
    fakeApi({ [LIST]: () => new Promise<Response>(() => undefined) })
    const { BillingCard } = await import('./BillingCard')
    const { Q } = await import('../../data/Q')
    await act(async () => { root.render(<BillingCard deal={Q.deal('dl1')!} />) })
    await settle(4)
    expect(host.querySelector('.bul')).toBeNull()
    expect(host.querySelector('[data-fig]')).toBeNull()
  })
})

describe('Milestones: states and delivery', () => {
  it('chips each milestone Paid, Invoiced, Delivered or Planned, and says when it was delivered', async () => {
    await show()
    expect([0, 1, 2, 3].map(stateChip)).toEqual(['Paid', 'Invoiced', 'Delivered', 'Planned'])
    expect(msRows()[2].textContent).toContain('Delivered 5 Oct 2026 · Ryan')
    expect(msRows()[3].textContent).not.toContain('Delivered')
    // Delivered is a different chip from Planned, not only a different colour.
    expect(msRows()[2].querySelector('.chip')?.className).toContain('acc')
  })

  it('a draft invoice shows as Draft invoice, even on a delivered milestone', async () => {
    await show({ invoices: [...BOARD, dto({ id: 'd3', milestoneId: 'm3', status: 'draft', subtotalCents: 600000 })] })
    expect(stateChip(2)).toBe('Draft invoice')
  })

  it('keeps Create invoice on a planned or delivered milestone that has no invoice', async () => {
    await show()
    expect(button(msRows()[2], 'Create invoice')).toBeTruthy()
    expect(button(msRows()[3], 'Create invoice')).toBeTruthy()
    expect(button(msRows()[0], 'Create invoice')).toBeUndefined()
  })

  it('Mark delivered picks a date defaulting to today, never after it, and stores it', async () => {
    const { today, plan } = await show()
    expect(button(msRows()[2], 'Mark delivered')).toBeUndefined()
    await click(host.querySelector('button[aria-label="Mark delivered: Launch and handover"]'))
    const input = host.querySelector('input[aria-label="Delivered date for Launch and handover"]') as HTMLInputElement
    expect(input.type).toBe('date')
    expect(input.value).toBe(today)
    expect(input.max).toBe(today)
    await click(button(msRows()[3], 'Save delivered'))
    expect(plan().milestones[3].deliveredOn).toBe(today)
    expect(stateChip(3)).toBe('Delivered')
    expect(fig('Earned')).toBe(`${fmt(5000000)}Earned`)
  })

  it('refuses a delivered date in the future and saves nothing', async () => {
    const { plan } = await show()
    await click(host.querySelector('button[aria-label="Mark delivered: Launch and handover"]'))
    await type(host.querySelector('input[aria-label="Delivered date for Launch and handover"]'), '2999-01-01')
    await click(button(msRows()[3], 'Save delivered'))
    expect(text()).toContain('The delivered date cannot be in the future')
    expect(plan().milestones[3].deliveredOn).toBeUndefined()
    await click(button(msRows()[3], 'Cancel'))
    expect(host.querySelector('input[aria-label="Delivered date for Launch and handover"]')).toBeNull()
  })

  it('Undo delivered asks first, then takes the milestone out of Earned', async () => {
    const { plan } = await show()
    await click(host.querySelector('button[aria-label="Undo delivered: Reporting module (VO-1)"]'))
    const dlg = host.querySelector('[role="dialog"][aria-label="Undo delivered for Reporting module (VO-1)?"]')
    expect(dlg?.textContent).toContain(`${fmt(600000)} leaves Earned`)
    await click(button(dlg!, 'Undo delivered'))
    expect(plan().milestones[2].deliveredOn).toBeUndefined()
    expect(stateChip(2)).toBe('Planned')
    expect(fig('Earned')).toBe(`${fmt(3200000)}Earned`)
  })

  it('editing a delivered milestone keeps it delivered', async () => {
    const { plan } = await show()
    await click(button(msRows()[2], 'Edit'))
    await type(host.querySelector('[aria-label="Milestone label"]'), 'Reporting module')
    await click(button(host, 'Save milestone'))
    expect(plan().milestones[2]).toMatchObject({ label: 'Reporting module', deliveredOn: '2026-10-05', deliveredBy: 'Ryan' })
  })
})

describe('Milestones: reconciliation against the contract', () => {
  it('says what is scheduled of the contract and what is not, with Add milestone', async () => {
    await show()
    expect(foot()).toContain(`Scheduled ${fmt(5000000)} of ${fmt(5400000)} contracted`)
    expect(foot()).toContain(`Unscheduled ${fmt(400000)}`)
    await click(button(msTable().querySelector('tfoot')!, 'Add milestone'))
    expect(host.querySelector('[aria-label="Milestone label"]')).toBeTruthy()
    // With the form open the footer stops offering it, so there is only one Add milestone to press.
    expect(button(msTable().querySelector('tfoot')!, 'Add milestone')).toBeUndefined()
  })

  it('all scheduled says so', async () => {
    await show({ plan: { ...PLAN, variations: [VO1, { ...VO1, id: 'v9', label: 'VO-9 cut', amountCents: -400000 }] } })
    expect(foot()).toContain(`Scheduled ${fmt(5000000)} of ${fmt(5000000)} contracted`)
    expect(foot()).toContain('All scheduled')
    expect(foot()).not.toContain('Unscheduled')
  })

  it('milestones past the contract are over-scheduled, in a warning that says what to do', async () => {
    await show({ plan: { ...PLAN, milestones: [...MILESTONES, { id: 'm5', label: 'Training', amountCents: 1000000 }] } })
    expect(foot()).toContain(`Over-scheduled by ${fmt(600000)}`)
    const warn = [...host.querySelectorAll('.banner.warn')].find(b => b.textContent?.includes('Over-scheduled'))
    expect(warn?.getAttribute('role')).toBe('status')
    expect(warn?.textContent).toContain(`Over-scheduled by ${fmt(600000)}. Milestones total ${fmt(6000000)} against ${fmt(5400000)} contracted.`)
    expect(warn?.textContent).toContain('Reduce a milestone, or approve a variation if the client agreed to more work.')
    await click(button(warn!, 'Add variation'))
    expect(m.ui.UI.get().modals.map(x => x.name)).toEqual(['addVariation'])
  })
})

describe('Warnings', () => {
  it('more invoiced than contracted: an alert, and the bar runs past the marker instead of stopping at 100%', async () => {
    await show({ invoices: [...BOARD, dto({ id: 'i15', milestoneId: 'm3', status: 'sent', subtotalCents: 600000 }), dto({ id: 'i16', milestoneId: 'm4', status: 'sent', subtotalCents: 2000000 })] })
    const alert = host.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain(`Invoiced ${fmt(5800000)} exceeds contracted ${fmt(5400000)}. Approve a variation or credit the difference.`)
    const inv = bar('Invoiced')!
    expect(inv.getAttribute('aria-label')).toBe(`Invoiced ${fmt(5800000)} of ${fmt(5400000)} contracted`)
    const width = parseFloat((inv.querySelector('.bt i') as HTMLElement).style.width)
    const marker = parseFloat((inv.querySelector('.bt b') as HTMLElement).style.left)
    expect(width).toBeGreaterThan(marker)
    expect((inv.querySelector('.bt i') as HTMLElement).style.background).toContain('--bad2')
    await click(button(alert!, 'Add variation'))
    expect(m.ui.UI.get().modals.map(x => x.name)).toEqual(['addVariation'])
  })

  it('no over-billed alert while invoiced is within the contract', async () => {
    await show()
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('an estimate edited after Won gets a chip and a banner; Keep as is hides the banner, the chip stays', async () => {
    await show({ deal: { value: 50000 } })
    const chip = [...host.querySelectorAll('.chip')].find(c => c.textContent?.startsWith('Estimate on the deal'))
    expect(chip?.textContent).toBe(`Estimate on the deal: ${fmt(5000000)} (changed after Won)`)
    const banner = [...host.querySelectorAll('.banner.info')].find(b => b.textContent?.includes('after Won'))
    expect(banner?.textContent).toContain(`The estimate changed to ${fmt(5000000)} after Won. Billing still uses the contract, ${fmt(5400000)}.`)
    // The contract stays the denominator.
    expect(fig('Contracted')).toBe(`${fmt(5400000)}Contracted`)
    await click(button(banner!, 'Keep as is'))
    expect([...host.querySelectorAll('.banner.info')].some(b => b.textContent?.includes('after Won'))).toBe(false)
    expect([...host.querySelectorAll('.chip')].some(c => c.textContent?.startsWith('Estimate on the deal'))).toBe(true)
  })

  it('no estimate warning when the deal value still matches the estimate at Won', async () => {
    await show()
    expect(text()).not.toContain('changed after Won')
    expect(text()).not.toContain('after Won.')
  })
})

describe('Who sees the money', () => {
  it('renders nothing and requests nothing for a manager, a sales rep or a viewer', async () => {
    for (const role of ['manager', 'sales', 'viewer'] as const) {
      const { api } = await show({ role })
      expect(text()).toBe('')
      expect(api.calls).toEqual([])
      act(() => root.unmount())
      root = createRoot(host)
    }
  })
})
