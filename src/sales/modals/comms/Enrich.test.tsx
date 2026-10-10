import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckEmailResponse, EnrichContactResponse, EnrichLogEntry, EnrichLogResponse, EnrichSuggestion, EnrichUsage, EnrichUsageResponse } from '../../api/contract'
import { salesWorld } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const aiEnrichContact = vi.fn<(req: unknown, signal?: AbortSignal) => Promise<EnrichContactResponse>>()
const aiEnrichUsage = vi.fn<(b: string, signal?: AbortSignal) => Promise<EnrichUsageResponse>>()
const aiEnrichLog = vi.fn<(b: string, opts?: { contactId?: string; limit?: number }, signal?: AbortSignal) => Promise<EnrichLogResponse>>()
const aiCheckEmail = vi.fn<(req: { businessId: string; email: string }, signal?: AbortSignal) => Promise<CheckEmailResponse>>()
vi.mock('../../api/ai', () => ({
  aiClassify: vi.fn(), aiCopilot: vi.fn(), aiDraft: vi.fn(), aiMeetingRecap: vi.fn(), aiReplySuggest: vi.fn(), aiResearch: vi.fn(), aiFindPeople: vi.fn(),
  aiEnrichContact: (req: unknown, signal?: AbortSignal) => aiEnrichContact(req, signal),
  aiEnrichUsage: (b: string, signal?: AbortSignal) => aiEnrichUsage(b, signal),
  aiEnrichLog: (b: string, opts?: { contactId?: string; limit?: number }, signal?: AbortSignal) => aiEnrichLog(b, opts, signal),
  aiCheckEmail: (req: { businessId: string; email: string }, signal?: AbortSignal) => aiCheckEmail(req, signal),
}))

let host: HTMLDivElement
let root: Root
const usage = (used: number): EnrichUsage => ({ used, limit: 300, resetsOn: '2026-11-01' })
const found = (suggestions: EnrichSuggestion[], used = 13): EnrichContactResponse => ({
  mode: 'llm', provider: 'xai', model: 'grok-4.7', generated: true, usage: usage(used),
  result: { status: 'found', suggestions, sources: [{ title: 'Acme team', url: 'https://acme.test/team' }], withheld: 0, disclaimer: 'Server disclaimer.' },
})

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  aiEnrichContact.mockReset()
  aiEnrichUsage.mockReset()
  aiEnrichUsage.mockResolvedValue({ enabled: true, usage: usage(12) })
  aiEnrichLog.mockReset()
  aiEnrichLog.mockResolvedValue({ entries: [] })
  aiCheckEmail.mockReset()
  aiCheckEmail.mockImplementation(async req => ({ domain: req.email.split('@')[1], status: 'ok' }))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function setup(xai = true) {
  const m = await loadSales()
  m.bootstrap.hydrate({ ...salesWorld(), ai: { enabled: true, providers: { anthropic: true, xai } } })
  const cache = await import('../../ai/enrichCache')
  const { Enrich } = await import('./Enrich')
  const { UI } = await import('../../ui/store')
  await act(async () => { root.render(<Enrich contactId="ct1" />) })
  return { ...m, cache, UI }
}

const btn = (label: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').startsWith(label))
async function press(label: string): Promise<void> {
  const b = btn(label)
  if (!b) throw new Error(`no button "${label}" among ${[...host.querySelectorAll('button')].map(x => x.getAttribute('aria-label') ?? x.textContent).join(' | ')}`)
  await act(async () => { b.click() })
}
const tick = () => act(async () => { await Promise.resolve() })

describe('defaultPick', () => {
  const ct = (o: Record<string, unknown> = {}) => ({ id: 'ct1', email: 'sam@example.com', title: 'Director', phone: '', verification: 'Unverified', ...o }) as never
  const sug = (o: Partial<EnrichSuggestion>): EnrichSuggestion => ({ field: 'phone', value: '03 9000 0000', kind: 'published', ...o })

  it('ticks a published value that fills an empty field', async () => {
    const { defaultPick } = await import('./Enrich')
    expect(defaultPick(ct(), sug({}))).toBe(true)
  })
  it('unticks anything that would replace a non-empty value, verified or not', async () => {
    const { defaultPick } = await import('./Enrich')
    expect(defaultPick(ct({ verification: 'Unverified' }), sug({ field: 'title', value: 'CEO' }))).toBe(false)
    expect(defaultPick(ct({ verification: 'Verified' }), sug({ field: 'title', value: 'CEO' }))).toBe(false)
    expect(defaultPick(ct({ verification: 'Inferred' }), sug({ field: 'email', value: 'other@example.com' }))).toBe(false)
  })
  it('unticks the same value, inferred values and personal numbers', async () => {
    const { defaultPick } = await import('./Enrich')
    expect(defaultPick(ct(), sug({ field: 'title', value: 'director' }))).toBe(false)
    expect(defaultPick(ct(), sug({ kind: 'inferred' }))).toBe(false)
    expect(defaultPick(ct(), sug({ field: 'mobile', value: '0400 000 000', personal: true }))).toBe(false)
    expect(defaultPick(ct(), sug({ field: 'mobile', value: '0400 000 000', personal: false }))).toBe(true)
  })
})

describe('Enrich modal', () => {
  it('refreshes the allowance on open even when one is cached, and drops an expired one', async () => {
    const m = await loadSales()
    m.bootstrap.hydrate({ ...salesWorld(), ai: { enabled: true, providers: { anthropic: true, xai: true } } })
    const cache = await import('../../ai/enrichCache')
    const { Enrich } = await import('./Enrich')
    cache.setUsage('ros', { used: 300, limit: 300, resetsOn: '2026-11-01' })   // stale: "0 left"
    await act(async () => { root.render(<Enrich contactId="ct1" />) })
    expect(aiEnrichUsage).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('288 of 300 left')
    expect(btn('Find contact details')).toBeDefined()
  })

  it('shows replaces: and the personal-number note, with those rows unticked', async () => {
    await setup()
    aiEnrichContact.mockResolvedValueOnce(found([
      { field: 'title', value: 'Head of Ops', kind: 'published', sourceUrl: 'https://acme.test/team' },
      { field: 'mobile', value: '0400 000 000', kind: 'published', sourceUrl: 'https://acme.test/team', personal: true },
    ]))
    await press('Find contact details')
    expect(host.textContent).toContain('replaces: Director')
    expect(host.textContent).toContain('may be a personal number — check')
    const boxes = [...host.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]')]
    expect(boxes.map(x => x.checked)).toEqual([false, false])
  })

  it('makes no lookup on open: it offers a button and shows the allowance', async () => {
    await setup()
    expect(aiEnrichContact).not.toHaveBeenCalled()
    expect(btn('Find contact details')).toBeDefined()
    expect(host.textContent).toContain('288 of 300 left')
    expect(host.textContent).not.toMatch(/simulated|mock|wiza/i)
  })

  it('shows the loading state with a cancel, then the suggestions with badges and source links', async () => {
    await setup()
    let finish!: (r: EnrichContactResponse) => void
    aiEnrichContact.mockReturnValueOnce(new Promise(r => { finish = r }))
    await press('Find contact details')
    expect(host.textContent).toMatch(/30–60 s/)
    expect(btn('Cancel search')).toBeDefined()
    await act(async () => { finish(found([
      { field: 'phone', value: '+61 3 9000 0000', kind: 'published', sourceUrl: 'https://acme.test/contact' },
      { field: 'mobile', value: '0400 000 000', kind: 'inferred', pattern: undefined },
      { field: 'title', value: 'Evil', kind: 'published', sourceUrl: 'javascript:alert(1)' },
    ])) })
    const text = host.textContent ?? ''
    expect(text).toContain('Published')
    expect(text).toContain('Inferred')
    expect(text).toMatch(/matched on name \+ company; verify identity/i)
    const a = [...host.querySelectorAll('a')].find(x => x.getAttribute('href') === 'https://acme.test/contact')
    expect(a?.getAttribute('rel')).toBe('noreferrer noopener')
    expect(a?.getAttribute('target')).toBe('_blank')
    expect([...host.querySelectorAll('a')].some(x => (x.getAttribute('href') ?? '').startsWith('javascript:'))).toBe(false)
    const boxes = [...host.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]')]
    expect(boxes.map(x => x.checked)).toEqual([true, false, false])   // inferred never starts ticked; Verified title is not overwritten
    expect(host.textContent).toContain('287 of 300 left')
  })

  it('applies only the ticked rows, so an inferred value needs an explicit tick', async () => {
    const m = await setup()
    aiEnrichContact.mockResolvedValueOnce(found([
      { field: 'phone', value: '+61 3 9000 0000', kind: 'published', sourceUrl: 'https://acme.test/contact' },
      { field: 'mobile', value: '0400 000 000', kind: 'inferred' },
    ]))
    await press('Find contact details')
    await press('Apply selected')
    const ct = m.store.S.contacts[0]
    expect(ct.phone).toBe('+61 3 9000 0000')
    expect(ct.mobile ?? '').toBe('')
  })

  it('shows a cached result without a call, and says how old it is', async () => {
    const m = await loadSales()
    m.bootstrap.hydrate({ ...salesWorld(), ai: { enabled: true, providers: { anthropic: true, xai: true } } })
    const cache = await import('../../ai/enrichCache')
    cache.putEnrich('ct1', {
      status: 'found', suggestions: [{ field: 'phone', value: '+61 3 9000 0000', kind: 'published', sourceUrl: 'https://acme.test/c' }],
      sources: [], withheld: 0, disclaimer: 'd', usage: usage(13), model: 'grok-4.7',
    }, Date.now() - 5 * 60_000)
    const { Enrich } = await import('./Enrich')
    await act(async () => { root.render(<Enrich contactId="ct1" />) })
    expect(aiEnrichContact).not.toHaveBeenCalled()
    expect(host.textContent).toContain('cached 5 min ago')
    expect(host.textContent).toContain('+61 3 9000 0000')
    expect(btn('Find contact details')).toBeUndefined()
  })

  it('"Wrong person" drops the result and applies nothing', async () => {
    const m = await setup()
    aiEnrichContact.mockResolvedValueOnce(found([{ field: 'phone', value: '+61 3 9000 0000', kind: 'published', sourceUrl: 'https://acme.test/c' }]))
    await press('Find contact details')
    await press('Wrong person')
    expect(m.cache.getEnrich('ct1')).toBeUndefined()
    expect(m.store.S.contacts[0].phone ?? '').toBe('')
    expect(btn('Find contact details')).toBeDefined()
  })

  it('explains the monthly cap, with the reset date, and does not offer to look up', async () => {
    const m = await setup()
    aiEnrichContact.mockRejectedValueOnce(new m.http.SalesHttpError(429, { error: 'cap', code: 'AI_CAP_REACHED', details: { ...usage(300) } }))
    await press('Find contact details')
    expect(host.textContent).toMatch(/Monthly limit reached/)
    expect(host.textContent).toContain('1 Nov 2026')
    expect(btn('Find contact details')).toBeUndefined()
  })

  it('offers a retry after a provider error and says the call was not counted', async () => {
    const m = await setup()
    aiEnrichContact.mockRejectedValueOnce(new m.http.SalesHttpError(502, { error: 'down', code: 'AI_PROVIDER_ERROR' }))
    await press('Find contact details')
    expect(host.textContent).toMatch(/not counted/)
    aiEnrichContact.mockResolvedValueOnce(found([]))
    await press('Retry')
    expect(aiEnrichContact).toHaveBeenCalledTimes(2)
  })

  it('says results were withheld when nothing could be sourced', async () => {
    await setup()
    aiEnrichContact.mockResolvedValueOnce({ ...found([]), result: { status: 'withheld', suggestions: [], sources: [], withheld: 2, disclaimer: 'd' } })
    await press('Find contact details')
    expect(host.textContent).toMatch(/results withheld — no verifiable source/i)
  })

  it('says nothing was found', async () => {
    await setup()
    aiEnrichContact.mockResolvedValueOnce({ ...found([]), result: { status: 'none', suggestions: [], sources: [], withheld: 0, disclaimer: 'd' } })
    await press('Find contact details')
    expect(host.textContent).toMatch(/No public details found/)
  })

  it('stops waiting when cancelled', async () => {
    await setup()
    aiEnrichContact.mockImplementationOnce((_r, signal) => new Promise((_, rej) => signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))))
    await press('Find contact details')
    await press('Cancel search')
    await tick()
    expect(host.textContent).toMatch(/Cancelled/)
    expect(btn('Find contact details')).toBeDefined()
  })

  it('rejects a LinkedIn hint that is not a profile before calling anything', async () => {
    await setup()
    const input = host.querySelector<HTMLInputElement>('input[type=text], input:not([type])')
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      set?.call(input, 'https://example.com/in/x')
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await press('Find contact details')
    expect(aiEnrichContact).not.toHaveBeenCalled()
    expect(host.textContent).toMatch(/LinkedIn profile address/)
  })

  it('says Grok is not configured, with no way to start a lookup', async () => {
    await setup(false)
    expect(host.textContent).toMatch(/Grok is not configured/)
    expect(btn('Find contact details')).toBeUndefined()
    expect(aiEnrichContact).not.toHaveBeenCalled()
  })
})

const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000 - 60_000).toISOString()
const entry = (o: Partial<EnrichLogEntry> = {}): EnrichLogEntry => ({
  id: 'l1', at: daysAgo(3), userId: 'u2', userName: 'Priya Shah', tool: 'enrich', contactId: 'ct1', outcome: 'ok',
  counts: { published: 1, inferred: 0, withheld: 0, unconfirmed: 0, found: 0 }, ...o,
})
const tickBox = async (i: number): Promise<void> => {
  const boxes = [...host.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]')]
  await act(async () => { boxes[i].click() })
}

describe('Enrich modal: re-enrich warning', () => {
  it('asks for the log of this contact, newest successful entry wins', async () => {
    aiEnrichLog.mockResolvedValue({ entries: [entry({ id: 'a', at: daysAgo(1), outcome: 'provider_error', userName: 'Failed Fred' }), entry({ id: 'b', at: daysAgo(3) })] })
    await setup()
    expect(aiEnrichLog).toHaveBeenCalledWith('ros', { contactId: 'ct1', limit: 20 }, expect.anything())
    expect(host.textContent).toContain('Enriched 3 days ago by Priya Shah')
    expect(host.textContent).not.toContain('Failed Fred')
  })

  it('within 30 days: shows the notice and makes no call until "Enrich again" is clicked', async () => {
    aiEnrichLog.mockResolvedValue({ entries: [entry()] })
    await setup()
    expect(btn('Find contact details')).toBeUndefined()
    expect(btn('Enrich again')).toBeDefined()
    expect(aiEnrichContact).not.toHaveBeenCalled()
    aiEnrichContact.mockResolvedValueOnce(found([]))
    await press('Enrich again')
    expect(aiEnrichContact).toHaveBeenCalledTimes(1)
  })

  it('says "today" for a lookup earlier today', async () => {
    aiEnrichLog.mockResolvedValue({ entries: [entry({ at: new Date(Date.now() - 3_600_000).toISOString() })] })
    await setup()
    expect(host.textContent).toContain('Enriched today by Priya Shah')
  })

  it('treats 29 days as recent and 30 days as old', async () => {
    aiEnrichLog.mockResolvedValue({ entries: [entry({ at: daysAgo(29) })] })
    await setup()
    expect(btn('Enrich again')).toBeDefined()
    act(() => root.unmount())
    root = createRoot(host)
    aiEnrichLog.mockResolvedValue({ entries: [entry({ at: daysAgo(30) })] })
    await setup()
    expect(btn('Enrich again')).toBeUndefined()
    expect(btn('Find contact details')).toBeDefined()
  })

  it('older than 30 days runs as before, with a quiet note and no warning', async () => {
    aiEnrichLog.mockResolvedValue({ entries: [entry({ at: daysAgo(45) })] })
    await setup()
    expect(btn('Find contact details')).toBeDefined()
    expect(btn('Enrich again')).toBeUndefined()
    expect(host.textContent).toContain('Last enriched 45 days ago by Priya Shah')
    aiEnrichContact.mockResolvedValueOnce(found([]))
    await press('Find contact details')
    expect(aiEnrichContact).toHaveBeenCalledTimes(1)
  })

  it('never enriched, or only failed calls: runs as before with no notice', async () => {
    aiEnrichLog.mockResolvedValue({ entries: [entry({ outcome: 'cap' }), entry({ id: 'x', outcome: 'bad_output' })] })
    await setup()
    expect(btn('Find contact details')).toBeDefined()
    expect(host.textContent).not.toMatch(/Enriched .* ago|Last enriched/)
  })

  it('does not block when the log call fails', async () => {
    aiEnrichLog.mockRejectedValue(new Error('boom'))
    await setup()
    expect(btn('Find contact details')).toBeDefined()
    expect(host.textContent).not.toMatch(/Enriched .* ago|Last enriched/)
    aiEnrichContact.mockResolvedValueOnce(found([]))
    await press('Find contact details')
    expect(aiEnrichContact).toHaveBeenCalledTimes(1)
  })

  it('holds the button only while the log is loading, and gives up waiting after 8 s', async () => {
    vi.useFakeTimers()
    try {
      aiEnrichLog.mockImplementation((_b, _o, signal) => new Promise((_, rej) => signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))))
      await setup()
      expect(btn('Find contact details')?.disabled).toBe(true)
      expect(host.textContent).toContain('Checking earlier lookups')
      await act(async () => { await vi.advanceTimersByTimeAsync(8100) })
      expect(btn('Find contact details')?.disabled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('makes no log call when Grok is not configured', async () => {
    await setup(false)
    expect(aiEnrichLog).not.toHaveBeenCalled()
  })
})

describe('Enrich modal: email check on apply', () => {
  const email = (o: Partial<EnrichSuggestion> = {}): EnrichSuggestion => ({ field: 'email', value: 'sam@acme.test', kind: 'published', sourceUrl: 'https://acme.test/team', ...o })

  it('ok: applies silently and keeps published = Unverified', async () => {
    const m = await setup()
    aiEnrichContact.mockResolvedValueOnce(found([email()]))
    await press('Find contact details')
    await tickBox(0)
    await press('Apply selected')
    expect(aiCheckEmail).toHaveBeenCalledWith({ businessId: 'ros', email: 'sam@acme.test' }, undefined)
    expect(m.store.S.contacts[0].email).toBe('sam@acme.test')
    expect(m.store.S.contacts[0].verification).toBe('Unverified')
    expect(m.UI.get().toasts.at(-1)?.msg).not.toMatch(/check/i)
  })

  it('ok: an inferred address stays Inferred', async () => {
    const m = await setup()
    aiEnrichContact.mockResolvedValueOnce(found([email({ kind: 'inferred', sourceUrl: undefined, pattern: 'first.last' })]))
    await press('Find contact details')
    await tickBox(0)
    await press('Apply selected')
    expect(m.store.S.contacts[0].verification).toBe('Inferred')
  })

  it('no_mx: applies nothing, shows the reason inline, unticks the row', async () => {
    const m = await setup()
    aiCheckEmail.mockResolvedValue({ domain: 'acme.test', status: 'no_mx' })
    aiEnrichContact.mockResolvedValueOnce(found([email(), { field: 'phone', value: '+61 3 9000 0000', kind: 'published', sourceUrl: 'https://acme.test/c' }]))
    await press('Find contact details')
    await tickBox(0)
    await press('Apply selected')
    expect(host.textContent).toContain("acme.test doesn't accept email")
    expect(m.store.S.contacts[0].email).toBe('sam@example.com')
    expect(m.store.S.contacts[0].phone ?? '').toBe('')
    const boxes = [...host.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]')]
    expect(boxes.map(x => x.checked)).toEqual([false, true])
    // continuing with the other field applies it without asking again about the unticked email
    aiCheckEmail.mockClear()
    await press('Apply selected')
    expect(aiCheckEmail).not.toHaveBeenCalled()
    expect(m.store.S.contacts[0].phone).toBe('+61 3 9000 0000')
    expect(m.store.S.contacts[0].email).toBe('sam@example.com')
  })

  it('unknown: applies and notes that the domain could not be checked', async () => {
    const m = await setup()
    aiCheckEmail.mockResolvedValue({ domain: 'acme.test', status: 'unknown' })
    aiEnrichContact.mockResolvedValueOnce(found([email()]))
    await press('Find contact details')
    await tickBox(0)
    await press('Apply selected')
    expect(m.store.S.contacts[0].email).toBe('sam@acme.test')
    expect(m.UI.get().toasts.at(-1)?.msg).toContain("Couldn't check acme.test")
  })

  it('a failed check call applies as normal with the same note', async () => {
    const m = await setup()
    aiCheckEmail.mockRejectedValue(new m.http.SalesNetworkError('offline'))
    aiEnrichContact.mockResolvedValueOnce(found([email()]))
    await press('Find contact details')
    await tickBox(0)
    await press('Apply selected')
    expect(m.store.S.contacts[0].email).toBe('sam@acme.test')
    expect(m.UI.get().toasts.at(-1)?.msg).toContain("Couldn't check acme.test")
  })

  it('does not call check-email when no email row is ticked', async () => {
    const m = await setup()
    aiEnrichContact.mockResolvedValueOnce(found([email(), { field: 'phone', value: '+61 3 9000 0000', kind: 'published' }]))
    await press('Find contact details')
    await press('Apply selected')
    expect(aiCheckEmail).not.toHaveBeenCalled()
    expect(m.store.S.contacts[0].phone).toBe('+61 3 9000 0000')
  })
})

describe('Enrich modal: source check', () => {
  it('shows "Found on page" for confirmed and a plain-text warning for unconfirmed', async () => {
    await setup()
    aiEnrichContact.mockResolvedValueOnce(found([
      { field: 'phone', value: '+61 3 9000 0000', kind: 'published', sourceUrl: 'https://acme.test/c', sourceCheck: 'confirmed' },
      { field: 'mobile', value: '0400 000 000', kind: 'published', sourceUrl: 'https://acme.test/d', sourceCheck: 'unconfirmed' },
      { field: 'title', value: 'Head of Ops', kind: 'published', sourceUrl: 'https://acme.test/e' },
    ]))
    await press('Find contact details')
    const text = host.textContent ?? ''
    expect(text.match(/Found on page/g)).toHaveLength(1)
    expect(text.match(/Couldn't open page, check the source yourself/g)).toHaveLength(1)
  })

  it('never labels an inferred suggestion', async () => {
    await setup()
    aiEnrichContact.mockResolvedValueOnce(found([{ field: 'email', value: 'sam@acme.test', kind: 'inferred', sourceCheck: 'confirmed' }]))
    await press('Find contact details')
    expect(host.textContent).not.toContain('Found on page')
  })
})
