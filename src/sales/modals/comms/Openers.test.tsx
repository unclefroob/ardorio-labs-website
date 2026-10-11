import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse } from '../../api/contract'
import { appliedResult, changes } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const postBatch = vi.fn()
const accept = (): void => { postBatch.mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => ({ serverNow: '2026-10-10T00:00:00.000Z', results: req.ops.map((op, i) => appliedResult(i, op.collection, op.id, 1, 'set' in op ? { ...op.set } : {})) })) }
vi.mock('../../api/records', () => ({ postBatch: (r: BatchRequest) => postBatch(r), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const aiOpener = vi.fn()
const aiSignals = vi.fn()
const aiEnrichUsage = vi.fn()
vi.mock('../../api/ai', async orig => ({
  ...(await orig<object>()),
  aiOpener: (...a: unknown[]) => aiOpener(...a),
  aiSignals: (...a: unknown[]) => aiSignals(...a),
  aiEnrichUsage: (...a: unknown[]) => aiEnrichUsage(...a),
}))

let host: HTMLDivElement
let root: Root
let m: Sales

const usage = { used: 3, limit: 300, resetsOn: '2026-11-01' }
const openers = { mode: 'llm', provider: 'anthropic', model: 'claude', generated: true, openers: [
  { text: 'Congrats on opening the Geelong site {{firstName}}.', sourceUrl: 'https://news.test/geelong', signalKind: 'expansion' },
  { text: 'Saw you are hiring a rostering manager.', sourceUrl: 'https://acme.test/careers', signalKind: 'hiring' },
  { text: 'Third line', sourceUrl: 'javascript:alert(1)', signalKind: 'news' },
] }
const signals = { mode: 'llm', provider: 'xai', model: 'grok-4', generated: true, usage, result: { signals: [{ kind: 'hiring', headline: 'Hiring', sourceUrl: 'https://acme.test/c', date: new Date().toISOString().slice(0, 10) }], sources: [], withheld: 0, disclaimer: 'd' } }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  for (const f of [aiOpener, aiSignals, aiEnrichUsage, postBatch]) f.mockReset()
  accept()
  aiEnrichUsage.mockResolvedValue({ enabled: true, usage })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function render(opts: { anthropic?: boolean; xai?: boolean; body?: string; used?: number } = {}) {
  if (opts.used !== undefined) aiEnrichUsage.mockResolvedValue({ enabled: true, usage: { used: opts.used, limit: 300, resetsOn: '2026-11-01' } })
  m = await loadSales()
  const w = rosterioWorld()
  w.ai = { enabled: opts.anthropic ?? true, providers: { anthropic: opts.anthropic ?? true, xai: opts.xai ?? true } }
  m.bootstrap.hydrate(w)
  setRole(m, 'sales')
  const { Compose } = await import('./Compose')
  await act(async () => { root.render(<Compose contactId="ct1" businessId="ros" body={opts.body} />) })
  await settle(3)
}
const text = (): string => document.body.textContent ?? ''
const editor = (): HTMLElement => document.querySelector('[contenteditable]') as HTMLElement
const hrefs = (): string[] => [...document.querySelectorAll('a')].map(a => a.getAttribute('href') ?? '')

describe('compose: opening lines', () => {
  it('offers the button but calls nothing until clicked', async () => {
    await render()
    expect(button(document.body, 'Opening lines')).toBeDefined()
    expect(aiOpener).not.toHaveBeenCalled()
  })

  it('lists up to three lines with source links and inserts none until one is chosen', async () => {
    await render({ body: 'Hi Jo,\nQuick note.' })
    aiOpener.mockResolvedValue(openers)
    await click(button(document.body, 'Opening lines'))
    await settle(5)
    expect(aiOpener).toHaveBeenCalledWith({ businessId: 'ros', companyId: 'co1' }, expect.anything())
    expect(text()).toContain('Saw you are hiring a rostering manager.')
    expect(hrefs()).toContain('https://news.test/geelong')
    expect(hrefs().some(h => h.startsWith('javascript:'))).toBe(false)
    expect(editor().textContent).not.toContain('Geelong')
    await click(button(document.body, 'Use this'))
    const t = editor().textContent ?? ''
    expect(t.startsWith('Congrats on opening the Geelong site')).toBe(true)
    expect(t).toContain('Hi Jo,')
    expect(t).toContain('Quick note.')
  })

  it('never lets a line add a merge tag to the email', async () => {
    await render()
    aiOpener.mockResolvedValue(openers)
    await click(button(document.body, 'Opening lines'))
    await settle(5)
    await click(button(document.body, 'Use this'))
    expect(editor().textContent).not.toContain('{{')
  })

  it('with no saved signals says so, and checks signals first on request, then shows lines', async () => {
    await render()
    aiOpener.mockResolvedValueOnce({ mode: 'llm', provider: 'anthropic', model: 'claude', generated: false, noSignals: true })
    await click(button(document.body, 'Opening lines'))
    await settle(5)
    expect(text()).toContain('No saved signals for this company yet')
    expect(aiSignals).not.toHaveBeenCalled()
    aiSignals.mockResolvedValue(signals)
    aiOpener.mockResolvedValueOnce(openers)
    await click(button(document.body, /Check signals first/))
    await settle(10)
    expect(aiSignals).toHaveBeenCalledTimes(1)
    expect(m.store.S.intel).toHaveLength(1)
    expect(text()).toContain('Saw you are hiring a rostering manager.')
  })

  it('with no saved signals and no Grok, only says so', async () => {
    await render({ xai: false })
    aiOpener.mockResolvedValue({ mode: 'llm', provider: 'anthropic', model: 'claude', generated: false, noSignals: true })
    await click(button(document.body, 'Opening lines'))
    await settle(5)
    expect(text()).toContain('No saved signals for this company yet')
    expect(button(document.body, /Check signals first/)).toBeUndefined()
  })

  it('is not shown at all when the server has no Claude key', async () => {
    await render({ anthropic: false })
    expect(button(document.body, 'Opening lines')).toBeUndefined()
  })

  it('a failure does not block composing', async () => {
    await render()
    aiOpener.mockRejectedValue(new m.http.SalesHttpError(502, { error: 'down', code: 'AI_PROVIDER_ERROR' }))
    await click(button(document.body, 'Opening lines'))
    await settle(5)
    expect(text()).toContain('Opening lines are not available right now')
    expect(button(document.body, 'Save draft')).toBeDefined()
  })

  describe('signals saved in this browser', () => {
    const today = (): string => new Date().toISOString().slice(0, 10)
    const hiring = { kind: 'hiring' as const, headline: 'Hiring a rostering manager', sourceUrl: 'https://acme.test/careers', date: '' }
    const saveHere = async (items: Array<Record<string, unknown>>) => {
      const { Act } = await import('../../data/Act')
      Act.saveIntel({ companyId: 'co1', businessId: 'ros', kind: 'signals', items: items.map(x => ({ ...x, date: x.date === '' ? today() : x.date })) as never, sources: [], provider: 'xai', model: 'grok', disclaimer: '' })
    }

    it('sends them to the server first, then asks for lines, and never puts them in the request', async () => {
      await render()
      await saveHere([hiring])
      aiOpener.mockImplementation(async () => { expect(postBatch).toHaveBeenCalled(); return openers })
      await click(button(document.body, 'Opening lines'))
      await settle(8)
      expect(aiOpener).toHaveBeenCalledTimes(1)
      expect(aiOpener).toHaveBeenCalledWith({ businessId: 'ros', companyId: 'co1' }, expect.anything())
      expect(text()).toContain('Saw you are hiring a rostering manager.')
    })

    it('when they cannot be synced, says so, offers Retry and does not ask for lines', async () => {
      await render()
      await saveHere([hiring])
      postBatch.mockRejectedValue(new Error('offline'))
      await click(button(document.body, 'Opening lines'))
      await settle(8)
      expect(text()).toContain('Saved here, not synced yet.')
      expect(button(document.body, 'Retry')).toBeDefined()
      expect(aiOpener).not.toHaveBeenCalled()
      expect(text()).not.toContain('No saved signals for this company yet')
      expect(text()).not.toContain('not available right now')
    })

    it('Retry syncs and then shows the lines without another web lookup', async () => {
      await render()
      await saveHere([hiring])
      postBatch.mockRejectedValue(new Error('offline'))
      await click(button(document.body, 'Opening lines'))
      await settle(8)
      accept()
      aiOpener.mockResolvedValue(openers)
      await click(button(document.body, 'Retry'))
      await settle(10)
      expect(aiOpener).toHaveBeenCalledTimes(1)
      expect(aiSignals).not.toHaveBeenCalled()
      expect(text()).toContain('Saw you are hiring a rostering manager.')
    })

    it('treats noSignals from the server as a sync problem when this browser has usable signals', async () => {
      await render()
      await saveHere([hiring])
      aiOpener.mockResolvedValue({ mode: 'llm', provider: 'anthropic', model: 'claude', generated: false, noSignals: true })
      await click(button(document.body, 'Opening lines'))
      await settle(8)
      expect(text()).toContain("Saved here, but the server doesn't have them yet.")
      expect(button(document.body, 'Retry sync')).toBeDefined()
      expect(text()).not.toContain('No saved signals for this company yet')
    })

    it('ignores undated signals: no sync problem, the normal no-signals message', async () => {
      await render()
      await saveHere([{ ...hiring, date: undefined }])
      aiOpener.mockResolvedValue({ mode: 'llm', provider: 'anthropic', model: 'claude', generated: false, noSignals: true })
      await click(button(document.body, 'Opening lines'))
      await settle(8)
      expect(text()).toContain('No saved signals for this company yet')
      expect(text()).not.toContain('not synced')
    })

    it('after a check that found only undated signals, explains and does not call the server for lines', async () => {
      await render()
      aiOpener.mockResolvedValueOnce({ mode: 'llm', provider: 'anthropic', model: 'claude', generated: false, noSignals: true })
      await click(button(document.body, 'Opening lines'))
      await settle(5)
      aiSignals.mockResolvedValue({ ...signals, result: { ...signals.result, signals: [{ kind: 'hiring', headline: 'Hiring', sourceUrl: 'https://acme.test/c' }] } })
      await click(button(document.body, /Check signals first/))
      await settle(10)
      expect(aiSignals).toHaveBeenCalledTimes(1)
      expect(aiOpener).toHaveBeenCalledTimes(1)
      expect(text()).toContain('none with a date in the last 6 months')
    })

    it('after a check whose sync fails, says so and keeps the check result saved', async () => {
      await render()
      aiOpener.mockResolvedValueOnce({ mode: 'llm', provider: 'anthropic', model: 'claude', generated: false, noSignals: true })
      await click(button(document.body, 'Opening lines'))
      await settle(5)
      postBatch.mockRejectedValue(new Error('offline'))
      aiSignals.mockResolvedValue({ ...signals, result: { ...signals.result, signals: [{ kind: 'hiring', headline: 'Hiring', sourceUrl: 'https://acme.test/c', date: today() }] } })
      await click(button(document.body, /Check signals first/))
      await settle(10)
      expect(m.store.S.intel).toHaveLength(1)
      expect(text()).toContain('Saved here, not synced yet.')
      expect(aiOpener).toHaveBeenCalledTimes(1)
    })
  })

  describe('when the monthly limit is reached', () => {
    it('still writes lines from saved signals, and shows when research resumes instead of the check button', async () => {
      await render({ used: 300 })
      aiOpener.mockResolvedValueOnce({ mode: 'llm', provider: 'anthropic', model: 'claude', generated: false, noSignals: true })
      await click(button(document.body, 'Opening lines'))
      await settle(6)
      expect(text()).toContain('Research paused until 1 Nov 2026')
      expect(button(document.body, /Check signals first/)).toBeUndefined()
      aiOpener.mockResolvedValueOnce(openers)
      await click(button(document.body, 'Opening lines'))
      await settle(6)
      expect(text()).toContain('Saw you are hiring a rostering manager.')
    })
  })
})
