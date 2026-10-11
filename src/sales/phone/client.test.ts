import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PhoneStatusResponse, RevealPhoneResponse } from '../api/contract'
import { salesWorld } from '../testing/fixtures'
import { settle } from '../testing/dom'
import { loadSales } from '../testing/load'

vi.mock('../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const phoneStatusApi = vi.fn<(signal?: AbortSignal) => Promise<PhoneStatusResponse>>()
const revealPhoneApi = vi.fn<(req: unknown, signal?: AbortSignal) => Promise<RevealPhoneResponse>>()
vi.mock('../api/phone', () => ({
  phoneStatusApi: (s?: AbortSignal) => phoneStatusApi(s),
  revealPhoneApi: (r: unknown, s?: AbortSignal) => revealPhoneApi(r, s),
}))

const usage = (used = 12) => ({ used, limit: 100, resetsOn: '2099-11-01' })
const STATUS: PhoneStatusResponse = { configured: true, provider: 'leadmagic', label: 'LeadMagic', usage: usage() }

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  phoneStatusApi.mockReset()
  revealPhoneApi.mockReset()
  phoneStatusApi.mockResolvedValue(STATUS)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function load() {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld())
  const c = await import('./client')
  return { ...m, c }
}

describe('formatPhone', () => {
  it('writes an Australian mobile the way people say it', async () => {
    const { c } = await load()
    expect(c.formatPhone('+61412345678')).toBe('0412 345 678')
    expect(c.formatPhone('+61400000000')).toBe('0400 000 000')
  })
  it('writes Australian landlines with the area code in brackets', async () => {
    const { c } = await load()
    expect(c.formatPhone('+61390000000')).toBe('(03) 9000 0000')
    expect(c.formatPhone('+61291234567')).toBe('(02) 9123 4567')
  })
  it('keeps other countries international and shows odd input as given', async () => {
    const { c } = await load()
    expect(c.formatPhone('+64211234567')).toBe('+64 211234567')
    expect(c.formatPhone('+14155550100')).toBe('+1 4155550100')
    expect(c.formatPhone('not a number')).toBe('not a number')
  })
  it('compares numbers across formats', async () => {
    const { c } = await load()
    expect(c.phoneKey('0412 345 678')).toBe(c.phoneKey('+61412345678'))
    expect(c.phoneKey('+61 412 345 678')).toBe('61412345678')
    expect(c.phoneKey('0412 345 678')).not.toBe(c.phoneKey('0412 345 679'))
  })
})

describe('labels', () => {
  it('shows the reset day and what is left', async () => {
    const { c } = await load()
    expect(c.fmtResets('2026-11-01')).toBe('1 Nov')
    expect(c.fmtResets('soon')).toBe('soon')
    expect(c.phoneLeft(usage(12))).toBe(88)
    expect(c.phoneLeft({ used: 120, limit: 100, resetsOn: '' })).toBe(0)
    expect(c.phoneLeft(undefined)).toBeNull()
  })
  it('says how long ago a number was checked', async () => {
    const { c } = await load()
    const now = Date.parse('2026-10-11T00:00:00Z')
    expect(c.checkedLabel('2026-09-29T00:00:00Z', now)).toBe('Checked 12 days ago')
    expect(c.checkedLabel('2026-10-10T00:00:00Z', now)).toBe('Checked 1 day ago')
    expect(c.checkedLabel('2026-10-10T20:00:00Z', now)).toBe('Checked today')
    expect(c.checkedLabel(undefined, now)).toBeNull()
    expect(c.checkedLabel('garbage', now)).toBeNull()
    expect(c.checkedLabel('2027-01-01T00:00:00Z', now)).toBeNull()
  })
})

describe('status hook', () => {
  async function mount(c: typeof import('./client')) {
    const seen: string[] = []
    const Probe = () => {
      const s = c.usePhoneStatus()
      seen.push(s.s)
      return createElement('span', null, s.s === 'ok' ? `${s.status.label}:${s.status.usage.used}` : s.s)
    }
    await act(async () => { root.render(createElement(Probe)) })
    await settle(3)
    return seen
  }

  it('loads once and shows the status', async () => {
    const { c } = await load()
    await mount(c)
    expect(phoneStatusApi).toHaveBeenCalledTimes(1)
    expect(host.textContent).toBe('LeadMagic:12')
  })

  it('is cached for the session: a second mount makes no call', async () => {
    const { c } = await load()
    await mount(c)
    await act(async () => { root.unmount() })
    root = createRoot(host)
    await mount(c)
    expect(phoneStatusApi).toHaveBeenCalledTimes(1)
    expect(host.textContent).toBe('LeadMagic:12')
  })

  it('two components asking at once share one call', async () => {
    const { c } = await load()
    const A = () => { const s = c.usePhoneStatus(); return createElement('i', null, s.s) }
    await act(async () => { root.render(createElement('div', null, createElement(A), createElement(A))) })
    await settle(3)
    expect(phoneStatusApi).toHaveBeenCalledTimes(1)
  })

  it('reports an error, does not cache it, and retries on demand', async () => {
    const { c } = await load()
    phoneStatusApi.mockRejectedValueOnce(new Error('down'))
    await mount(c)
    expect(host.textContent).toBe('error')
    await act(async () => { await c.loadPhoneStatus({ force: true }) })
    expect(host.textContent).toBe('LeadMagic:12')
    expect(phoneStatusApi).toHaveBeenCalledTimes(2)
  })

  it('refetches once the cached month has rolled over', async () => {
    const { c } = await load()
    await mount(c)
    expect(c.getPhoneStatus()?.usage.used).toBe(12)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2099-11-02T00:00:00Z'))
      expect(c.getPhoneStatus()).toBeUndefined()
      phoneStatusApi.mockResolvedValueOnce({ ...STATUS, usage: { used: 0, limit: 100, resetsOn: '2099-12-01' } })
      await act(async () => { await c.loadPhoneStatus() })
      expect(phoneStatusApi).toHaveBeenCalledTimes(2)
      expect(c.getPhoneStatus()?.usage.used).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('forgets everything when a different user signs in', async () => {
    const { c, store } = await load()
    await mount(c)
    store.S.session.userId = 'someone-else'
    phoneStatusApi.mockResolvedValue({ ...STATUS, label: 'Wiza' })
    expect(c.getPhoneStatus()).toBeUndefined()
    await act(async () => { await c.loadPhoneStatus() })
    expect(c.getPhoneStatus()?.label).toBe('Wiza')
  })

  it('clearPhoneStatus drops it', async () => {
    const { c } = await load()
    await mount(c)
    c.clearPhoneStatus()
    expect(c.getPhoneStatus()).toBeUndefined()
  })
})

describe('revealPhone', () => {
  const live = (o: Partial<RevealPhoneResponse> = {}): RevealPhoneResponse => ({
    mode: 'live', provider: 'leadmagic', status: 'found', numbers: [{ e164: '+61412345678', type: 'mobile', confidence: 0.9 }], creditsUsed: 1, usage: usage(13), ...o,
  })

  it('returns numbers, sends only ids, and updates the cached allowance', async () => {
    const { c } = await load()
    await act(async () => { await c.loadPhoneStatus() })
    revealPhoneApi.mockResolvedValueOnce(live())
    const o = await c.revealPhone('ct1', 'ros')
    expect(revealPhoneApi.mock.calls[0][0]).toEqual({ contactId: 'ct1', businessId: 'ros' })
    expect(o).toMatchObject({ status: 'found', numbers: [{ e164: '+61412345678' }] })
    expect(c.getPhoneStatus()?.usage.used).toBe(13)
  })

  it('never keeps a result: nothing in the store or in browser storage mentions the number', async () => {
    const { c, store } = await load()
    revealPhoneApi.mockResolvedValueOnce(live())
    await c.revealPhone('ct1', 'ros')
    const all = JSON.stringify(store.S) + JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })
    expect(all).not.toContain('412345678')
    expect(all).not.toContain('0412 345 678')
  })

  it('treats found-with-no-numbers and not_found alike', async () => {
    const { c } = await load()
    revealPhoneApi.mockResolvedValueOnce(live({ status: 'found', numbers: [] }))
    expect((await c.revealPhone('ct1', 'ros')).status).toBe('not_found')
    revealPhoneApi.mockResolvedValueOnce(live({ status: 'not_found', numbers: [], creditsUsed: 0 }))
    expect((await c.revealPhone('ct1', 'ros')).status).toBe('not_found')
  })

  it('drops malformed numbers instead of showing them', async () => {
    const { c } = await load()
    revealPhoneApi.mockResolvedValueOnce(live({ numbers: [{ e164: '', type: 'mobile' }, { e164: '+61412345678', type: 'weird' as never }, { e164: '+61400000000', type: 'other' }] }))
    const o = await c.revealPhone('ct1', 'ros')
    expect(o.status === 'found' && o.numbers.map(n => n.e164)).toEqual(['+61400000000'])
  })

  it('maps a stub answer to not configured', async () => {
    const { c } = await load()
    revealPhoneApi.mockResolvedValueOnce(live({ mode: 'stub' }))
    expect(await c.revealPhone('ct1', 'ros')).toEqual({ status: 'notConfigured' })
  })

  it.each([
    [409, 'NOT_CONFIGURED', 'notConfigured'],
    [400, 'PHONE_NO_INPUT', 'noInput'],
    [502, 'PROVIDER_ERROR', 'providerError'],
    [500, 'INTERNAL', 'error'],
  ] as const)('maps %i %s to %s', async (status, code, want) => {
    const { c, http } = await load()
    revealPhoneApi.mockRejectedValueOnce(new http.SalesHttpError(status, { error: 'x', code }))
    expect((await c.revealPhone('ct1', 'ros')).status).toBe(want)
  })

  it('maps the cap to the usage the server sent, and records it', async () => {
    const { c, http } = await load()
    await act(async () => { await c.loadPhoneStatus() })
    revealPhoneApi.mockRejectedValueOnce(new http.SalesHttpError(429, { error: 'x', code: 'PHONE_CAP_REACHED', details: { used: 100, limit: 100, resetsOn: '2099-11-01' } }))
    const o = await c.revealPhone('ct1', 'ros')
    expect(o).toEqual({ status: 'cap', usage: { used: 100, limit: 100, resetsOn: '2099-11-01' } })
    expect(c.getPhoneStatus()?.usage.used).toBe(100)
  })

  it('maps a dropped connection and an abort', async () => {
    const { c, http } = await load()
    revealPhoneApi.mockRejectedValueOnce(new http.SalesNetworkError())
    expect(await c.revealPhone('ct1', 'ros')).toMatchObject({ status: 'error', message: expect.stringContaining("Can't reach") })
    revealPhoneApi.mockRejectedValueOnce(new DOMException('x', 'AbortError'))
    expect(await c.revealPhone('ct1', 'ros')).toEqual({ status: 'cancelled' })
  })
})
