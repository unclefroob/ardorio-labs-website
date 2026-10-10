import type { RecordData } from '../api/contract'
import type { SyncedCollection } from './store'

const KEYED_NOTES: ReadonlySet<SyncedCollection> = new Set<SyncedCollection>(['companies', 'contacts', 'deals'])

export function hasKeyedNotes(c: SyncedCollection): boolean {
  return KEYED_NOTES.has(c)
}

/** Deterministic JSON: sorted keys, `undefined` treated as absent. Used for equality, never sent. */
export function stable(v: unknown): string {
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  const o = v as Record<string, unknown>
  const parts: string[] = []
  for (const k of Object.keys(o).sort()) {
    if (o[k] === undefined) continue
    parts.push(`${JSON.stringify(k)}:${stable(o[k])}`)
  }
  return `{${parts.join(',')}}`
}

export function same(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b)
}

/** JSON-clean copy: drops `undefined` keys, which the wire cannot carry. */
export function wire<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T)
}

export interface NoteLike { id: string; [k: string]: unknown }

export interface RecordDiff {
  set: Record<string, unknown>
  unset: string[]
  notesUpsert: NoteLike[]
  notesRemove: string[]
}

export function emptyDiff(): RecordDiff {
  return { set: {}, unset: [], notesUpsert: [], notesRemove: [] }
}

export function isEmptyDiff(d: RecordDiff): boolean {
  return Object.keys(d.set).length === 0 && d.unset.length === 0 && d.notesUpsert.length === 0 && d.notesRemove.length === 0
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function noteList(v: unknown): NoteLike[] {
  return Array.isArray(v) ? v.filter((n): n is NoteLike => isObj(n) && typeof n.id === 'string') : []
}

/** Changes needed to turn `from` into `to`, in the wire grammar of contract section 5.1. */
export function diffRecord(c: SyncedCollection, to: RecordData, from: RecordData): RecordDiff {
  const out = emptyDiff()
  if (stable(to) === stable(from)) return out
  const keys = new Set([...Object.keys(to), ...Object.keys(from)])
  keys.delete('id')
  const notes = hasKeyedNotes(c)
  for (const k of keys) {
    const a = to[k]
    const b = from[k]
    if (stable(a) === stable(b)) continue
    if (notes && k === 'notes') {
      const had = new Map(noteList(b).map(n => [n.id, n]))
      const have = new Set<string>()
      for (const n of noteList(a)) {
        have.add(n.id)
        const old = had.get(n.id)
        if (!old || stable(old) !== stable(n)) out.notesUpsert.push(wire(n))
      }
      for (const id of had.keys()) if (!have.has(id)) out.notesRemove.push(id)
      continue
    }
    if (c === 'deals' && k === 'fields') {
      const fa = isObj(a) ? a : {}
      const fb = isObj(b) ? b : {}
      for (const fk of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
        if (stable(fa[fk]) === stable(fb[fk])) continue
        if (fa[fk] === undefined) out.unset.push(`fields/${fk}`)
        else out.set[`fields/${fk}`] = wire(fa[fk])
      }
      continue
    }
    if (a === undefined) out.unset.push(k)
    else out.set[k] = wire(a)
  }
  return out
}

/** Full record for a create op. */
export function createPayload(rec: RecordData): Record<string, unknown> {
  return wire(rec)
}

export function getPath(rec: RecordData, path: string): unknown {
  if (path.startsWith('fields/')) {
    const f = rec.fields
    return isObj(f) ? f[path.slice(7)] : undefined
  }
  if (path.startsWith('notes#')) {
    const id = path.slice(6)
    return noteList(rec.notes).find(n => n.id === id)
  }
  return rec[path]
}

export function setPath(rec: RecordData, path: string, value: unknown): void {
  if (path.startsWith('fields/')) {
    if (!isObj(rec.fields)) rec.fields = {}
    const f = rec.fields as Record<string, unknown>
    if (value === undefined) delete f[path.slice(7)]
    else f[path.slice(7)] = wire(value)
    return
  }
  if (path.startsWith('notes#')) {
    const id = path.slice(6)
    const list = noteList(rec.notes)
    const i = list.findIndex(n => n.id === id)
    if (value === undefined) {
      if (i >= 0) list.splice(i, 1)
    } else if (isObj(value)) {
      const item: NoteLike = { ...wire(value), id }
      if (i >= 0) list[i] = item
      else list.unshift(item)
    }
    rec.notes = list
    return
  }
  if (value === undefined) delete rec[path]
  else rec[path] = wire(value)
}

export function applyDiff(rec: RecordData, d: RecordDiff, skip?: ReadonlySet<string>): void {
  for (const [p, v] of Object.entries(d.set)) if (!skip?.has(p)) setPath(rec, p, v)
  for (const p of d.unset) if (!skip?.has(p)) setPath(rec, p, undefined)
  if (d.notesUpsert.length || d.notesRemove.length) {
    const list = noteList(rec.notes)
    for (const id of d.notesRemove) {
      if (skip?.has(`notes#${id}`)) continue
      const i = list.findIndex(n => n.id === id)
      if (i >= 0) list.splice(i, 1)
    }
    for (const n of d.notesUpsert) {
      if (skip?.has(`notes#${n.id}`)) continue
      const i = list.findIndex(x => x.id === n.id)
      if (i >= 0) list[i] = wire(n)
      else list.unshift(wire(n))
    }
    rec.notes = list
  }
}

/**
 * Re-apply what the user changed locally (`local` vs `basis`) on top of a newer server copy.
 * Serves both the poll merge (basis = previous server copy) and applying a batch result
 * (basis = the local copy captured when the batch was sent, so only later edits survive).
 */
export function rebase(c: SyncedCollection, local: RecordData, basis: RecordData, server: RecordData): RecordData {
  const out = wire(server)
  applyDiff(out, diffRecord(c, local, basis))
  return out
}

export function diffPaths(d: RecordDiff): string[] {
  return [...Object.keys(d.set), ...d.unset, ...d.notesUpsert.map(n => `notes#${n.id}`), ...d.notesRemove.map(id => `notes#${id}`)]
}
