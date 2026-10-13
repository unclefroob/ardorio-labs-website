import type { SyncedCollection } from './store'

/** What the server did with a record's op: accepted it, or refused it (and the local copy was rolled back). */
export type OpOutcome = { ok: true } | { ok: false; error: string }

type Listener = (o: OpOutcome) => void
const listeners = new Map<string, Set<Listener>>()
const key = (c: SyncedCollection, id: string): string => `${c}:${id}`

/** Hear the next outcome of an op on this record. Returns the unsubscribe. */
export function watchOp(c: SyncedCollection, id: string, fn: Listener): () => void {
  const k = key(c, id)
  const set = listeners.get(k) ?? new Set<Listener>()
  set.add(fn)
  listeners.set(k, set)
  return () => {
    set.delete(fn)
    if (!set.size && listeners.get(k) === set) listeners.delete(k)
  }
}

/** Called by the sync layer once an op on this record has an outcome. Each listener hears one outcome. */
export function settleOp(c: SyncedCollection, id: string, o: OpOutcome): void {
  const k = key(c, id)
  const set = listeners.get(k)
  if (!set) return
  listeners.delete(k)
  for (const fn of set) fn(o)
}

/**
 * Resolve once the server has accepted every one of these records, or at the first one it refuses. Used where
 * several records written together only make sense as a whole (Record a won deal: company, contact, deal).
 */
export function watchAll(records: ReadonlyArray<readonly [SyncedCollection, string]>): Promise<OpOutcome> {
  return new Promise(resolve => {
    let left = records.length
    if (!left) return resolve({ ok: true })
    const offs: Array<() => void> = []
    let done = false
    const finish = (o: OpOutcome): void => {
      if (done) return
      done = true
      offs.forEach(off => off())
      resolve(o)
    }
    for (const [c, id] of records) {
      offs.push(watchOp(c, id, o => {
        if (!o.ok) return finish(o)
        if (--left === 0) finish(o)
      }))
    }
  })
}
