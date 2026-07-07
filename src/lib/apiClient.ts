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

  // Sliding session: the API re-issues a token when the current one is near
  // expiry. Persist it so active admins never hit the 7-day cliff.
  const refreshed = res.headers.get('x-refreshed-token')
  if (refreshed) localStorage.setItem(TOKEN_KEY, refreshed)

  if (res.status === 401 && token) {
    // The admin session expired or was revoked. Clear it and send the user
    // back to login instead of stranding them on a page of failed fetches.
    localStorage.removeItem(TOKEN_KEY)
    window.location.assign('/admin/login?reason=expired')
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `API error ${res.status}`)
  }
  return res.json()
}

// Multipart upload — does NOT set Content-Type so the browser adds the
// multipart boundary itself. Sends the admin bearer token like apiFetch.
export async function apiUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
  if (!API) {
    throw new Error('API URL is not configured (VITE_API_URL missing at build time).')
  }
  const token = localStorage.getItem(TOKEN_KEY)
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  const refreshed = res.headers.get('x-refreshed-token')
  if (refreshed) localStorage.setItem(TOKEN_KEY, refreshed)

  if (res.status === 401 && token) {
    localStorage.removeItem(TOKEN_KEY)
    window.location.assign('/admin/login?reason=expired')
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Upload error ${res.status}`)
  }
  return res.json()
}
