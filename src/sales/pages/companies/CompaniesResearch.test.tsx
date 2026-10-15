import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const aiCompanyProfile = vi.fn()
vi.mock('../../api/ai', async orig => ({ ...(await orig<object>()), aiCompanyProfile: (...a: unknown[]) => aiCompanyProfile(...a) }))

let host: HTMLDivElement
let root: Root
let m: Sales

const FILLER = 'An innovative company creating innovative things..'
const USAGE = { used: 4, limit: 300, resetsOn: '2026-11-01' }
const co = (id: string, name: string, over: Record<string, unknown> = {}) => rec(id, {
  name, tradingName: name, tags: ['Imported', 'Import: demo'], tech: [], notes: [], industry: 'Information technology', subindustry: 'SaaS software', hq: 'New York City', state: 'New York',
  country: 'United States', domain: `${id}.test`, website: `https://${id}.test`, archived: false, employees: 438, locations: null, description: FILLER, linkedin: '', type: 'Private company',
  researchStatus: 'Not researched', ...over,
})
const rel = (id: string, companyId: string, businessId: string) => rec(id, { companyId, businessId, ownerId: 'u-me', status: 'Prospecting', prospectStatus: 'Open', source: '', priority: 'Medium', tags: [] })
const biz = (id: string, name: string) => rec(id, { name, short: id.toUpperCase(), accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl1', industries: [], roles: [] })

const found = (items: unknown[] = [
  { field: 'description', value: 'Ingredient solutions for food and beverage makers.', sourceUrl: 'https://ingredion.test/about', sourceCheck: 'confirmed' },
  { field: 'employees', value: 11000, sourceUrl: 'https://ingredion.test/careers', sourceCheck: 'confirmed' },
  { field: 'locations', value: 44, sourceUrl: 'https://ingredion.test/locations', sourceCheck: 'unconfirmed' },
]) => ({ mode: 'llm', provider: 'xai', model: 'grok', generated: true, usage: USAGE, result: { items, sources: [{ title: 'About', url: 'https://ingredion.test/about' }], withheld: 0, disclaimer: 'Found by Grok through live web search.' } })

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  aiCompanyProfile.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  const { clearProfileResearch } = await import('../../ai/profileResearch')
  clearProfileResearch()
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const text = (): string => host.textContent ?? ''

async function show(o: { xai?: boolean } = {}) {
  m = await loadSales()
  const w = invoicingWorld({
    businesses: [biz('ard', 'Ardorio'), biz('ros', 'Rosterio')],
    companies: [co('co_a', 'Alpha'), co('co_b', 'Bravo'), co('co_c', 'Charlie'), co('co_d', 'Delta', { tags: [], description: 'A real description.' })],
    companyRels: [rel('r1', 'co_a', 'ros'), rel('r2', 'co_b', 'ros'), rel('r3', 'co_c', 'ros'), rel('r4', 'co_d', 'ros'), rel('r5', 'co_a', 'ard')],
    contacts: [rec('ct_a', { firstName: 'Ann', lastName: 'A', name: 'Ann A', companyId: 'co_a', email: '', title: '', notes: [], archived: false })],
    contactRels: [rec('xr_a', { contactId: 'ct_a', businessId: 'ros', ownerId: 'u-me', leadStatus: 'New', qualification: '', influence: '', priority: 'Medium', lastActivity: null, eligible: true, tags: [] })],
    deals: [],
  })
  ;(w as { ai?: unknown }).ai = { enabled: true, providers: { anthropic: true, xai: o.xai ?? true } }
  m.bootstrap.hydrate(w)
  setArdRole(m, 'admin', { ros: 'admin' })
  const { Companies } = await import('./Companies')
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<><Companies route={{ page: 'companies' }} /><Hosts /></>) })
  await settle(3)
}
const row = (name: string): HTMLElement => [...host.querySelectorAll('tbody tr')].find(r => r.textContent?.includes(name)) as HTMLElement
const co_ = (id: string) => m.store.S.companies.find(c => c.id === id)!
const dialog = (): HTMLElement | null => document.querySelector('[role="dialog"]')

describe('Companies list: research is a button', () => {
  it('shows a Research control per company and filters the list to one import', async () => {
    await show()
    expect(row('Alpha').textContent).toContain('Not researched')
    expect(row('Alpha').querySelector('button[aria-label="Research Alpha"]')).not.toBeNull()
    const sel = host.querySelector<HTMLSelectElement>('select[aria-label="Import"]')!
    expect([...sel.options].map(o => o.textContent)).toEqual(['Any import', 'demo'])
    expect(host.querySelectorAll('tbody tr')).toHaveLength(4)
  })

  it('never researches by itself: nothing is called until the button is pressed', async () => {
    await show()
    await settle(5)
    expect(aiCompanyProfile).not.toHaveBeenCalled()
  })

  it('runs for one company, then waits as "ready to review" without changing the company', async () => {
    let finish!: (v: unknown) => void
    aiCompanyProfile.mockReturnValue(new Promise(r => { finish = r }))
    await show()
    await click(row('Alpha').querySelector('button[aria-label="Research Alpha"]'))
    expect(row('Alpha').textContent).toContain('Researching…')
    expect(aiCompanyProfile).toHaveBeenCalledTimes(1)
    expect(aiCompanyProfile.mock.calls[0][0]).toMatchObject({ businessId: 'ros', companyId: 'co_a' })
    await act(async () => finish(found()))
    await settle()
    expect(row('Alpha').textContent).toContain('3 suggestions ready')
    expect(co_('co_a').description).toBe(FILLER)
    expect(co_('co_a').employees).toBe(438)
    expect(dialog()).toBeNull()
  })

  it('review: gaps and filler start ticked, differing values start unticked, and Apply changes only what is ticked', async () => {
    aiCompanyProfile.mockResolvedValue(found())
    await show()
    await click(row('Alpha').querySelector('button[aria-label="Research Alpha"]'))
    await settle()
    await click(button(row('Alpha'), 'Review'))
    const d = dialog()!
    const box = (label: string) => d.querySelector<HTMLInputElement>(`input[aria-label="Apply ${label}"]`)!
    expect(box('Description').checked).toBe(true)
    expect(box('Locations').checked).toBe(true)
    expect(box('Employees').checked).toBe(false)
    expect(d.textContent).toContain('Filler from import')
    expect(d.textContent).toContain('Differs from the CRM')
    expect(d.textContent).toContain('2 of 3 selected')
    expect(d.textContent).toContain('Sourced · page unchecked')
    await click(button(d, 'Apply 2 fields'))
    const a = co_('co_a')
    expect(a.description).toBe('Ingredient solutions for food and beverage makers.')
    expect(a.locations).toBe(44)
    expect(a.employees).toBe(438)
    expect(a.researchStatus).toBe('Researched')
    expect(a.lastResearched).toBeTruthy()
    expect((a.researchSources as Record<string, { url: string }>).description.url).toBe('https://ingredion.test/about')
    expect(dialog()).toBeNull()
    expect(row('Alpha').textContent).toContain('Researched')
  })

  it('"Everything new" also ticks the values that differ, and "None" clears them', async () => {
    aiCompanyProfile.mockResolvedValue(found())
    await show()
    await click(row('Alpha').querySelector('button[aria-label="Research Alpha"]'))
    await settle()
    await click(button(row('Alpha'), 'Review'))
    const d = dialog()!
    await click(button(d, 'Everything new'))
    expect(d.textContent).toContain('3 of 3 selected')
    await click(button(d, 'None'))
    expect(button(d, /^Apply 0 fields/)?.disabled).toBe(true)
    await click(button(d, 'Fill empty fields'))
    expect(d.textContent).toContain('2 of 3 selected')
  })

  it('Cancel keeps the result for later and changes nothing', async () => {
    aiCompanyProfile.mockResolvedValue(found())
    await show()
    await click(row('Alpha').querySelector('button[aria-label="Research Alpha"]'))
    await settle()
    await click(button(row('Alpha'), 'Review'))
    await click(button(dialog()!, 'Cancel'))
    expect(row('Alpha').textContent).toContain('3 suggestions ready')
    expect(co_('co_a').description).toBe(FILLER)
  })

  it('says plainly when nothing was found', async () => {
    aiCompanyProfile.mockResolvedValue(found([]))
    await show()
    await click(row('Bravo').querySelector('button[aria-label="Research Bravo"]'))
    await settle()
    expect(row('Bravo').textContent).toContain('nothing new')
  })

  it('a failed run is per company, with Try again', async () => {
    await show()
    const { SalesHttpError } = await import('../../api/http')
    aiCompanyProfile.mockRejectedValueOnce(new SalesHttpError(502, { error: 'Provider down', code: 'AI_PROVIDER_ERROR' } as never))
    await click(row('Alpha').querySelector('button[aria-label="Research Alpha"]'))
    await settle()
    expect(row('Alpha').textContent).toContain('Research failed')
    aiCompanyProfile.mockResolvedValueOnce(found())
    await click(button(row('Alpha'), 'Try again'))
    await settle()
    expect(row('Alpha').textContent).toContain('suggestions ready')
  })

  it('the monthly limit is explained, and the button is off', async () => {
    await show()
    const { SalesHttpError } = await import('../../api/http')
    aiCompanyProfile.mockRejectedValueOnce(new SalesHttpError(429, { error: 'Limit', code: 'AI_CAP_REACHED', details: { used: 300, limit: 300, resetsOn: '2026-11-01' } } as never))
    await click(row('Alpha').querySelector('button[aria-label="Research Alpha"]'))
    await settle()
    expect(row('Alpha').textContent).toContain('Limit reached')
    expect(text()).toContain('Monthly research limit reached')
    expect(text()).toContain('300 of 300')
    expect(row('Bravo').querySelector<HTMLButtonElement>('button[aria-label="Research Bravo"]')?.disabled).toBe(true)
  })

  it('without the xAI key the buttons are off and say why, and nothing is called', async () => {
    await show({ xai: false })
    const b = row('Alpha').querySelector<HTMLButtonElement>('button[aria-label="Research Alpha"]')!
    expect(b.disabled).toBe(true)
    expect(b.title).toContain('Research is not set up')
    expect(aiCompanyProfile).not.toHaveBeenCalled()
  })

  it('researches the selected companies one after another and each waits to be reviewed', async () => {
    const order: string[] = []
    aiCompanyProfile.mockImplementation(async (req: { companyId: string }) => { order.push(req.companyId); return found() })
    await show()
    const ticks = host.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')
    await click(ticks[0])
    await click(ticks[1])
    await click(button(host, 'Research 2'))
    await settle(8)
    expect(order).toEqual(['co_a', 'co_b'])
    expect(row('Alpha').textContent).toContain('suggestions ready')
    expect(row('Bravo').textContent).toContain('suggestions ready')
    expect(co_('co_a').description).toBe(FILLER)
    expect(host.textContent).not.toContain('Researching 2 companies')
  })
})

describe('Companies list: change businesses', () => {
  const pick = async (...names: string[]) => { for (const n of names) await click(row(n).querySelector('input[type="checkbox"]')) }

  it('adds a business to the selected companies and their contacts, and Undo puts it back', async () => {
    await show()
    await pick('Bravo', 'Charlie')
    await click(button(host, 'Businesses…'))
    const d = dialog()!
    expect(d.textContent).toContain('2 companies selected')
    await click(d.querySelector('input[aria-label="Ardorio"]'))
    expect(d.textContent).toContain('Add to 2')
    await click(button(d, 'Apply changes'))
    const { S } = m.store
    expect(S.companyRels.filter(r => r.businessId === 'ard').map(r => r.companyId).sort()).toEqual(['co_a', 'co_b', 'co_c'])
    const toast = m.ui.UI.get().toasts.at(-1)!
    expect(toast.msg).toContain('Updated 2 companies')
    toast.action!.fn()
    expect(S.companyRels.filter(r => r.businessId === 'ard').map(r => r.companyId)).toEqual(['co_a'])
  })

  it('removes a business and its contacts there, leaving the company, its contact and their records', async () => {
    await show()
    await pick('Alpha')
    await click(button(host, 'Businesses…'))
    const d = dialog()!
    await click(d.querySelector('input[aria-label="Ardorio"]'))
    expect(d.textContent).toContain('Remove from 1')
    await click(button(d, 'Apply changes'))
    const { S } = m.store
    expect(S.companyRels.some(r => r.companyId === 'co_a' && r.businessId === 'ard')).toBe(false)
    expect(S.companies.some(c => c.id === 'co_a')).toBe(true)
    expect(S.contacts.some(c => c.id === 'ct_a')).toBe(true)
    expect(S.companyRels.some(r => r.companyId === 'co_a' && r.businessId === 'ros')).toBe(true)
  })

  it('explains a business it will not remove because of an open deal', async () => {
    await show()
    m.store.S.deals.push({ id: 'dl9', companyId: 'co_a', businessId: 'ard', status: 'open', archived: false } as never)
    m.store.reindex()
    await pick('Alpha')
    await click(button(host, 'Businesses…'))
    const d = dialog()!
    await click(d.querySelector('input[aria-label="Ardorio"]'))
    expect(d.textContent).toContain('Alpha stays in Ardorio')
    expect(d.textContent).toContain('open deal')
    expect(button(d, 'Apply changes')?.disabled).toBe(true)
  })
})
