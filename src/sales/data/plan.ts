import type { DeleteOp, Op, PutOp, RecordData } from '../api/contract'
import { SETTINGS_IDS } from '../api/contract'
import { createPayload, diffRecord, hasKeyedNotes, isEmptyDiff, stable, wire } from './diff'
import {
  applySettings, ARRAY_COLLECTIONS, findRow, isSettingsId, metaMap, removeRow, settingsRecord,
  rowsOf, upsertRow, type Row, type SyncedCollection,
} from './store'

/** One op plus what the result handler needs to reconcile it. */
export interface Planned {
  op: Op
  c: SyncedCollection
  id: string
  kind: 'create' | 'update' | 'delete'
  /** Local copy as sent (null for deletes); the basis that keeps edits made while in flight. */
  sent: RecordData | null
}

export function asData(r: Row): RecordData {
  return r as RecordData
}

export function localData(c: SyncedCollection, id: string): RecordData | undefined {
  if (c === 'settings') return isSettingsId(id) ? settingsRecord(id) : undefined
  const r = findRow(c, id)
  return r ? asData(r) : undefined
}

export function writeLocal(c: SyncedCollection, id: string, data: RecordData): void {
  if (c === 'settings') {
    if (isSettingsId(id)) applySettings(id, data)
    return
  }
  upsertRow(c, { ...data, id })
}

export function removeLocal(c: SyncedCollection, id: string): void {
  if (c !== 'settings') removeRow(c, id)
}

function planRecord(c: SyncedCollection, id: string, local: RecordData, out: Planned[]): void {
  const m = metaMap(c).get(id)
  if (!m) {
    const op: PutOp = { op: 'put', collection: c, id, baseRev: null, set: createPayload(local) }
    out.push({ op, c, id, kind: 'create', sent: wire(local) })
    return
  }
  if (m.snap === null) {
    const op: PutOp = { op: 'put', collection: c, id, baseRev: m.base ?? m.rev, set: createPayload(local), resurrect: true }
    out.push({ op, c, id, kind: 'update', sent: wire(local) })
    return
  }
  if (m.rev === 0 && c === 'settings') {
    if (stable(local) === m.snapStr) return
    const op: PutOp = { op: 'put', collection: c, id, baseRev: 0, set: createPayload(local) }
    out.push({ op, c, id, kind: 'update', sent: wire(local) })
    return
  }
  if (stable(local) === m.snapStr) return
  const d = diffRecord(c, local, m.snap)
  if (isEmptyDiff(d)) return
  const op: PutOp = { op: 'put', collection: c, id, baseRev: m.base ?? m.rev, set: d.set }
  if (d.unset.length) op.unset = d.unset
  if (hasKeyedNotes(c) && (d.notesUpsert.length || d.notesRemove.length)) {
    op.items = { notes: {} }
    if (d.notesUpsert.length) op.items.notes = { ...op.items.notes, upsert: d.notesUpsert }
    if (d.notesRemove.length) op.items.notes = { ...op.items.notes, remove: d.notesRemove }
  }
  out.push({ op, c, id, kind: 'update', sent: wire(local) })
}

/** Everything the local state has that the server copy does not, as ordered ops (contract 5.1). */
export function collectPlan(): Planned[] {
  const entityCreates: Planned[] = []
  const rels: Planned[] = []
  const otherCreates: Planned[] = []
  const updates: Planned[] = []
  const deletes: Planned[] = []

  for (const c of ARRAY_COLLECTIONS) {
    const mm = metaMap(c)
    const bucket: Planned[] = []
    const seen = new Set<string>()
    for (const r of rowsOf(c)) {
      seen.add(r.id)
      planRecord(c, r.id, asData(r), bucket)
    }
    for (const [id, m] of mm) {
      if (seen.has(id)) continue
      const op: DeleteOp = { op: 'delete', collection: c, id, baseRev: m.rev }
      deletes.push({ op, c, id, kind: 'delete', sent: null })
    }
    for (const p of bucket) {
      if (p.kind !== 'create') updates.push(p)
      else if (c === 'companies' || c === 'contacts') entityCreates.push(p)
      else if (c === 'companyRels' || c === 'contactRels') rels.push(p)
      else otherCreates.push(p)
    }
  }

  const bucket: Planned[] = []
  for (const id of SETTINGS_IDS) planRecord('settings', id, settingsRecord(id), bucket)
  updates.push(...bucket)

  return [...entityCreates, ...rels, ...otherCreates, ...updates, ...deletes]
}

function relOwner(p: Planned): string | null {
  if (p.c !== 'companyRels' && p.c !== 'contactRels') return null
  const k = p.c === 'companyRels' ? 'companyId' : 'contactId'
  const v = p.sent?.[k]
  return typeof v === 'string' ? v : null
}

/** An entity create and its rel creates must travel in the same request (contract 5.1), so they form one atom. */
export function toAtoms(plan: Planned[]): Planned[][] {
  const byEntity = new Map<string, Planned[]>()
  const atoms: Planned[][] = []
  const rest: Planned[] = []
  for (const p of plan) {
    if (p.kind === 'create' && (p.c === 'companies' || p.c === 'contacts')) {
      const atom = [p]
      byEntity.set(`${p.c}:${p.id}`, atom)
      atoms.push(atom)
    } else rest.push(p)
  }
  for (const p of rest) {
    const owner = relOwner(p)
    const key = owner ? `${p.c === 'companyRels' ? 'companies' : 'contacts'}:${owner}` : null
    const atom = key ? byEntity.get(key) : undefined
    if (atom) atom.push(p)
    else atoms.push([p])
  }
  return atoms
}

export function takeChunk(atoms: Planned[][], from: number, size: number): { items: Planned[]; next: number } {
  const items: Planned[] = []
  let i = from
  while (i < atoms.length) {
    const a = atoms[i]
    if (items.length > 0 && items.length + a.length > size) break
    items.push(...a)
    i++
  }
  return { items, next: i }
}
