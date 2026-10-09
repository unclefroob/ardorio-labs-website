import { useSyncExternalStore } from 'react'
import { BUSINESS_IDS, type BusinessId, type LeaseInfo } from '../api/contract'
import { acquireLease, releaseLease } from '../api/engine'
import { getOffsetMinutes, setServerNow, subscribeClock } from '../data/clock'
import { getMyProfile } from '../data/session'
import { isSessionExpired, runEngineLocked } from '../data/sync'
import { logSales } from '../log'
import { tick } from './engine'

/**
 * Engine lease client. Only the tab holding a business's lease runs the engine for it; the server
 * rejects engine writes from anyone else (409 LEASE_LOST), so a stale tab cannot corrupt state.
 */

const TICK_MS = 30000
const COALESCE_MS = 400
const DEFAULT_TTL_MS = 45000
const DEFAULT_RENEW_MS = 15000

function newSessionId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }
}

const sessionId = newSessionId()

export interface LeaseStatus {
  /** The last lease request succeeded. False means "Automations paused". */
  ok: boolean
  leases: LeaseInfo[]
  /** Businesses this tab may run the engine for right now. */
  held: BusinessId[]
}

let status: LeaseStatus = { ok: true, leases: [], held: [] }
let version = 0
const subs = new Set<() => void>()
const heldUntil = new Map<BusinessId, number>()
let ttlMs = DEFAULT_TTL_MS
let renewMs = DEFAULT_RENEW_MS

function emit(next: LeaseStatus): void {
  status = next
  version++
  subs.forEach(f => f())
}
const subscribeLeases = (f: () => void): (() => void) => {
  subs.add(f)
  return () => subs.delete(f)
}

export function getLeaseStatus(): LeaseStatus {
  return status
}
export function useLeaseStatus(): LeaseStatus {
  useSyncExternalStore(subscribeLeases, () => version)
  return status
}

/** Businesses held now, judged by local time so a dead network cannot extend a lease we last saw. */
function heldNow(): BusinessId[] {
  const t = Date.now()
  return BUSINESS_IDS.filter(b => (heldUntil.get(b) ?? 0) > t)
}

function editable(): BusinessId[] {
  const me = getMyProfile()
  if (!me) return []
  return BUSINESS_IDS.filter(b => me.permissions[b].edit)
}

let renewing: { run: Promise<void>; epoch: number } | null = null
// Bumped on release so a renew still in flight cannot resurrect a lease the tab has given up.
let releaseEpoch = 0

async function renew(): Promise<void> {
  if (renewing && renewing.epoch === releaseEpoch) return renewing.run
  if (isSessionExpired()) {
    heldUntil.clear()
    emit({ ok: false, leases: [], held: [] })
    return
  }
  const wanted = editable()
  if (!wanted.length) {
    emit({ ok: true, leases: [], held: [] })
    return
  }
  const epoch = releaseEpoch
  const mine: { run: Promise<void>; epoch: number } = { epoch, run: Promise.resolve() }
  renewing = mine
  mine.run = (async () => {
    try {
      const res = await acquireLease({ sessionId, businessIds: wanted })
      if (epoch !== releaseEpoch) return
      setServerNow(res.serverNow)
      ttlMs = res.ttlMs || DEFAULT_TTL_MS
      renewMs = res.renewEveryMs || DEFAULT_RENEW_MS
      const t = Date.now()
      for (const l of res.leases) {
        if (l.held) heldUntil.set(l.businessId, t + ttlMs)
        else heldUntil.delete(l.businessId)
      }
      emit({ ok: true, leases: res.leases, held: heldNow() })
    } catch (e) {
      logSales('lease', e)
      if (epoch === releaseEpoch) emit({ ...status, ok: false, held: heldNow() })
    } finally {
      if (renewing === mine) renewing = null
    }
  })()
  return mine.run
}

let ticking = false
let tickAgain = false

async function runTick(): Promise<void> {
  if (ticking) {
    tickAgain = true
    return
  }
  const held = heldNow()
  if (!held.length) return
  ticking = true
  try {
    const out = await runEngineLocked(() => tick(held), { sessionId, businessIds: held })
    if (out.state === 'sent' && out.leaseLost) await renew()
  } catch (e) {
    logSales('engine', e)
  } finally {
    ticking = false
    if (tickAgain) {
      tickAgain = false
      requestEngineTick()
    }
  }
}

let coalesce: ReturnType<typeof setTimeout> | null = null
let started = false

/** Ask for an engine pass soon. Many calls in a burst become one pass. A no-op until the engine has started. */
export function requestEngineTick(): void {
  if (!started || coalesce) return
  coalesce = setTimeout(() => {
    coalesce = null
    void runTick()
  }, COALESCE_MS)
}

/** Start leasing and ticking. Returns a cleanup that stops timers and releases the leases. */
export function startEngine(): () => void {
  if (started) return () => undefined
  started = true
  let renewTimer: ReturnType<typeof setTimeout> | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let stopped = false

  const loop = (): void => {
    if (stopped) return
    renewTimer = setTimeout(() => {
      void renew().finally(loop)
    }, renewMs)
  }
  void renew().then(() => {
    if (stopped) return
    loop()
    requestEngineTick()
  })
  tickTimer = setInterval(() => void runTick(), TICK_MS)

  const onVisible = (): void => {
    if (document.visibilityState === 'visible') void renew().then(requestEngineTick)
  }
  const release = (): void => {
    releaseEpoch++
    heldUntil.clear()
    releaseLease({ sessionId }, true).catch(() => undefined)
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pagehide', release)
  let lastOffset = getOffsetMinutes()
  const unClock = subscribeClock(() => {
    const o = getOffsetMinutes()
    if (o !== lastOffset) {
      lastOffset = o
      requestEngineTick()
    }
  })

  return () => {
    stopped = true
    started = false
    if (renewTimer) clearTimeout(renewTimer)
    if (tickTimer) clearInterval(tickTimer)
    if (coalesce) {
      clearTimeout(coalesce)
      coalesce = null
    }
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pagehide', release)
    unClock()
    release()
    emit({ ok: true, leases: [], held: [] })
  }
}
