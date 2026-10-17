import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { rosterioWorld, setRole } from '../../testing/rosterioWorld'

// Moving a deal (not a customer) to another company or business, from the deal's menu.

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const moveDealApi = vi.fn()
vi.mock('../../api/deals', () => ({ moveDealApi: (...a: unknown[]) => moveDealApi(...a) }))

let host: HTMLDivElement
let root: Root
let m: Sales
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  moveDealApi.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function open(id = 'dl1') {
  m = await loadSales()
  const w = rosterioWorld({ extraCompanies: { co2: { name: 'Forty Winks' } } })
  w.collections.contacts.push(rec('ct2', { firstName: 'Chris', lastName: 'P', name: 'Chris P', title: 'IT', companyId: 'co2', email: 'c@fw.test', email2: '', phone: '', mobile: '', notes: [], verification: 'Verified' }))
  w.collections.tasks = [rec('tk1', { businessId: 'ros', companyId: 'co1', dealId: 'dl1', title: 'Call', status: 'Not Started', assigneeId: 'u-me', due: '2026-10-20T09:00' })]
  m.bootstrap.hydrate(w)
  setRole(m, 'sales', { ard: 'sales' })
  const { MoveDeal } = await import('./MoveDeal')
  await act(async () => { root.render(<MoveDeal id={id} />) })
  await settle(2)
}
const sel = (label: string): HTMLSelectElement => {
  const l = [...document.querySelectorAll('label')].find(x => x.textContent?.startsWith(label))!
  return (l.parentElement!.querySelector('select') ?? l.querySelector('select'))!
}
async function choose(s: HTMLSelectElement, v: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(s, v)
    s.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
const text = (): string => document.body.textContent ?? ''

describe('Move deal', () => {
  it('moves to another business with what it will take, and says what moved', async () => {
    moveDealApi.mockResolvedValue({ dealId: 'dl1', moved: { tasks: 1, meetings: 0, threads: 0, recs: 0 }, threadsLeft: 0, notes: ['Rosterio already has this deal as a lead.'] })
    await open()
    expect(button(document.body, /Move deal/)?.disabled).toBe(true) // nothing chosen yet
    await choose(sel('Business'), 'ard')
    expect(text()).toMatch(/It moves from Rosterio to \w+, at the same step \(Lead\)/)
    expect(text()).toContain('1 open task goes with it')
    await click(button(document.body, /^Move deal$/))
    await settle(2)
    expect(moveDealApi).toHaveBeenCalledWith('dl1', { businessId: 'ard' })
    const toasts = m.ui.UI.get().toasts.map(t => t.msg)
    expect(toasts.join(' ')).toMatch(/Deal moved to \w+, with 1 task\./)
    expect(toasts.join(' ')).toContain('Rosterio already has this deal as a lead.')
  })

  it('moving to another company asks which of its people are on the deal', async () => {
    moveDealApi.mockResolvedValue({ dealId: 'dl1', moved: { tasks: 1, meetings: 0, threads: 0, recs: 0 }, threadsLeft: 0, notes: [] })
    await open()
    await choose(sel('Company'), 'co2')
    expect(text()).toContain('Contacts on the deal')
    expect(text()).toContain('Chris P')
    await click(button(document.body, /^Move deal$/))
    await settle(2)
    expect(moveDealApi.mock.calls[0][1]).toMatchObject({ companyId: 'co2', contactIds: [] })
  })

  it('a refusal is shown, and nothing closes', async () => {
    moveDealApi.mockImplementation(async () => { const { SalesHttpError } = await import('../../api/http'); throw new SalesHttpError(403, null, 'You cannot add deals to Ardorio') })
    await open()
    await choose(sel('Business'), 'ard')
    await click(button(document.body, /^Move deal$/))
    await settle(2)
    expect(text()).toContain('You cannot add deals to Ardorio')
  })

  it('a won deal is a customer: it says so and offers no move', async () => {
    await open('dl2')
    expect(text()).toContain('it is a customer now')
    expect(button(document.body, /^Move deal$/)?.disabled).toBe(true)
  })
})
