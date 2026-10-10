import type { CompanySignal, TechItem } from '../api/contract'
import type { Intel } from './types'

export interface SignalAdjustPart { label: string; points: number }
export interface SignalAdjust { delta: number; parts: SignalAdjustPart[] }

/** A saved signal older than this no longer moves the score. */
export const SIGNAL_MAX_AGE_DAYS = 180
export const SIGNAL_DELTA_LIMIT = 30
/** Web facts can lift a score, but never to a perfect one. */
export const SIGNAL_SCORE_CEILING = 96

const DAY = 86_400_000
export const NO_ADJUST: SignalAdjust = { delta: 0, parts: [] }

const isSignal = (x: unknown): x is CompanySignal => typeof x === 'object' && x !== null && typeof (x as CompanySignal).kind === 'string' && typeof (x as CompanySignal).headline === 'string'
const isTech = (x: unknown): x is TechItem => typeof x === 'object' && x !== null && typeof (x as TechItem).name === 'string' && typeof (x as TechItem).category === 'string'

/** The signal's own date, else the day the lookup ran. NaN when neither parses. */
function signalTime(s: CompanySignal, rec: Intel): number {
  const own = s.date ? Date.parse(s.date) : NaN
  return Number.isNaN(own) ? Date.parse(rec.ts) : own
}

/**
 * Deterministic score movement from saved web intelligence. Each kind of fact counts once, however many
 * times it appears: HR/ops hiring +8, expansion +8, funding +8, a competitor's tool in use +10, a reported
 * closure -30. Signals older than 180 days are ignored. The total is clamped to [-30, +30].
 */
export function computeSignalAdjust(recs: readonly Intel[], now: number = Date.now()): SignalAdjust {
  const found = new Map<string, SignalAdjustPart>()
  const add = (key: string, label: string, points: number): void => {
    if (!found.has(key)) found.set(key, { label, points })
  }
  const cutoff = now - SIGNAL_MAX_AGE_DAYS * DAY
  for (const rec of recs) {
    const items: unknown[] = Array.isArray(rec.items) ? rec.items : []
    if (rec.kind === 'signals') {
      for (const s of items) {
        if (!isSignal(s)) continue
        const t = signalTime(s, rec)
        if (Number.isNaN(t) || t < cutoff) continue
        if (s.kind === 'hiring' && s.hrOps === true) add('hiring', 'HR/ops hiring', 8)
        else if (s.kind === 'expansion') add('expansion', 'expansion', 8)
        else if (s.kind === 'funding') add('funding', 'funding', 8)
        else if (s.kind === 'closure') add('closure', 'closure reported', -30)
      }
    } else if (rec.kind === 'tech') {
      for (const t of items) if (isTech(t) && t.competitor === true) add('competitor', `uses ${t.name}`, 10)
    }
  }
  const parts = [...found.values()]
  const sum = parts.reduce((n, p) => n + p.points, 0)
  return { delta: Math.max(-SIGNAL_DELTA_LIMIT, Math.min(SIGNAL_DELTA_LIMIT, sum)), parts }
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
