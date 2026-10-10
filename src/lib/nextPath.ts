// A post-login destination is only honoured when it is a same-origin path, so a crafted
// /admin/login?next=https://evil.example link cannot bounce a signed-in admin off-site.
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || raw[0] !== '/' || raw[1] === '/' || raw[1] === '\\') return null
  return raw
}

export function loginPath(opts: { reason?: 'expired'; next?: string } = {}): string {
  const q = new URLSearchParams()
  if (opts.reason) q.set('reason', opts.reason)
  const next = safeNext(opts.next)
  if (next && !next.startsWith('/admin/login')) q.set('next', next)
  const s = q.toString()
  return s ? `/admin/login?${s}` : '/admin/login'
}
