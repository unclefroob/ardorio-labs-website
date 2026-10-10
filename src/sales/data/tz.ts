import { S } from './store'

/**
 * Org-timezone wall time. Every zoneless `YYYY-MM-DDTHH:mm[:ss]` string the app writes or reads is wall
 * time in `settings/org.tz`, never the browser's zone, so the browser and the server engine agree.
 */

export const DEFAULT_TZ = 'Australia/Melbourne'

const formatters = new Map<string, Intl.DateTimeFormat>()

function fmt(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    formatters.set(tz, f)
  }
  return f
}

/** A supported IANA zone, or the default when the value is missing or unsupported. */
export function resolveTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ
  try {
    fmt(tz)
    return tz
  } catch {
    return DEFAULT_TZ
  }
}

/** The zone the organisation works in. */
export function orgTz(): string {
  return resolveTz(S.org?.tz)
}

interface Parts { y: number; mo: number; d: number; h: number; mi: number; s: number }

function partsAt(ms: number, tz: string): Parts {
  const out: Record<string, number> = {}
  for (const p of fmt(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = +p.value
  return { y: out.year, mo: out.month, d: out.day, h: out.hour % 24, mi: out.minute, s: out.second }
}

const p2 = (n: number): string => String(n).padStart(2, '0')

/** The wall clock in `tz` at instant `ms`, as `YYYY-MM-DDTHH:mm:ss`. */
export function wallFromMs(ms: number, tz: string = orgTz()): string {
  const p = partsAt(ms, tz)
  return `${String(p.y).padStart(4, '0')}-${p2(p.mo)}-${p2(p.d)}T${p2(p.h)}:${p2(p.mi)}:${p2(p.s)}`
}

function offsetMs(ms: number, tz: string): number {
  const p = partsAt(ms, tz)
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000
}

const WALL = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/

/**
 * The instant at which the wall clock in `tz` shows `wall`. A wall time skipped by a DST gap resolves
 * forward (02:30 becomes 03:30); one that happens twice resolves to the earlier instant.
 */
export function msFromWall(wall: string, tz: string = orgTz()): number {
  const m = WALL.exec(wall)
  if (!m) return NaN
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))
  const before = offsetMs(guess - 864e5, tz)
  const after = offsetMs(guess + 864e5, tz)
  const want = wallFromMs(guess, 'UTC')
  const valid = [...new Set([before, after])].map(o => guess - o).filter(c => wallFromMs(c, tz) === want)
  return valid.length ? Math.min(...valid) : guess - before
}

/** "Mon 12 Oct, 09:41 AEDT" for an instant, in `tz`. */
export function formatInstant(ms: number, tz: string = orgTz()): string {
  const f = new Intl.DateTimeFormat('en-AU', {
    timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
  })
  const parts = Object.fromEntries(f.formatToParts(new Date(ms)).map(p => [p.type, p.value]))
  return `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute} ${parts.timeZoneName}`
}
