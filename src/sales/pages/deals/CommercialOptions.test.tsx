// Commercial options on a deal: add and save options, the margin shown, accepting one sets the deal's value and price, and moving the
// deal into Proposal asks which model is going to the client. The app clock follows the bootstrap's serverNow (9 Oct 2026).
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec, salesWorld } from '../../testing/fixtures'
import { button, click, settle, type } from '../../testing/dom'
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

const ARD = rec('ard', { name: 'Ardorio', short: 'ARD', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl_ard', industries: [], roles: [] })
const PIPE = rec('pl_ard', {
  businessId: 'ard', name: 'Sales', recurring: false, lostReasons: ['Price'], forecast: ['Pipeline', 'Best case', 'Commit'], card: [], fields: [],
  stages: [
    { id: 'sq', name: 'Qualified', prob: 20, required: [], won: false, lost: false },
    { id: 'sp', name: 'Proposal', prob: 50, required: [], won: false, lost: false },
    { id: 'sw', name: 'Closed Won', prob: 100, required: [], won: true, lost: false },
    { id: 'sl', name: 'Closed Lost', prob: 0, required: [], won: false, lost: true },
  ],
})
const opt = (id: string, over: Record<string, unknown>) => ({
  id, name: id, unit: 'year', amount: 0, oneOff: 0, months: 36, hosting: '', aiUsage: '', support: '', customDev: '', notes: '',
  costOneOff: 0, costHostingYear: 0, costAiYear: 0, costSupportYear: 0, status: 'draft', ...over,
})
const OZDARE = [
  opt('Outright purchase', { unit: 'once', amount: 150000, months: 0, hosting: 'client', aiUsage: 'client' }),
  opt('SaaS client hosted', { amount: 50000, hosting: 'client', aiUsage: 'client' }),
  opt('SaaS Ardorio hosted', { amount: 50000, hosting: 'ardorio', aiUsage: 'ardorio', costHostingYear: 6000, costAiYear: 8000 }),
]
const deal = (over: Record<string, unknown> = {}) => rec('dl1', {
  name: 'Ozdare', title: 'Ozdare platform', businessId: 'ard', companyId: 'co1', pipelineId: 'pl_ard', stageId: 'sq', ownerId: 'u-me', type: 'New business', value: 0, mrr: null,
  recurring: false, contractMonths: 0, close: '2026-12-01', probability: 20, forecast: 'Pipeline', source: 'Outbound', contactIds: ['ct1'], primaryContact: 'ct1',
  next: '', description: '', lostReason: '', status: 'open', createdAt: '2026-10-01T09:00', stageChangedAt: '2026-10-01T09:00', lastActivity: '2026-10-01T09:00',
  closedAt: null, priority: 'Medium', fields: { options: OZDARE }, stageHistory: [], notes: [], ...over,
})

async function show(over: Record<string, unknown> = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ businesses: [ARD], pipelines: [PIPE], deals: [deal(over)] }))
  m.ui.bindNavigate(vi.fn())
  const { Commercials } = await import('./Commercials')
  const { Hosts } = await import('../../shell/Hosts')
  const { useStore } = await import('../../data/store')
  function Live() {
    useStore()
    const d = m.store.S.deals.find(x => x.id === 'dl1')
    return d ? <Commercials d={d} /> : null
  }
  await act(async () => { root.render(<><Live /><Hosts /></>) })
  await settle()
}
const dealNow = () => m.store.S.deals.find(x => x.id === 'dl1')!
const cards = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('[data-testid="commercial-option"]')]
const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="dialog"]')

describe('Commercial options on the Commercials tab', () => {
  it('shows every option with its contract total and margin, and a comparison table', async () => {
    await show()
    expect(cards()).toHaveLength(3)
    const table = host.querySelector('table[aria-label="Options compared"]')?.textContent ?? ''
    expect(table).toContain('Outright purchase')
    expect(table).toContain('A$150,000')
    // SaaS Ardorio hosted: 150k - (6k + 8k) x 3 years = 108k, 72%
    expect(cards()[2].textContent).toContain('A$108,000 (72%)')
    expect(cards()[1].textContent).toContain('A$150,000 (100%)')
  })

  it('is not offered on a deal outside Ardorio', async () => {
    await show({ businessId: 'ros' })
    expect(host.textContent).not.toContain('Commercial options')
  })

  it('adds an option and saves it on the deal without touching its value', async () => {
    await show({ fields: {} })
    expect(host.textContent).toContain('No options yet')
    await click(button(host, 'Add the first option'))
    expect(cards()).toHaveLength(1)
    await click(button(host, 'Save options'))
    const saved = dealNow().fields.options as Array<{ name: string }>
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('Option 1')
    expect(dealNow().value).toBe(0)
  })

  it('accepting an option sets the deal value, term and price, weighted value follows, and every option stays', async () => {
    await show()
    await click(button(cards()[1], 'Client chose this'))
    const d = dealNow()
    expect(d.value).toBe(150000)
    expect(d.contractMonths).toBe(36)
    expect(d.fields).toMatchObject({ priceUnit: 'year', priceAmount: 50000 })
    const opts = d.fields.options as Array<{ id: string; status: string }>
    expect(opts.map(o => [o.id, o.status])).toEqual([['Outright purchase', 'draft'], ['SaaS client hosted', 'accepted'], ['SaaS Ardorio hosted', 'draft']])
    expect(m.store.S.deals[0].value * (d.probability / 100)).toBe(30000)
    expect(host.textContent).toContain('Accepted')
  })

  it('choosing a different option later replaces the value and demotes the earlier one to proposed', async () => {
    await show()
    await click(button(cards()[0], 'Client chose this'))
    expect(dealNow().value).toBe(150000)
    expect(dealNow().contractMonths).toBe(0)
    await click(button(cards()[2], 'Client chose this'))
    const opts = dealNow().fields.options as Array<{ id: string; status: string }>
    expect(opts.map(o => o.status)).toEqual(['proposed', 'draft', 'accepted'])
  })

  it('refuses to remove the accepted option', async () => {
    await show()
    await click(button(cards()[1], 'Client chose this'))
    await click(button(cards()[1], 'Remove'))
    expect(cards()).toHaveLength(3)
  })

  it('the terms form does not write a stale copy of the options back', async () => {
    await show()
    await click(button(cards()[0], 'Client chose this'))
    await click(button(host, 'Save'))
    expect((dealNow().fields.options as Array<{ status: string }>)[0].status).toBe('accepted')
  })

  it('a name change is saved only when saved', async () => {
    await show()
    const name = cards()[0].querySelector<HTMLInputElement>('input[aria-label="Option name"]')
    await type(name, 'Buy it outright')
    expect(host.textContent).toContain('Unsaved changes')
    await click(button(host, 'Save options'))
    expect((dealNow().fields.options as Array<{ name: string }>)[0].name).toBe('Buy it outright')
  })
})

describe('Moving into Proposal', () => {
  async function move() {
    const { tryMove } = await import('../../shared/moves')
    await act(async () => { tryMove('dl1', 'sp') })
    await settle()
  }

  it('asks which model is being proposed, lists the options, and marks the chosen ones', async () => {
    await show()
    await move()
    expect(dialog()?.textContent).toContain('Which commercial model are you proposing?')
    expect(dialog()?.textContent).toContain('SaaS Ardorio hosted')
    expect(dealNow().stageId).toBe('sq')
    expect(button(dialog()!, /Propose/)?.disabled).toBe(true)
    await click(dialog()!.querySelector('input[aria-label="Propose SaaS client hosted"]'))
    await click(dialog()!.querySelector('input[aria-label="Propose SaaS Ardorio hosted"]'))
    await click(button(dialog()!, /Propose 2 options/))
    expect(dealNow().stageId).toBe('sp')
    expect((dealNow().fields.options as Array<{ status: string }>).map(o => o.status)).toEqual(['draft', 'proposed', 'proposed'])
  })

  it('can move without choosing, leaving every option saved as it was', async () => {
    await show()
    await move()
    await click(button(dialog()!, 'Move without choosing'))
    expect(dealNow().stageId).toBe('sp')
    expect((dealNow().fields.options as Array<{ status: string }>).every(o => o.status === 'draft')).toBe(true)
  })

  it('Keep in Qualified leaves the deal where it is', async () => {
    await show()
    await move()
    await click(button(dialog()!, /Keep in/))
    expect(dealNow().stageId).toBe('sq')
  })

  it('does not ask when a deal has no options, or when one is already proposed', async () => {
    await show({ fields: {} })
    await move()
    expect(dialog()).toBeNull()
    expect(dealNow().stageId).toBe('sp')
  })

  it('does not ask again once an option is proposed', async () => {
    await show({ fields: { options: [opt('a', { status: 'proposed', amount: 10 })] } })
    await move()
    expect(dialog()).toBeNull()
    expect(dealNow().stageId).toBe('sp')
  })
})
