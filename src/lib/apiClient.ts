const API = import.meta.env.VITE_API_URL
const TOKEN_KEY = 'ardorio_admin_token'

if (!API) {
  // Surfaces a clear console error at app boot if the env var was missing
  // from the build. Without this, fetches resolve as relative URLs and the
  // SPA catch-all returns index.html, masking the real problem.
  console.error('[apiClient] VITE_API_URL is not set in this build — every API call will fail.')
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API) {
    throw new Error('API URL is not configured (VITE_API_URL missing at build time).')
  }
  const token = localStorage.getItem(TOKEN_KEY)
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `API error ${res.status}`)
  }
  return res.json()
}
