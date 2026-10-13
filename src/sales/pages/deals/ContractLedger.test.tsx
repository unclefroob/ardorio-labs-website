import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, click, field, settle, type } from '../../testing/dom'
import { ardDeal, CLIENT, invoicingWorld, PLAN_DATA, setArdRole } from '../../testing/invoicingWorld'
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

const text = (): string => host.textContent ?? ''
const fmt = formatCents
/** $54,000 contract from the board: $48,000 baseline, VO-1 +$6,000 approved, VO-2 +$2,400 proposed. Milestones total $60,000. */
const CONTRACT = { baselineCents: 4800000, engagementType: 'fixed-price', contractedOn: '2026-09-03', contractedBy: 'u-me', estimateAtWonCents: 4800000 }
const VO1 = { id: 'v1', label: 'VO-1 Reporting module', amountCents: 600000, reason: 'Reports', status: 'approved', createdAt: '2026-09-20T01:00:00.000Z', createdBy: 'u-me', decidedAt: '2026-09-24T01:00:00.000Z', decidedBy: 'u-me' }
const VO2 = { id: 'v2', label: 'VO-2 Single sign-on', amountCents: 240000, reason: 'Microsoft SSO for staff', status: 'proposed', createdAt: '2026-10-02T01:00:00.000Z', createdBy: 'u-me' }
const MILESTONES = [{ id: 'm1', label: 'Discovery', amountCents: 800000 }, { id: 'm2', label: 'Build', amountCents: 2400000 }, { id: 'm3', label: 'VO-1', amountCents: 600000 }, { id: 'm4', label: 'Launch', amountCents: 1200000 }]

async function show(plan: Record<string, unknown> | null, o: { role?: Parameters<typeof setArdRole>[1]; deal?: Record<string, unknown> } = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1', o.deal).data)], billingPlans: plan ? [rec('bp_dl1', { ...PLAN_DATA, ...plan })] : [] }))
  setArdRole(m, o.role ?? 'admin')
  fakeApi({ 'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }) })
  const { ContractLedger } = await import('./ContractLedger')
  const { Q } = await import('../../data/Q')
  const { Hosts } = await import('../../shell/Hosts')
  const Page = () => { const d = Q.deal('dl1'); return d ? <ContractLedger deal={d} /> : null }
  await act(async () => { root.render(<><Page /><Hosts /></>) })
  await settle(4)
  return { plan: () => m.store.S.billingPlans.find(p => p.dealId === 'dl1') }
}

const ledgerRows = (): string[] => [...host.querySelectorAll('table[aria-label="Contract ledger"] tbody tr')].map(r => r.textContent ?? '')
const total = (): string => host.querySelector('table[aria-label="Contract ledger"] tfoot')?.textContent ?? ''
const dialog = (): HTMLElement | null => host.querySelector('[role="dialog"][aria-label^="Add variation"]')

describe('Contract ledger card', () => {
  it('lists the baseline and every variation with status and who/when, and counts only approved ones', async () => {
    await show({ contract: CONTRACT, variations: [VO1, VO2, { ...VO2, id: 'v3', label: 'VO-3 Kiosk', status: 'rejected', decidedAt: '2026-10-05T01:00:00.000Z', decidedBy: 'u-me' }], milestones: MILESTONES })
    const rows = ledgerRows()
    expect(rows[0]).toContain('Baseline at Won')
    expect(rows[0]).toContain('3 Sep 2026 · Me Myself')
    expect(rows[0]).toContain('Contracted')
    expect(rows[0]).toContain(fmt(4800000))
    expect(rows[1]).toContain('Approved 24 Sep 2026 · Me Myself')
    expect(rows[1]).toContain(`+${fmt(600000)}`)
    expect(rows[2]).toContain('Proposed 2 Oct 2026 · Me Myself · not counted until approved')
    expect(rows[2]).toContain(`(+${fmt(240000)})`)
    expect(rows[3]).toContain('Rejected 5 Oct 2026 · Me Myself · not counted')
    expect(total()).toContain('Contracted (baseline plus approved variations)')
    expect(total()).toContain(fmt(5400000))
    expect(text()).toContain('Fixed-price project')
    // Only the proposed one can be decided.
    expect(button(host, 'Approve')).toBeTruthy()
    expect(host.querySelectorAll('button[aria-label^="Approve "]')).toHaveLength(1)
    expect(host.querySelector('button[aria-label="Reject VO-3 Kiosk"]')).toBeNull()
  })

  it('Approve asks first, then counts the variation and says what it leaves unscheduled', async () => {
    const { plan } = await show({ contract: CONTRACT, variations: [VO1, VO2], milestones: MILESTONES.slice(0, 3) })
    await click(host.querySelector('button[aria-label="Approve VO-2 Single sign-on"]'))
    const confirm = host.querySelector('[role="dialog"][aria-label="Approve VO-2 Single sign-on?"]')
    expect(confirm?.textContent).toContain(`Contracted changes from ${fmt(5400000)} to ${fmt(5640000)}`)
    expect(plan()?.variations?.[1].status).toBe('proposed')
    await click(button(confirm!, 'Approve'))
    expect(plan()?.variations?.[1]).toMatchObject({ status: 'approved', decidedBy: 'u-me' })
    expect(total()).toContain(fmt(5640000))
    const banner = [...host.querySelectorAll('[role="status"]')].find(b => b.textContent?.includes('approved.'))
    expect(banner?.textContent).toBe(`VO-2 Single sign-on approved. Contracted is now ${fmt(5640000)}, and ${fmt(1840000)} is not yet in a milestone.`)
  })

  it('Reject asks first, keeps the entry as rejected and changes nothing counted', async () => {
    const { plan } = await show({ contract: CONTRACT, variations: [VO1, VO2], milestones: MILESTONES })
    await click(host.querySelector('button[aria-label="Reject VO-2 Single sign-on"]'))
    const confirm = host.querySelector('[role="dialog"][aria-label="Reject VO-2 Single sign-on?"]')
    expect(confirm?.textContent).toContain('never counted')
    await click(button(confirm!, 'Cancel'))
    expect(plan()?.variations?.[1].status).toBe('proposed')
    await click(host.querySelector('button[aria-label="Reject VO-2 Single sign-on"]'))
    await click(button(host.querySelector('[role="dialog"][aria-label="Reject VO-2 Single sign-on?"]')!, 'Reject'))
    expect(plan()?.variations?.[1].status).toBe('rejected')
    expect(ledgerRows()[2]).toContain('Rejected')
    expect(total()).toContain(fmt(5400000))
  })

  it('is for Ardorio admins only, and shows nothing on an open deal without a contract', async () => {
    await show({ contract: CONTRACT }, { role: 'manager' })
    expect(text()).toBe('')
    act(() => root.unmount())
    root = createRoot(host)
    await show(null, { deal: { status: 'open' } })
    expect(text()).toBe('')
  })
})

describe('Add variation dialog', () => {
  it('previews the effect of an increase and saves it as proposed, not counted', async () => {
    const { plan } = await show({ contract: CONTRACT, variations: [VO1], milestones: MILESTONES.slice(0, 3) })
    await click(button(host, '+ Add variation'))
    const dlg = dialog()
    expect(dlg).not.toBeNull()
    expect((field(dlg!, 'Label') as HTMLInputElement).value).toBe('VO-2 ')
    expect(dlg?.querySelector('[aria-label="What approving does"]')?.textContent).toContain('Enter an amount')
    await type(field(dlg!, 'Label'), 'VO-2 Single sign-on')
    await type(dlg!.querySelector('#vo-amount'), '2,400')
    const eff = dlg?.querySelector('[aria-label="What approving does"]')?.textContent ?? ''
    expect(eff).toContain(`Contracted changes from ${fmt(5400000)} to ${fmt(5640000)}.`)
    expect(eff).toContain(`Unscheduled changes by +${fmt(240000)}, from ${fmt(1600000)} unscheduled to ${fmt(1840000)} unscheduled.`)
    await click(button(dlg!, 'Save as proposed'))
    expect(text()).toContain('Reason')
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('Say why the contract changes')
    await type(dialog()!.querySelector('textarea'), 'Client asked for SSO')
    await click(button(dialog()!, 'Save as proposed'))
    expect(dialog()).toBeNull()
    expect(plan()?.variations?.[1]).toMatchObject({ label: 'VO-2 Single sign-on', amountCents: 240000, reason: 'Client asked for SSO', status: 'proposed' })
    expect(total()).toContain(fmt(5400000))
  })

  it('Decrease makes the amount negative; Approve now counts it and shows the banner', async () => {
    const { plan } = await show({ contract: CONTRACT, variations: [], milestones: MILESTONES })
    await click(button(host, '+ Add variation'))
    const dlg = dialog()!
    const decrease = button(dlg, '− Decrease')
    await click(decrease)
    expect(decrease?.getAttribute('aria-pressed')).toBe('true')
    await type(dlg.querySelector('#vo-amount'), '1000')
    await type(dlg.querySelector('textarea'), 'Descoped the kiosk')
    expect(dlg.querySelector('[aria-label="What approving does"]')?.textContent).toContain(`from ${fmt(200000)} over-scheduled to ${fmt(300000)} over-scheduled`)
    await click(button(dlg, 'Approve now'))
    expect(plan()?.variations?.[0]).toMatchObject({ amountCents: -100000, status: 'approved', decidedBy: 'u-me' })
    expect(ledgerRows()[1]).toContain(`−${fmt(100000)}`)
    expect(total()).toContain(fmt(4700000))
    expect(text()).toContain(`VO-1 approved. Contracted is now ${fmt(4700000)}, and the milestones are ${fmt(300000)} over the contract.`)
  })

  it('refuses a zero or unreadable amount', async () => {
    const { plan } = await show({ contract: CONTRACT })
    await click(button(host, '+ Add variation'))
    await type(dialog()!.querySelector('textarea'), 'r')
    await click(button(dialog()!, 'Approve now'))
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('Enter the amount')
    await type(dialog()!.querySelector('#vo-amount'), '0')
    await click(button(dialog()!, 'Approve now'))
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('not zero')
    expect(plan()?.variations).toBeUndefined()
  })
})

describe('Set contract for a deal won before the ledger', () => {
  it('offers Set contract prefilled from the deal value and writes the contract once', async () => {
    const { plan } = await show({}, { deal: { close: '2026-07-28', value: 60000 } })
    expect(text()).toContain(`measured against the estimate of ${fmt(6000000)}`)
    await click(button(host, 'Set contract'))
    expect((field(host, 'Contracted amount (A$, ex GST)') as HTMLInputElement).value).toBe('60000.00')
    await type(field(host, 'Contracted amount (A$, ex GST)'), '55000')
    await type(field(host, 'Engagement type'), 'time-materials')
    await click(button(host, 'Save contract'))
    expect(plan()?.contract).toEqual({ baselineCents: 5500000, engagementType: 'time-materials', contractedOn: '2026-07-28', contractedBy: 'u-me', estimateAtWonCents: 6000000 })
    expect(plan()?.milestones).toHaveLength(4)
    expect(button(host, 'Set contract')).toBeUndefined()
    expect(text()).toContain('Contract ledger')
  })

  it('refuses an empty amount', async () => {
    const { plan } = await show(null)
    await click(button(host, 'Set contract'))
    await type(field(host, 'Contracted amount (A$, ex GST)'), '')
    await click(button(host, 'Save contract'))
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Enter the contracted amount')
    expect(plan()).toBeUndefined()
  })
})

describe('Deal Billing tab', () => {
  it('shows the contract ledger above the billing schedule', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ deals: [ardDeal('dl1')], billingPlans: [rec('bp_dl1', { ...PLAN_DATA, contract: CONTRACT, variations: [VO1] })] }))
    setArdRole(m, 'admin')
    fakeApi({ 'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }), 'GET /sales/invoices?dealId=dl1': () => json(200, { invoices: [] }) })
    const { Deal } = await import('./Deal')
    await act(async () => { root.render(<Deal route={{ page: 'deal', id: 'dl1', q: { tab: 'billing' } } as never} />) })
    await settle(6)
    const titles = [...host.querySelectorAll('.card-h h3')].map(h => h.textContent)
    expect(titles.indexOf('Contract ledger')).toBeGreaterThanOrEqual(0)
    expect(titles.indexOf('Contract ledger')).toBeLessThan(titles.indexOf('Billing schedule'))
    expect(total()).toContain(fmt(5400000))
  })
})
