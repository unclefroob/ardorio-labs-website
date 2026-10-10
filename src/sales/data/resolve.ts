import { removeLocal, writeLocal } from './plan'
import { removePrompt, resolvePaths, type ConflictPrompt } from './conflicts'
import { setPath, wire } from './diff'
import { localData } from './plan'
import { metaMap, normalise, publish, type SyncedCollection } from './store'
import { scheduleFlush } from './sync'

function sc(p: ConflictPrompt): SyncedCollection {
  return p.collection as SyncedCollection
}

type FieldPrompt = Extract<ConflictPrompt, { kind: 'field' }>

/**
 * "Keep mine": put my values back and resend those paths against the server rev the conflict
 * reported (contract 5.2), so the server sees them as made after the other person's change.
 */
export function keepMineFields(p: FieldPrompt, paths: readonly string[]): void {
  const c = sc(p)
  const chosen = p.fields.filter(f => paths.includes(f.path))
  const rec = localData(c, p.recId)
  const m = metaMap(c).get(p.recId)
  if (rec && m && chosen.length) {
    const next = wire(rec)
    for (const f of chosen) setPath(next, f.path, f.mine)
    writeLocal(c, p.recId, next)
    metaMap(c).set(p.recId, { ...m, base: p.rev })
  }
  resolvePaths(p.id, paths)
  publish()
  scheduleFlush()
}

/** "Keep theirs": the server value is already in place locally, so this only closes the question. */
export function keepTheirsFields(p: FieldPrompt, paths: readonly string[]): void {
  resolvePaths(p.id, paths)
}

export function keepMine(p: FieldPrompt): void {
  keepMineFields(p, p.fields.map(f => f.path))
}

export function keepTheirs(p: ConflictPrompt): void {
  removePrompt(p.id)
}

/** Restore a record someone else deleted. Sent with `resurrect: true`; never automatic (D16). */
export function restoreDeleted(p: Extract<ConflictPrompt, { kind: 'deleted' }>): void {
  const c = sc(p)
  const rec = normalise(c, p.recId, p.record)
  writeLocal(c, p.recId, rec)
  metaMap(c).set(p.recId, { rev: p.rev, snap: null, snapStr: '', base: p.rev, demo: false })
  removePrompt(p.id)
  publish()
  scheduleFlush()
}

/** Confirm the delete after someone else edited the record: drop it locally and resend at the new rev. */
export function deleteAnyway(p: Extract<ConflictPrompt, { kind: 'modified' }>): void {
  const c = sc(p)
  const m = metaMap(c).get(p.recId)
  if (m) metaMap(c).set(p.recId, { ...m, rev: p.rev, base: null })
  removeLocal(c, p.recId)
  removePrompt(p.id)
  publish()
  scheduleFlush()
}

