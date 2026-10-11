import { useSyncExternalStore } from 'react'

let skewMs = 0
let tick = 0
const subs = new Set<() => void>()

function emit() {
  tick++
  subs.forEach(f => f())
}

/** The one clock: real time, corrected to server time. */
export function now(): number {
  return Date.now() + skewMs
}

export function setServerNow(serverNowIso: string): void {
  const t = Date.parse(serverNowIso)
  if (Number.isNaN(t)) return
  skewMs = t - Date.now()
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

/** Re-render subscribers once a minute (overdue / due-today). */
export function useNow(): number {
  useSyncExternalStore(subscribeClock, () => tick)
  return now()
}
