import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse, OpResult } from '../../../api/contract'
import { appliedResult, changes } from '../../../testing/fixtures'
import { button, field, settle, type } from '../../../testing/dom'
import { loadSales, type Sales } from '../../../testing/load'
import { rosterioWorld, setRole } from '../../../testing/rosterioWorld'

vi.mock('../../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const postBatch = vi.fn()
vi.mock('../../../api/records', () => ({ postBatch: (r: BatchRequest) => postBatch(r), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const aiResearch = vi.fn()
vi.mock('../../../ai/client', async orig => ({ ...(await orig<object>()), research: (...a: unknown[]) => aiResearch(...a) }))

const MSG = "That website doesn't look right. Use a full address like https://example.com."
let host: HTMLDivElement
let root: Root
let m: Sales
let stop: () => void

const RESEARCH = { id: 'rs1', ts: '2026-10-10T00:00:00', by: 'u-me', score: 70, stakeholders: [], overview: 'x', sources: [] }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  postBatch.mockReset()
  aiResearch.mockReset()
  aiResearch.mockResolvedValue({ value: RESEARCH, ai: { source: 'llm', model: 'm' } })
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

async function render() {
  m = await loadSales()
  m.bootstrap.hydrate(rosterioWorld())
  setRole(m, 'sales')
  stop = m.sync.startSync()
  const { Research } = await import('./Research')
  await act(async () => { root.render(<Research />) })
  await settle(2)
}
const submit = async (): Promise<void> => {
  await act(async () => { host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  await settle(4)
}
const fill = async (name: string, website: string): Promise<void> => {
  await type(field(host, 'Company name'), name)
  await type(field(host, 'Website'), website)
}
const text = (): string => host.textContent ?? ''

describe('prospecting research form: website', () => {
  it('shows a plain error under the website and does not run the research', async () => {
    await render()
    await fill('Harbour Retail Group', 'not a website')
    await submit()
    expect(text()).toContain(MSG)
    expect(aiResearch).not.toHaveBeenCalled()
    const web = field(host, 'Website')
    expect(web?.getAttribute('aria-invalid')).toBe('true')
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(MSG)
  })

  it('rejects other schemes and addresses with a login in them', async () => {
    await render()
    for (const bad of ['ftp://example.com', 'https://user:pw@example.com', 'javascript:alert(1)']) {
      await fill('Harbour Retail Group', bad)
      await submit()
      expect(text()).toContain(MSG)
    }
    expect(aiResearch).not.toHaveBeenCalled()
  })

  it('clears the error as soon as the website is edited', async () => {
    await render()
    await fill('Harbour Retail Group', 'not a website')
    await submit()
    await type(field(host, 'Website'), 'example.com')
    expect(text()).not.toContain(MSG)
  })

  it('runs the research with the full address when the website is fine', async () => {
    await render()
    await fill('Harbour Retail Group', 'harbour.com.au')
    await submit()
    expect(aiResearch).toHaveBeenCalledTimes(1)
    expect(aiResearch.mock.calls[0][2]).toMatchObject({ website: 'https://harbour.com.au' })
    expect(text()).not.toContain(MSG)
  })

  it('runs the research with no website at all', async () => {
    await render()
    await fill('Harbour Retail Group', '')
    await submit()
    expect(aiResearch).toHaveBeenCalledTimes(1)
  })

  it('shows the same message when the research service answers INVALID_URL', async () => {
    await render()
    aiResearch.mockRejectedValue(new m.http.SalesHttpError(400, { error: 'bad url', code: 'INVALID_URL' }, 'bad url'))
    await fill('Harbour Retail Group', 'harbour.com.au')
    await submit()
    expect(text()).toContain(MSG)
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(1)
  })

  it('shows the message on the field when the server refuses the new company, and saves no research', async () => {
    await render()
    postBatch.mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => ({
      serverNow: '2026-10-10T00:00:00.000Z',
      results: req.ops.map((op, i): OpResult => ({
        index: i, collection: op.collection, id: op.id, status: 'rejected', rev: null, record: null,
        error: { code: 'INVALID_URL', message: 'bad url', details: { path: 'website' } },
      })),
    }))
    const toast = vi.spyOn(m.ui.UI, 'toast')
    await fill('Harbour Retail Group', 'harbour.com.au')
    await submit()
    expect(text()).not.toContain(MSG)
    await act(async () => { button(host, 'Create company & save research')?.click() })
    await settle(8)
    expect(text()).toContain(MSG)
    expect(m.store.S.companies.find(c => c.name === 'Harbour Retail Group')).toBeUndefined()
    expect(m.store.S.research.find(r => r.id === 'rs1')).toBeUndefined()
    expect(text()).not.toContain('Saved.')
    expect(toast).not.toHaveBeenCalledWith(expect.stringMatching(/^Research saved/), expect.anything(), expect.anything())
  })

  it('saves normally when the server accepts the new company', async () => {
    await render()
    postBatch.mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => ({
      serverNow: '2026-10-10T00:00:00.000Z',
      results: req.ops.map((op, i) => appliedResult(i, op.collection, op.id, 1, 'set' in op ? { ...op.set } : {})),
    }))
    await fill('Harbour Retail Group', 'harbour.com.au')
    await submit()
    await act(async () => { button(host, 'Create company & save research')?.click() })
    await settle(8)
    expect(text()).not.toContain(MSG)
    expect(m.store.S.companies.find(c => c.name === 'Harbour Retail Group')?.website).toBe('https://harbour.com.au')
    expect(text()).toContain('Saved.')
  })
})
