import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse, OpResult } from '../../../api/contract'
import { appliedResult, changes } from '../../../testing/fixtures'
import { button, click, settle, type } from '../../../testing/dom'
import { loadSales, type Sales } from '../../../testing/load'
import { rosterioWorld, setRole } from '../../../testing/rosterioWorld'

vi.mock('../../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const postBatch = vi.fn()
vi.mock('../../../api/records', () => ({ postBatch: (r: BatchRequest) => postBatch(r), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const aiLeadList = vi.fn()
const aiEnrichUsage = vi.fn()
vi.mock('../../../api/ai', async orig => ({
  ...(await orig<object>()),
  aiLeadList: (...a: unknown[]) => aiLeadList(...a),
  aiEnrichUsage: (...a: unknown[]) => aiEnrichUsage(...a),
}))

let host: HTMLDivElement
let root: Root
let m: Sales
let stop: () => void

const usage = { used: 3, limit: 300, resetsOn: '2026-11-01' }
const lead = (name: string, over: Record<string, unknown> = {}) => ({ name, website: `https://${name.toLowerCase().replace(/\W/g, '')}.com.au`, state: 'VIC', industry: 'Hospitality', why: `${name} runs several venues.`, sourceUrl: 'https://news.test/a', ...over })
const answer = (leads: unknown[], extra: Record<string, unknown> = {}) => ({
  mode: 'llm', provider: 'xai', model: 'grok-4', generated: true, usage,
  result: { leads, sources: [{ title: 'News', url: 'https://news.test/' }], withheld: 0, disclaimer: 'Found with live web search.', ...extra },
})
const accept = () => postBatch.mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => ({
  serverNow: '2026-10-10T00:00:00.000Z',
  results: req.ops.map((op, i) => appliedResult(i, op.collection, op.id, 1, 'set' in op ? { ...op.set } : {})),
}))

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  postBatch.mockReset()
  aiLeadList.mockReset()
  aiEnrichUsage.mockReset()
  aiEnrichUsage.mockResolvedValue({ enabled: true, usage })
  accept()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  stop?.()
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function render(opts: { configured?: boolean; role?: 'sales' | 'viewer' } = {}) {
  m = await loadSales()
  const w = rosterioWorld()
  w.ai = { enabled: true, providers: { anthropic: true, xai: opts.configured ?? true } }
  m.bootstrap.hydrate(w)
  setRole(m, opts.role ?? 'sales')
  stop = m.sync.startSync()
  const { LeadList } = await import('./LeadList')
  await act(async () => { root.render(<LeadList />) })
  await settle(3)
}
const text = (): string => host.textContent ?? ''
const area = (): HTMLTextAreaElement => host.querySelector('textarea') as HTMLTextAreaElement
const typeArea = async (v: string): Promise<void> => {
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  await act(async () => { set?.call(area(), v); area().dispatchEvent(new Event('input', { bubbles: true })) })
}
const search = async (): Promise<void> => {
  await act(async () => { host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  await settle(6)
}
const QUERY = 'cafes and bars in Melbourne with several venues'
const links = (): string[] => [...host.querySelectorAll('a')].map(a => a.getAttribute('href') ?? '')

describe('lead list from a description', () => {
  it('rejects a description that is too short, with a message, and does not search', async () => {
    await render()
    await typeArea('cafes')
    await search()
    expect(text()).toContain('at least 10 characters')
    expect(aiLeadList).not.toHaveBeenCalled()
  })

  it('rejects a description over 300 characters', async () => {
    await render()
    await typeArea('x'.repeat(301))
    await search()
    expect(text()).toContain('300 characters or fewer')
    expect(aiLeadList).not.toHaveBeenCalled()
  })

  it('searches with the description, state and business, lists results with source links, imports nothing', async () => {
    await render()
    aiLeadList.mockResolvedValue(answer([lead('Bluebird Cafes'), lead('Harbour Bars', { sourceUrl: 'javascript:alert(1)' })]))
    await typeArea(QUERY)
    await type(host.querySelector('select'), 'VIC')
    await search()
    expect(aiLeadList).toHaveBeenCalledWith({ businessId: 'ros', query: QUERY, state: 'VIC' }, expect.anything())
    expect(text()).toContain('Bluebird Cafes')
    expect(text()).toContain('2 companies found')
    expect(links()).toContain('https://news.test/a')
    expect(links().some(h => h.startsWith('javascript:'))).toBe(false)
    expect(m.store.S.companies).toHaveLength(1)
    expect(postBatch).not.toHaveBeenCalled()
  })

  it('marks a company already in the CRM and offers Open, not Add', async () => {
    await render()
    aiLeadList.mockResolvedValue(answer([lead('Acme Pty Ltd', { companyId: 'co1' }), lead('Bluebird Cafes')]))
    await typeArea(QUERY)
    await search()
    expect(text()).toContain('Already in CRM')
    expect(host.querySelectorAll('input[type=checkbox]')).toHaveLength(1)
    expect(button(host, 'Open')).toBeDefined()
  })

  it('also catches a company added since the search, by name', async () => {
    await render()
    aiLeadList.mockResolvedValue(answer([lead('acme pty ltd')]))
    await typeArea(QUERY)
    await search()
    expect(text()).toContain('Already in CRM')
  })

  it('adds one company on click, linked to the business, with the source as its origin', async () => {
    await render()
    aiLeadList.mockResolvedValue(answer([lead('Bluebird Cafes'), lead('Harbour Bars')]))
    await typeArea(QUERY)
    await search()
    await click(button(host, 'Add'))
    await settle(8)
    const co = m.store.S.companies.find(c => c.name === 'Bluebird Cafes')
    expect(co).toMatchObject({ website: 'https://bluebirdcafes.com.au', industry: 'Hospitality', state: 'VIC', source: 'Lead list' })
    expect(m.store.S.companyRels.some(r => r.companyId === co?.id && r.businessId === 'ros')).toBe(true)
    expect(m.store.S.companies.find(c => c.name === 'Harbour Bars')).toBeUndefined()
    expect(text()).toContain('Added')
  })

  it('adds the selected companies together', async () => {
    await render()
    aiLeadList.mockResolvedValue(answer([lead('Bluebird Cafes'), lead('Harbour Bars'), lead('Corner Pubs')]))
    await typeArea(QUERY)
    await search()
    const boxes = [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
    await click(boxes[0])
    await click(boxes[2])
    await click(button(host, /^Add 2 selected/))
    await settle(10)
    expect(m.store.S.companies.map(c => c.name).sort()).toEqual(['Acme Pty Ltd', 'Bluebird Cafes', 'Corner Pubs'])
  })

  it('adds a company with no website when the address is not valid', async () => {
    await render()
    aiLeadList.mockResolvedValue(answer([lead('Bluebird Cafes', { website: 'not a website' })]))
    await typeArea(QUERY)
    await search()
    await click(button(host, 'Add'))
    await settle(8)
    expect(m.store.S.companies.find(c => c.name === 'Bluebird Cafes')?.website).toBe('')
    expect(text()).toContain('Added without a website')
  })

  it('reports it when the server refuses the website, and adds nothing', async () => {
    await render()
    postBatch.mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => ({
      serverNow: '2026-10-10T00:00:00.000Z',
      results: req.ops.map((op, i): OpResult => ({ index: i, collection: op.collection, id: op.id, status: 'rejected', rev: null, record: null, error: { code: 'INVALID_URL', message: 'bad url', details: { path: 'website' } } })),
    }))
    aiLeadList.mockResolvedValue(answer([lead('Bluebird Cafes')]))
    await typeArea(QUERY)
    await search()
    await click(button(host, 'Add'))
    await settle(10)
    expect(text()).toContain('The server did not accept this website')
    expect(m.store.S.companies.find(c => c.name === 'Bluebird Cafes')).toBeUndefined()
  })

  it('says when every result was withheld', async () => {
    await render()
    aiLeadList.mockResolvedValue(answer([], { withheld: 4 }))
    await typeArea(QUERY)
    await search()
    expect(text()).toContain('Results withheld')
  })

  it('says when nothing was found', async () => {
    await render()
    aiLeadList.mockResolvedValue(answer([]))
    await typeArea(QUERY)
    await search()
    expect(text()).toContain('No companies found')
  })

  it('reports a provider error with Retry and adds nothing', async () => {
    await render()
    aiLeadList.mockRejectedValue(new m.http.SalesHttpError(502, { error: 'down', code: 'AI_PROVIDER_ERROR' }))
    await typeArea(QUERY)
    await search()
    expect(text()).toContain('The lookup service had a problem')
    expect(button(host, 'Retry')).toBeDefined()
    expect(m.store.S.companies).toHaveLength(1)
  })

  it('says Grok is not configured and does not offer the search', async () => {
    await render({ configured: false })
    expect(text()).toContain('Grok is not configured')
    expect(button(host, /Find companies/)?.disabled).toBe(true)
    expect(aiLeadList).not.toHaveBeenCalled()
  })

  it('shows the monthly limit and disables the search at the cap', async () => {
    aiEnrichUsage.mockResolvedValue({ enabled: true, usage: { used: 300, limit: 300, resetsOn: '2026-11-01' } })
    await render()
    expect(text()).toContain('Monthly limit reached')
    expect(button(host, /Find companies/)?.disabled).toBe(true)
  })
})
