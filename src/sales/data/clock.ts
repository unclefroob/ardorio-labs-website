import { useSyncExternalStore } from 'react'

let skewMs = 0
let offsetMinutes = 0
let tick = 0
const subs = new Set<() => void>()

function emit() {
  tick++
  subs.forEach(f => f())
}

/** The one clock. Real time, corrected to server time, plus the admin demo offset. */
export function now(): number {
  return Date.now() + skewMs + offsetMinutes * 60000
}

export function setServerNow(serverNowIso: string): void {
  const t = Date.parse(serverNowIso)
  if (Number.isNaN(t)) return
  skewMs = t - Date.now()
}

export function setOffsetMinutes(m: number): void {
  const v = Number.isFinite(m) ? Math.trunc(m) : 0
  if (v === offsetMinutes) return
  offsetMinutes = v
  emit()
}

export function getOffsetMinutes(): number {
  return offsetMinutes
}

export function bumpClock(): void {
  emit()
}

export function subscribeClock(f: () => void): () => void {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

/** Re-render subscribers once a minute (overdue / due-today) and whenever the offset changes. */
export function useNow(): number {
  useSyncExternalStore(subscribeClock, () => tick)
  return now()
}

export function formatOffset(minutes: number): string {
  if (!minutes) return ''
  const sign = minutes < 0 ? '-' : '+'
  let m = Math.abs(minutes)
  const d = Math.floor(m / 1440)
  m -= d * 1440
  const h = Math.floor(m / 60)
  m -= h * 60
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m && !d) parts.push(`${m}m`)
  return sign + (parts.join(' ') || '0m')
}
