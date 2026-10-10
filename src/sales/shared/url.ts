export type UrlCheck = { ok: true; value: string } | { ok: false; error: string }

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i

/** Mirrors the server rule: http(s) with a host, no credentials, no whitespace/control/backslash, at most 2048 chars. */
export function isHttpUrl(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  if (s.length > 2048 || /[\s\u0000-\u001f\u007f\\]/.test(s)) return false
  try {
    const u = new URL(s)
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname && !u.username && !u.password
  } catch {
    return false
  }
}

/**
 * Trim, add `https://` when no scheme was typed, and check the result against the server's rule.
 * An empty value is allowed and stays empty.
 */
export function normaliseUrl(input: string | null | undefined, what = 'web address'): UrlCheck {
  const t = (input ?? '').trim()
  if (!t) return { ok: true, value: '' }
  const value = HAS_SCHEME.test(t) ? t : `https://${t.replace(/^\/\//, '')}`
  if (isHttpUrl(value)) return { ok: true, value }
  return { ok: false, error: `Enter a valid ${what}, for example https://company.com.au` }
}

/** For code paths with no field to show an error on: the normalised link, or '' when it cannot be sent. */
export function urlOrEmpty(input: string | null | undefined): string {
  const r = normaliseUrl(input)
  return r.ok ? r.value : ''
}

/** Normalise the link fields of a patch; a link that cannot be sent is left out so the stored one stays. */
export function cleanLinkPatch<T extends { website?: string; linkedin?: string }>(p: T): T {
  const out = { ...p }
  for (const k of ['website', 'linkedin'] as const) {
    const v = out[k]
    if (v === undefined) continue
    const r = normaliseUrl(v)
    if (r.ok) out[k] = r.value
    else delete out[k]
  }
  return out
}
