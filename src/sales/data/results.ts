import type { OpResult, RecordData, RecordEnvelope } from '../api/contract'
import { logSales } from '../log'
import { UI } from '../ui/store'
import { addPrompt, describeRecord, userName } from './conflicts'
import { rebase, stable, wire } from './diff'
import { fieldLabel } from './fieldLabels'
import { getMyProfile } from './session'
import { localData, removeLocal, writeLocal, type Planned } from './plan'
import { metaMap, normalise, type RecMeta, type SyncedCollection } from './store'

const PERMISSION_CODES = new Set(['ROLE_REQUIRED', 'READ_ONLY', 'APPEND_ONLY', 'IMMUTABLE_FIELD'])

function metaFor(env: RecordEnvelope, snap: RecordData, pending: boolean): RecMeta {
  return { rev: env.rev, snap, snapStr: stable(snap), base: pending ? env.rev : null, demo: env.demo }
}

/**
 * Take the server's copy of a record as the new synced copy and lay the user's later edits
 * (local vs `basis`) back on top of it. `basis` null means nothing local to preserve.
 */
export function adopt(c: SyncedCollection, id: string, env: RecordEnvelope, basis: RecordData | null): void {
  const mm = metaMap(c)
  const snap = normalise(c, id, env.data)
  const local = localData(c, id)
  if (!local) {
    mm.set(id, metaFor(env, snap, false))
    return
  }
  const merged = basis ? rebase(c, local, basis, snap) : wire(snap)
  writeLocal(c, id, merged)
  mm.set(id, metaFor(env, snap, stable(merged) !== stable(snap)))
}

/** Undo a rejected or abandoned op locally, keeping edits made after it was sent. */
export function rollback(p: Planned): void {
  const mm = metaMap(p.c)
  const m = mm.get(p.id)
  if (p.kind === 'create') {
    if (!m) removeLocal(p.c, p.id)
    return
  }
  if (!m || !m.snap) {
    mm.delete(p.id)
    return
  }
  const local = localData(p.c, p.id)
  if (p.kind === 'delete') {
    if (!local) writeLocal(p.c, p.id, wire(m.snap))
    return
  }
  if (!local) return
  const merged = p.sent ? rebase(p.c, local, p.sent, m.snap) : wire(m.snap)
  writeLocal(p.c, p.id, merged)
  mm.set(p.id, { ...m, base: stable(merged) === m.snapStr ? null : m.base })
}

export function rollbackPlan(items: readonly Planned[]): void {
  for (const p of items) rollback(p)
}

function reject(p: Planned, r: OpResult): void {
  const code = r.error?.code
  if (code === 'CONTENTION') return
  if (code === 'DUPLICATE_SEND') {
    if (p.kind === 'create') removeLocal(p.c, p.id)
    return
  }
  if (code === 'NOT_FOUND') {
    removeLocal(p.c, p.id)
    metaMap(p.c).delete(p.id)
    logSales('not-found', { collection: p.c, id: p.id })
    return
  }
  rollback(p)
  logSales('rejected', { collection: p.c, id: p.id, code, message: r.error?.message })
  const raw: string | undefined = code
  if (raw === 'INVALID_URL') {
    const path = r.error?.details?.path
    const what = typeof path === 'string' ? fieldLabel(p.c, p.id, path) : 'A web address'
    UI.toast(`${what} must start with http:// or https://. Your change was not saved.`, 'bad')
    return
  }
  if (code && PERMISSION_CODES.has(code)) UI.toast("You don't have permission to do that.", 'bad')
  else UI.toast(`Couldn't save: ${r.error?.message ?? 'unknown error'}`, 'bad')
}

/** Apply one OpResult (contract 5.2). Returns true when the op must stay queued for a later flush. */
export function applyResult(p: Planned, r: OpResult): boolean {
  const { c, id } = p
  const mm = metaMap(c)
  const env = r.record

  if (r.status === 'rejected') {
    reject(p, r)
    return r.error?.code === 'CONTENTION'
  }

  if (p.kind === 'delete') {
    if (r.status === 'conflict' && r.conflict?.kind === 'modified' && env) {
      adopt(c, id, env, null)
      writeLocal(c, id, wire(normalise(c, id, env.data)))
      addPrompt({
        kind: 'modified', collection: c, recId: id, rev: r.rev ?? env.rev,
        label: describeRecord(c, env.data), by: userName(env.updatedBy),
      })
      return false
    }
    mm.delete(id)
    removeLocal(c, id)
    return false
  }

  if (r.status === 'conflict' && r.conflict) {
    const k = r.conflict.kind
    if (k === 'deleted') {
      const sent = p.sent ?? {}
      removeLocal(c, id)
      mm.delete(id)
      addPrompt({
        kind: 'deleted', collection: c, recId: id, rev: r.rev ?? 0, record: sent,
        label: describeRecord(c, sent), by: r.conflict.fields[0] ? userName(r.conflict.fields[0].changedBy) : 'a teammate',
      })
      return false
    }
    if (env) {
      adopt(c, id, env, p.sent)
      if (r.conflict.fields.length) {
        addPrompt({
          kind: 'field', collection: c, recId: id, rev: r.rev ?? env.rev,
          label: describeRecord(c, env.data), fields: r.conflict.fields,
        })
      }
    }
    return false
  }

  if (!env) {
    mm.delete(id)
    removeLocal(c, id)
    return false
  }
  adopt(c, id, env, p.sent)
  if (r.status === 'merged') {
    const other = env.updatedBy === getMyProfile()?.userId ? 'a teammate' : userName(env.updatedBy)
    UI.toast(`Updated with changes from ${other}`)
  }
  return false
}
