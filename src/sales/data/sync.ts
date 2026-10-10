import { useSyncExternalStore } from 'react'
import type { ChangeEntry } from '../api/contract'
import { SalesHttpError, setSessionExpiredHandler } from '../api/http'
import { getChanges, postBatch } from '../api/records'
import { getOffsetMinutes, setOffsetMinutes, setServerNow } from './clock'
import { logSales } from '../log'
import { UI } from '../ui/store'
import { userName } from './conflicts'
import { rebase, stable, wire } from './diff'
import { collectPlan, localData, removeLocal, takeChunk, toAtoms, writeLocal, type Planned } from './plan'
import { applyResult, rollbackPlan } from './results'
import { getMembersVersion, refreshMembers } from './session'
import {
  isArrayCollection, isSettingsId, metaMap, normalise, publish, SYNCED_COLLECTIONS, upsertRow,
  type SyncedCollection,
} from './store'

// ── status model ────────────────────────────────────────────────────────────────────────────
export interface SyncStatus {
  state: 'idle' | 'saving' | 'offline' | 'error' | 'expired'
  /** Consecutive failed attempts to save; the banner shows from 2. */
  failures: number
  pollFailures: number
  queued: number
  /** Edits thrown away when the session expired; only meaningful when state is 'expired'. */
  discarded: number
  message?: string
}

let status: SyncStatus = { state: 'idle', failures: 0, pollFailures: 0, queued: 0, discarded: 0 }
let statusVersion = 0
const statusSubs = new Set<() => void>()

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch }
  statusVersion++
  statusSubs.forEach(f => f())
}
export function getSyncStatus(): SyncStatus {
  return status
}
export function useSyncStatus(): SyncStatus {
  useSyncExternalStore(f => {
    statusSubs.add(f)
    return () => {
      statusSubs.delete(f)
    }
  }, () => statusVersion)
  return status
}

// ── flush scheduling ────────────────────────────────────────────────────────────────────────
const DEBOUNCE_MS = 300
const CHUNK = 200

let timer: ReturnType<typeof setTimeout> | null = null
let running = false
let dirty = false
let backoffMs = 0
// Set when the sales page unmounts so the final flush cannot arm a retry loop nobody is watching.
let stopped = false
let cursor: string | null = null
let expired = false

export function setCursor(c: string): void {
  cursor = c
}

/** True while there are edits the server has not acknowledged. Drives the beforeunload warning. */
export function hasUnsaved(): boolean {
  return !expired && (dirty || running)
}

export function isSessionExpired(): boolean {
  return expired
}

/**
 * The login token was refused. Everything the server has not acknowledged is rolled back (the user
 * approved dropping it) and saving, polling and retrying all stop until they sign in again. Idempotent.
 */
export function expireSession(): void {
  if (expired) return
  expired = true
  if (timer) clearTimeout(timer)
  timer = null
  const plan = collectPlan()
  rollbackPlan(plan)
  publish()
  dirty = false
  backoffMs = 0
  setStatus({ state: 'expired', failures: 0, pollFailures: 0, queued: 0, discarded: plan.length, message: undefined })
  logSales('session-expired', { discarded: plan.length })
}

export function scheduleFlush(delay = DEBOUNCE_MS): void {
  if (expired) return
  dirty = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void flush()
  }, delay)
}

export interface SendOutcome {
  ok: boolean
  contention: boolean
  /** Ops that never got a result (transport failure). */
  unsent: Planned[]
}

export async function sendPlan(plan: Planned[]): Promise<SendOutcome> {
  const atoms = toAtoms(plan)
  let size = CHUNK
  let i = 0
  let contention = false
  const unsentFrom = (from: number) => atoms.slice(from).flat()
  while (i < atoms.length) {
    const chunk = takeChunk(atoms, i, size)
    try {
      const res = await postBatch({ ops: chunk.items.map(p => p.op) })
      setServerNow(res.serverNow)
      const done = new Set<number>()
      for (const r of res.results) {
        const p = chunk.items[r.index]
        if (!p) continue
        done.add(r.index)
        if (applyResult(p, r)) contention = true
      }
      publish()
      if (done.size < chunk.items.length) {
        return { ok: false, contention, unsent: [...chunk.items.filter((_, k) => !done.has(k)), ...unsentFrom(chunk.next)] }
      }
      i = chunk.next
    } catch (e) {
      if (e instanceof SalesHttpError) {
        if (e.status === 401) {
          expireSession()
          return { ok: false, contention, unsent: [] }
        }
        if (e.status === 413) {
          if (chunk.items.length > 1) {
            size = Math.max(1, Math.floor(chunk.items.length / 2))
            continue
          }
          rollbackPlan(chunk.items)
          publish()
          UI.toast("Couldn't save: that record is too large.", 'bad')
          logSales('too-large', chunk.items[0]?.id)
          i = chunk.next
          continue
        }
        if (e.status >= 500) {
          setStatus({ message: e.message })
          return { ok: false, contention, unsent: unsentFrom(i) }
        }
        rollbackPlan(chunk.items)
        publish()
        UI.toast(e.status === 403 ? "You don't have permission to do that." : `Couldn't save: ${e.message}`, 'bad')
        logSales('batch-refused', { status: e.status, code: e.code, message: e.message })
        i = chunk.next
        continue
      }
      setStatus({ message: e instanceof Error ? e.message : 'Network error' })
      return { ok: false, contention, unsent: unsentFrom(i) }
    }
  }
  return { ok: true, contention, unsent: [] }
}

export async function flush(): Promise<boolean> {
  if (running || expired) return false
  running = true
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  try {
    for (let pass = 0; pass < 20; pass++) {
      const plan = collectPlan()
      if (!plan.length) {
        dirty = false
        backoffMs = 0
        setStatus({ state: 'idle', failures: 0, queued: 0, message: undefined })
        return true
      }
      setStatus({ state: status.failures > 0 ? status.state : 'saving', queued: plan.length })
      const out = await sendPlan(plan)
      if (expired) return false
      if (!out.ok) {
        const failures = status.failures + 1
        backoffMs = Math.min(30000, backoffMs ? backoffMs * 2 : 1000)
        setStatus({ state: navigator.onLine ? 'error' : 'offline', failures, queued: out.unsent.length })
        if (!stopped) {
          timer = setTimeout(() => {
            timer = null
            void flush()
          }, backoffMs)
        }
        return false
      }
      if (out.contention) {
        setStatus({ failures: 0 })
        if (!stopped) {
          timer = setTimeout(() => {
            timer = null
            void flush()
          }, 3000)
        }
        return false
      }
      setStatus({ failures: 0 })
    }
    logSales('flush-loop', 'store did not settle after 20 passes')
    return false
  } finally {
    running = false
  }
}

/** Wait until local edits are acknowledged. Resolves false when that is not currently possible. */
export async function flushAll(): Promise<boolean> {
  for (let i = 0; i < 40 && running; i++) await new Promise(r => setTimeout(r, 100))
  if (running) return false
  return flush()
}

export function isFlushing(): boolean {
  return running
}

// ── polling ─────────────────────────────────────────────────────────────────────────────────
const POLL_MS = 15000
let polling = false
let pollTimer: ReturnType<typeof setInterval> | null = null

function applyChange(ch: ChangeEntry): void {
  const c = ch.collection
  if (!(SYNCED_COLLECTIONS as readonly string[]).includes(c)) return
  const sc = c as SyncedCollection
  const mm = metaMap(sc)
  const m = mm.get(ch.id)
  if (m && ch.rev <= m.rev) return
  const local = localData(sc, ch.id)

  if (ch.deleted || ch.hidden || !ch.data) {
    if (sc === 'settings') return
    if (m && local && stable(local) !== m.snapStr) {
      UI.toast(`A record you were editing was removed by ${userName(ch.updatedBy)}`, 'warn')
    }
    removeLocal(sc, ch.id)
    mm.delete(ch.id)
    return
  }
  if (!m && local) return
  if (m && m.snap === null) return

  const snap = normalise(sc, ch.id, ch.data)
  const snapStr = stable(snap)
  if (!local) {
    if (m) {
      mm.set(ch.id, { ...m, rev: ch.rev, snap, snapStr })
      return
    }
    if (sc === 'settings') {
      if (isSettingsId(ch.id)) writeLocal(sc, ch.id, wire(snap))
    } else if (isArrayCollection(sc)) upsertRow(sc, wire(snap))
    mm.set(ch.id, { rev: ch.rev, snap, snapStr, base: null, demo: ch.demo })
    return
  }
  const basis = m?.snap ?? snap
  const merged = rebase(sc, local, basis, snap)
  writeLocal(sc, ch.id, merged)
  const pending = stable(merged) !== snapStr
  mm.set(ch.id, { rev: ch.rev, snap, snapStr, base: m?.base ?? (pending ? (m?.rev ?? ch.rev) : null), demo: ch.demo })
}

export async function pollOnce(): Promise<void> {
  if (polling || running || expired || cursor === null || document.hidden) return
  polling = true
  try {
    let more = true
    while (more) {
      const res = await getChanges(cursor)
      if (running) return
      cursor = res.cursor
      setServerNow(res.serverNow)
      for (const ch of res.changes) applyChange(ch)
      const clock = metaMap('settings').get('clock')
      if (clock && stable(localData('settings', 'clock')) === clock.snapStr && getOffsetMinutes() !== res.clockOffsetMinutes) {
        setOffsetMinutes(res.clockOffsetMinutes)
      }
      publish()
      if (res.membersVersion !== getMembersVersion()) await refreshMembers()
      more = res.more
    }
    if (status.pollFailures) setStatus({ pollFailures: 0 })
  } catch (e) {
    if (expired) return
    const failures = status.pollFailures + 1
    setStatus({ pollFailures: failures })
    logSales('poll', e instanceof Error ? e.message : e)
  } finally {
    polling = false
  }
}

function onVisible(): void {
  if (!document.hidden) void pollOnce()
}
function onOnline(): void {
  void flush()
  void pollOnce()
}
function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (hasUnsaved()) {
    e.preventDefault()
    e.returnValue = ''
  }
}

export function startSync(): () => void {
  stopped = false
  expired = false
  if (status.state === 'expired') setStatus({ state: 'idle', failures: 0, pollFailures: 0, queued: 0, discarded: 0 })
  setSessionExpiredHandler(expireSession)
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(() => void pollOnce(), POLL_MS)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  window.addEventListener('beforeunload', onBeforeUnload)
  return () => {
    stopped = true
    setSessionExpiredHandler(null)
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('beforeunload', onBeforeUnload)
    if (timer) clearTimeout(timer)
    timer = null
  }
}

