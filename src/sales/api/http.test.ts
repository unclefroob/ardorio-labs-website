import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))

const TOKEN_KEY = 'ardorio_admin_token'

function reply(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

async function load() {
  vi.resetModules()
  return import('./http')
}

let assign: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  assign = vi.fn()
  vi.stubGlobal('location', { assign })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('salesFetch', () => {
  it('sends the bearer token and parses JSON', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok')
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { ok: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    const { salesFetch } = await load()
    await expect(salesFetch('/x', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ ok: 1 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test/sales/x')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(init.body).toBe('{"a":1}')
  })

  it('stores a refreshed token', async () => {
    localStorage.setItem(TOKEN_KEY, 'old')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, {}, { 'x-refreshed-token': 'new' })))
    const { salesFetch } = await load()
    await salesFetch('/x')
    expect(localStorage.getItem(TOKEN_KEY)).toBe('new')
  })

  it('surfaces a structured error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(409, { error: 'Lease lost', code: 'LEASE_LOST' })))
    const { salesFetch, SalesHttpError } = await load()
    const err = await salesFetch('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SalesHttpError)
    expect(err).toMatchObject({ status: 409, code: 'LEASE_LOST', message: 'Lease lost' })
  })

  it('surfaces the SUPPRESSED code on a refused send', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(409, { error: 'Contact is suppressed', code: 'SUPPRESSED' })))
    const { salesFetch, SalesHttpError } = await load()
    const err = await salesFetch('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SalesHttpError)
    expect(err).toMatchObject({ status: 409, code: 'SUPPRESSED', message: 'Contact is suppressed' })
  })

  it('turns a fetch failure into a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { salesFetch, SalesNetworkError } = await load()
    await expect(salesFetch('/x')).rejects.toBeInstanceOf(SalesNetworkError)
  })
})

describe('401 handling', () => {
  it('reports to the registered handler, clears the token and does not navigate', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(401, { error: 'nope' })))
    const { salesFetch, setSessionExpiredHandler, SalesHttpError } = await load()
    const handler = vi.fn()
    setSessionExpiredHandler(handler)
    const err = await salesFetch('/x').catch((e: unknown) => e)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(assign).not.toHaveBeenCalled()
    expect(err).toBeInstanceOf(SalesHttpError)
    expect(err).toMatchObject({ status: 401 })
  })

  it('reports to the handler even when the token was already cleared', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(401)))
    const { salesFetch, setSessionExpiredHandler } = await load()
    const handler = vi.fn()
    setSessionExpiredHandler(handler)
    await salesFetch('/x').catch(() => undefined)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('redirects to sign-in when no handler is registered', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(401)))
    const { salesFetch } = await load()
    await salesFetch('/x').catch(() => undefined)
    expect(assign).toHaveBeenCalledWith('/admin/login?reason=expired')
  })

  it('stops reporting once the handler is unregistered', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(401)))
    const { salesFetch, setSessionExpiredHandler } = await load()
    const handler = vi.fn()
    setSessionExpiredHandler(handler)
    setSessionExpiredHandler(null)
    await salesFetch('/x').catch(() => undefined)
    expect(handler).not.toHaveBeenCalled()
  })
})
