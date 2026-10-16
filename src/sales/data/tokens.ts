// Personalisation variables: {{first_name}}, or {{first_name|there}} with a fallback for when the contact has no value.
// Stored and sent as that text everywhere; the editors only show them as chips. The list is the API's (engine/tokens.ts
// TOKEN_DEFS), copied here so the picker and chips work without a round trip; tokens.test.ts fails if the two drift apart.

export const TOKEN_DEFS = [
  { key: 'first_name', label: 'First name', side: 'contact', sample: 'Sam' },
  { key: 'last_name', label: 'Last name', side: 'contact', sample: 'Lee' },
  { key: 'company_name', label: 'Company name', side: 'contact', sample: 'Acme' },
  { key: 'job_title', label: 'Job title', side: 'contact', sample: 'Operations Manager' },
  { key: 'sender_first_name', label: 'Your first name', side: 'sender', sample: 'Ryan' },
  { key: 'sender_name', label: 'Your name', side: 'sender', sample: 'Ryan Kwan' },
  { key: 'business_name', label: 'Business name', side: 'sender', sample: 'Ardorio' },
  { key: 'meeting_link', label: 'Meeting link', side: 'sender', sample: 'https://cal.example/ryan' },
] as const

export type TokenDef = (typeof TOKEN_DEFS)[number]
export const TOKEN_KEYS: readonly string[] = TOKEN_DEFS.map(t => t.key)
export const tokenDef = (key: string): TokenDef | undefined => TOKEN_DEFS.find(t => t.key === key)

/** A variable as written: its key, its fallback (undefined when it has none; '' leaves it out), and the exact source text. */
export interface TokenRef { key: string; fallback?: string; source: string }

/** A fresh matcher each time (the g flag carries state). The same pattern as the API's. */
export const tokenRe = (): RegExp => /\{\{\s*(\w+)\s*(?:\|([^{}|]*))?\}\}/g

export function parseTokens(s: string | null | undefined): TokenRef[] {
  return [...String(s ?? '').matchAll(tokenRe())].map(m => ({ key: m[1], ...(m[2] !== undefined ? { fallback: m[2].trim() } : {}), source: m[0] }))
}

/** How a variable is written back: {{key}} or {{key|fallback}}. */
export const tokenSource = (key: string, fallback?: string): string => (fallback === undefined ? `{{${key}}}` : `{{${key}|${fallback}}}`)

/** Variables written that are not in the list: a typo to fix, not missing data. */
export const unknownTokens = (s: string | null | undefined): string[] => [...new Set(parseTokens(s).map(t => t.key).filter(k => !TOKEN_KEYS.includes(k)))]

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

/** The variable a typo most likely meant ({{firstname}} → First name), when one is close enough to suggest. */
export function suggestToken(key: string): TokenDef | undefined {
  const k = key.toLowerCase().replace(/[^a-z]/g, '')
  let best: { t: TokenDef; d: number } | undefined
  for (const t of TOKEN_DEFS) {
    const d = distance(k, t.key.replace(/_/g, ''))
    if (!best || d < best.d) best = { t, d }
  }
  return best && best.d <= Math.max(2, Math.floor(k.length / 4)) ? best.t : undefined
}

export type TokenMap = Record<string, string | null | undefined>

/**
 * Fill the variables. One with no value takes its fallback if it has one; otherwise it stays as written and is reported as missing.
 * One not in the list stays as written and is reported as unknown (and missing, so nothing goes out with it). Same rules as the API.
 */
export function renderTokens(txt: string | null | undefined, map: TokenMap): { text: string; missing: string[]; unknown: string[] } {
  const missing: string[] = []
  const unknown: string[] = []
  const text = String(txt ?? '').replace(tokenRe(), (whole, key: string, fallback: string | undefined) => {
    if (!TOKEN_KEYS.includes(key)) {
      unknown.push(key)
      missing.push(key)
      return whole
    }
    const v = map[key]
    if (v == null || v === '') {
      if (fallback !== undefined) return fallback.trim()
      missing.push(key)
      return whole
    }
    return v
  })
  return { text, missing: [...new Set(missing)], unknown: [...new Set(unknown)] }
}

/** "First name, Job title" for a list of keys (unknown ones as written). */
export const tokenNames = (keys: readonly string[]): string => keys.map(k => tokenDef(k)?.label ?? `{{${k}}}`).join(', ')

const escRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Turn a draft written for one contact back into a template: their name, company and the sender's name become variables. Whole words
 * only (so "Sam" does not eat "Samsung"), longest value first (so the sender "Sam Lee" is not half-replaced by the contact "Sam"),
 * never inside a variable already there, and values under two characters are left alone.
 */
export function tokenise(s: string, pairs: ReadonlyArray<[value: string | undefined, key: string]>): string {
  const live = pairs.filter((p): p is [string, string] => !!p[0] && p[0].trim().length >= 2).sort((a, b) => b[0].length - a[0].length)
  if (!live.length) return s
  const re = new RegExp(`(\\{\\{[^{}]*\\}\\})|(?<![\\p{L}\\p{N}])(${live.map(p => escRe(p[0].trim())).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
  return s.replace(re, (m, tok: string | undefined, val: string | undefined) => {
    if (tok) return tok
    const hit = live.find(p => p[0].trim() === val)
    return hit ? `{{${hit[1]}}}` : m
  })
}
