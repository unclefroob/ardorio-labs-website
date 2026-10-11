import type { CompanySignal, TechItem } from '../api/contract'
import type { Intel } from './types'

export interface SignalAdjustPart { label: string; points: number; sourceUrl?: string; date?: string }
/** A reported closure nobody has confirmed yet: it moves nothing until someone confirms it. */
export interface PendingClosure { headline: string; sourceUrl: string; date: string }
export interface SignalAdjust { delta: number; parts: SignalAdjustPart[]; pending: PendingClosure[] }

/** A saved signal older than this no longer moves the score. */
export const SIGNAL_MAX_AGE_DAYS = 180
export const SIGNAL_DELTA_LIMIT = 30
/** Web facts can lift a score, but never to a perfect one. */
export const SIGNAL_SCORE_CEILING = 96

const DAY = 86_400_000
export const NO_ADJUST: SignalAdjust = { delta: 0, parts: [], pending: [] }

const isSignal = (x: unknown): x is CompanySignal => typeof x === 'object' && x !== null && typeof (x as CompanySignal).kind === 'string' && typeof (x as CompanySignal).headline === 'string'
const isTech = (x: unknown): x is TechItem => typeof x === 'object' && x !== null && typeof (x as TechItem).name === 'string' && typeof (x as TechItem).category === 'string'
const OPENER_KINDS = new Set(['expansion', 'funding', 'hiring', 'leadership', 'award', 'news'])

const isHttp = (u: unknown): u is string => {
  if (typeof u !== 'string') return false
  try {
    const p = new URL(u).protocol
    return p === 'https:' || p === 'http:'
  } catch {
    return false
  }
}

/** The signal's own YYYY-MM-DD date as a time. NaN when it has none: a lookup date never stands in for it. */
export function signalTime(s: Pick<CompanySignal, 'date'>): number {
  if (typeof s.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return NaN
  const t = Date.parse(`${s.date}T00:00:00Z`)
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s.date ? NaN : t
}

/** A signal may move the score only with a source address and a date inside the window. */
export function scoringSignal(s: CompanySignal, now: number = Date.now()): boolean {
  const t = signalTime(s)
  return isHttp(s.sourceUrl) && !Number.isNaN(t) && t >= now - SIGNAL_MAX_AGE_DAYS * DAY
}

/** Mirrors the server: an opening line may use a non-closure signal with a source address and a date inside the window. */
export function openerUsable(s: CompanySignal, now: number = Date.now()): boolean {
  return OPENER_KINDS.has(s.kind) && s.headline.trim() !== '' && scoringSignal(s, now)
}

/** Address without scheme, www, fragment or trailing slash, lower-cased: two spellings of one page compare equal. */
export function urlKey(u: string): string {
  try {
    const p = new URL(u)
    return (p.hostname.replace(/^www\./i, '') + p.pathname.replace(/\/+$/, '') + p.search).toLowerCase()
  } catch {
    return u.trim().toLowerCase()
  }
}

/** The same reported story: same page, or the same headline ignoring case. */
export function sameClosure(a: Pick<CompanySignal, 'headline' | 'sourceUrl'>, b: Pick<CompanySignal, 'headline' | 'sourceUrl'>): boolean {
  return urlKey(a.sourceUrl) === urlKey(b.sourceUrl) || a.headline.trim().toLowerCase() === b.headline.trim().toLowerCase()
}

/**
 * Deterministic score movement from saved web intelligence. Each kind of fact counts once, however many
 * times it appears: HR/ops hiring +8, expansion +8, funding +8, a competitor's tool in use +10, a closure
 * a person has confirmed -30. A reported closure nobody has confirmed moves nothing (it is listed in
 * `pending`). A signal counts only with a source address and its own date inside 180 days; undated ones
 * are display-only. The total is clamped to [-30, +30].
 */
export function computeSignalAdjust(recs: readonly Intel[], now: number = Date.now()): SignalAdjust {
  const found = new Map<string, SignalAdjustPart>()
  const pending: PendingClosure[] = []
  const add = (key: string, part: SignalAdjustPart): void => {
    if (!found.has(key)) found.set(key, part)
  }
  for (const rec of recs) {
    const items: unknown[] = Array.isArray(rec.items) ? rec.items : []
    if (rec.kind === 'signals') {
      for (const s of items) {
        if (!isSignal(s) || !scoringSignal(s, now)) continue
        const at = { sourceUrl: s.sourceUrl, date: s.date }
        if (s.kind === 'hiring' && s.hrOps === true) add('hiring', { label: 'HR/ops hiring', points: 8, ...at })
        else if (s.kind === 'expansion') add('expansion', { label: 'expansion', points: 8, ...at })
        else if (s.kind === 'funding') add('funding', { label: 'funding', points: 8, ...at })
        else if (s.kind === 'closure') {
          if (s.review === 'confirmed') add('closure', { label: 'closure confirmed', points: -30, ...at })
          else if (s.review !== 'dismissed') pending.push({ headline: s.headline, sourceUrl: s.sourceUrl, date: s.date as string })
        }
      }
    } else if (rec.kind === 'tech') {
      for (const t of items) if (isTech(t) && t.competitor === true) add('competitor', { label: `uses ${t.name}`, points: 10, ...(isHttp(t.sourceUrl) ? { sourceUrl: t.sourceUrl } : {}) })
    }
  }
  const parts = [...found.values()]
  const sum = parts.reduce((n, p) => n + p.points, 0)
  return { delta: Math.max(-SIGNAL_DELTA_LIMIT, Math.min(SIGNAL_DELTA_LIMIT, sum)), parts, pending }
}

/** Apply a movement to a base score: floor 0, and a rise stops at 96 (a base already above that is not pulled down by it). */
export function applySignalAdjust(base: number, delta: number): number {
  if (delta === 0) return base
  if (delta > 0) return Math.min(base + delta, Math.max(base, SIGNAL_SCORE_CEILING))
  return Math.max(0, base + delta)
}

/** "Signals +16: HR/ops hiring, expansion". Empty when nothing moved the score. */
export function adjustSummary(a: SignalAdjust): string {
  if (!a.parts.length) return ''
  const sign = a.delta > 0 ? '+' : a.delta < 0 ? '−' : '±'
  return `Signals ${sign}${Math.abs(a.delta)}: ${a.parts.map(p => p.label).join(', ')}`
}

/** Whole days since an ISO time; unparseable is Infinity so it always reads as stale. */
export function ageDays(iso: string | undefined, now: number = Date.now()): number {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? Infinity : Math.max(0, Math.floor((now - t) / DAY))
}

/** Names to add to a company's known technology: case-insensitive, no repeats, blanks dropped. */
export function mergeTech(existing: readonly string[], add: readonly string[]): string[] {
  const out = existing.filter(x => typeof x === 'string')
  const seen = new Set(out.map(x => x.trim().toLowerCase()))
  for (const raw of add) {
    const name = raw.trim()
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push(name)
  }
  return out
}
