import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { ardDeal, invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

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

const stages = (p: string) => [
  { id: `${p}1`, name: 'Lead', prob: 10, required: [], won: false, lost: false },
  { id: `${p}2`, name: 'Closed Won', prob: 100, required: [], won: true, lost: false },
  { id: `${p}3`, name: 'Closed Lost', prob: 0, required: [], won: false, lost: true },
]
const pipe = (id: string, businessId: string, p: string) => rec(id, { businessId, name: 'Pipeline', recurring: false, lostReasons: ['Price'], forecast: [], card: [], stages: stages(p), fields: [] })


async function openContract(fields: Record<string, unknown>, over: Record<string, unknown> = {}) {
  m = await loadSales()
  const world = invoicingWorld({
    pipelines: [pipe('pl1', 'ard', 'sg')],
    deals: [ardDeal('dl1', { status: 'open', stageId: 'sg1', probability: 50, forecast: 'Pipeline', closedAt: null, value: 100000, contractMonths: 24, fields, ...over })],
  })
  m.bootstrap.hydrate(world)
  setArdRole(m, 'admin')
  fakeApi({ 'GET /sales/invoices/clients': () => json(200, { clients: [] }) })
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<Hosts />) })
  await act(async () => { m.ui.UI.open('won', { id: 'dl1' }) })
  await settle()
  await click(button(host, 'Next: contract'))
  await settle(4)
}
const val = (label: string): string => host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)?.value ?? ''

describe('Won dialog, deal priced as a rate and a term', () => {
  it('opens the Contract step as a term agreement with the term, annual fee and build fee from the pricing', async () => {
    await openContract({ priceUnit: 'year', priceAmount: '50000', priceOneOff: '20000' }, { value: 120000 })
    expect(val('Term years')).toBe('2')
    expect(val('Term months')).toBe('0')
    expect(val('Build fee 1 label')).toBe('Build fee')
    expect(val('Build fee 1 amount')).toMatch(/^20000/)
    expect(host.textContent).toContain('2 instalments over 2 years')
    expect(host.textContent).toContain('Contract $120,000.00 ex GST')
  })

  it('turns a monthly price into the annual fee', async () => {
    await openContract({ priceUnit: 'month', priceAmount: '4000', priceOneOff: '' }, { value: 144000, contractMonths: 36 })
    expect(val('Term years')).toBe('3')
    expect(host.textContent).toContain('Year 1 total$48,000.00')
    expect(host.textContent).toContain('Contract $144,000.00 ex GST')
  })

  it('leaves a deal with a typed total on the Contract step as before', async () => {
    await openContract({})
    expect(val('Build fee 1 label')).toBe('')
  })
})
