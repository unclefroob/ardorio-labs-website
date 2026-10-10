import { API_BASE } from '../../lib/apiClient'
import { loginPath } from '../../lib/nextPath'
import type { SalesErrorBody } from './contract'

// Same key as src/context/AuthContext.tsx and src/lib/apiClient.ts (neither exports it).
const TOKEN_KEY = 'ardorio_admin_token'

export class SalesHttpError extends Error {
  readonly status: number
  readonly body: SalesErrorBody | null
  constructor(status: number, body: SalesErrorBody | null, message?: string) {
    super(message ?? body?.error ?? `Request failed (${status})`)
    this.name = 'SalesHttpError'
    this.status = status
    this.body = body
  }
  get code() {
    return this.body?.code
  }
}

/** Fetch failed before any response arrived (offline, DNS, CORS, aborted). */
export class SalesNetworkError extends Error {
  constructor(message = 'Network error') {
    super(message)
    this.name = 'SalesNetworkError'
  }
}

function isBody(x: unknown): x is SalesErrorBody {
  return typeof x === 'object' && x !== null && typeof (x as { error?: unknown }).error === 'string'
}

let onExpired: (() => void) | null = null

/** While a handler is registered, a 401 is reported to it instead of navigating away, so the page can say what was lost. */
export function setSessionExpiredHandler(fn: (() => void) | null): void {
  onExpired = fn
}

interface Opts {
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
  signal?: AbortSignal
  keepalive?: boolean
}

export async function salesFetch<T>(path: string, opts: Opts = {}): Promise<T> {
  if (!API_BASE) throw new SalesNetworkError('API URL is not configured (VITE_API_URL missing at build time).')
  const token = localStorage.getItem(TOKEN_KEY)
  let res: Response
  try {
    res = await fetch(`${API_BASE}/sales${path}`, {
      method: opts.method ?? 'GET',
      signal: opts.signal,
      keepalive: opts.keepalive,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new SalesNetworkError(e instanceof Error ? e.message : undefined)
  }

  const refreshed = res.headers.get('x-refreshed-token')
  if (refreshed) localStorage.setItem(TOKEN_KEY, refreshed)

  if (res.status === 401 && (token || onExpired)) {
    localStorage.removeItem(TOKEN_KEY)
    if (onExpired) onExpired()
    else window.location.assign(loginPath({ reason: 'expired', next: window.location.pathname + window.location.search }))
    throw new SalesHttpError(401, null, 'Session expired')
  }

  if (!res.ok) {
    let parsed: unknown = null
    try {
      parsed = await res.json()
    } catch {
      parsed = null
    }
    throw new SalesHttpError(res.status, isBody(parsed) ? parsed : null)
  }
  return (await res.json()) as T
}
