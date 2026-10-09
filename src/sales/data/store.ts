import { useSyncExternalStore } from 'react'
import { getOffsetMinutes, setOffsetMinutes } from './clock'
import type { RecordData, SettingsId } from '../api/contract'
import { SETTINGS_IDS } from '../api/contract'
import type { Collections, CollKey, State } from './types'

/** Collections that exist as arrays in `S`. `users` is a read-only projection of the member list. */
export const ARRAY_COLLECTIONS = [
  'businesses', 'teams', 'pipelines', 'companies', 'contacts', 'deals', 'tasks', 'meetings',
  'mailboxes', 'templates', 'sequences', 'enrolments', 'threads', 'messages', 'lists', 'goals',
  'recs', 'research', 'suppressions', 'activities', 'notifications', 'companyRels', 'contactRels',
  'audit', 'importJobs', 'savedViews',
] as const satisfies readonly CollKey[]
export type ArrayCollection = typeof ARRAY_COLLECTIONS[number]
export type SyncedCollection = ArrayCollection | 'settings'
export const SYNCED_COLLECTIONS: readonly SyncedCollection[] = [...ARRAY_COLLECTIONS, 'settings']

export function isArrayCollection(c: string): c is ArrayCollection {
  return (ARRAY_COLLECTIONS as readonly string[]).includes(c)
}

function emptyState(): State {
  return {
    businesses: [], users: [], teams: [], pipelines: [], companies: [], contacts: [], deals: [],
    tasks: [], meetings: [], mailboxes: [], templates: [], sequences: [], enrolments: [], threads: [],
    messages: [], lists: [], goals: [], recs: [], research: [], suppressions: [], activities: [],
    notifications: [], companyRels: [], contactRels: [], audit: [], importJobs: [], savedViews: [],
    session: { userId: '', ws: 'all', theme: 'light' },
    org: { name: '', tz: 'Australia/Melbourne', currency: 'AUD', dateFormat: 'D MMM YYYY', notif: { email: true, inApp: true }, sendingLimit: 50 },
    wiza: { status: 'disconnected', credits: 0, used: 0, lastSync: null, history: [], autoUpdate: false, requireReview: true },
    demo: { wizaFail: false, researchFail: false },
    crossStatus: {},
  }
}

/** The single mutable application state. Mutated in place by Act, then `commit()` publishes it. */
export const S: State = emptyState()

type IndexedKey = Exclude<keyof Collections, 'audit' | 'importJobs' | 'savedViews'>
type Idx = { [K in IndexedKey]: Map<string, Collections[K][number]> }

const INDEXED: readonly IndexedKey[] = [
  'businesses', 'users', 'teams', 'pipelines', 'companies', 'contacts', 'deals', 'tasks', 'meetings',
  'mailboxes', 'templates', 'sequences', 'enrolments', 'threads', 'messages', 'lists', 'goals', 'recs',
  'research', 'suppressions', 'activities', 'notifications', 'companyRels', 'contactRels',
]

function emptyIdx(): Idx {
  return {
    businesses: new Map(), users: new Map(), teams: new Map(), pipelines: new Map(), companies: new Map(),
    contacts: new Map(), deals: new Map(), tasks: new Map(), meetings: new Map(), mailboxes: new Map(),
    templates: new Map(), sequences: new Map(), enrolments: new Map(), threads: new Map(), messages: new Map(),
    lists: new Map(), goals: new Map(), recs: new Map(), research: new Map(), suppressions: new Map(),
    activities: new Map(), notifications: new Map(), companyRels: new Map(), contactRels: new Map(),
  }
}

export const idx: Idx = emptyIdx()

function fill<K extends IndexedKey>(k: K): void {
  const m: Map<string, Collections[K][number]> = idx[k]
  m.clear()
  for (const r of S[k]) {
    if (r && typeof r.id === 'string') m.set(r.id, r)
  }
}

export function reindex(): void {
  for (const k of INDEXED) fill(k)
}

// ── subscriptions ────────────────────────────────────────────────────────────────────────────
const subs = new Set<() => void>()
let version = 0

export function subscribe(f: () => void): () => void {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

export function notifyStore(): void {
  version++
  subs.forEach(f => f())
}

/** Reindex and notify without scheduling a save (poll merges, result adoption). */
export function publish(): void {
  reindex()
  notifyStore()
}

export function getVersion(): number {
  return version
}

/** Re-render on every committed change (the prototype did this globally too). Returns a version number. */
export function useStore(): number {
  return useSyncExternalStore(subscribe, getVersion)
}

// ── load status ──────────────────────────────────────────────────────────────────────────────
export type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'noaccess'; message: string }
  | { status: 'error'; message: string }

let loadState: LoadState = { status: 'loading' }
export function getLoadState(): LoadState {
  return loadState
}
export function setLoadState(s: LoadState): void {
  loadState = s
  notifyStore()
}
export function useLoadState(): LoadState {
  useSyncExternalStore(subscribe, getVersion)
  return loadState
}

// ── generic row access (the one place record shape is treated as opaque) ────────────────────
export type Row = { id: string }

export function rowsOf(c: ArrayCollection): readonly Row[] {
  return S[c]
}

/**
 * Trust boundary. Server data arrives as plain objects and is stored in the typed arrays; the
 * typed layer above (Q, Act) is what keeps shapes honest, the wire layer only moves rows.
 */
function mutableRows(c: ArrayCollection): Row[] {
  return S[c] as Row[]
}

export function findRow(c: ArrayCollection, id: string): Row | undefined {
  return mutableRows(c).find(r => r.id === id)
}

export function upsertRow(c: ArrayCollection, data: RecordData & Row): void {
  const rows = mutableRows(c)
  const i = rows.findIndex(r => r.id === data.id)
  if (i >= 0) rows[i] = data
  else rows.push(data)
}

export function removeRow(c: ArrayCollection, id: string): void {
  const rows = mutableRows(c)
  const i = rows.findIndex(r => r.id === id)
  if (i >= 0) rows.splice(i, 1)
}

// ── per-record sync metadata ────────────────────────────────────────────────────────────────
export interface RecMeta {
  rev: number
  /** Last known server copy of the record; null for a record being restored after a delete conflict. */
  snap: RecordData | null
  /** stable() of `snap`, cached for the cheap "unchanged?" test at flush time. */
  snapStr: string
  /** Rev of the synced copy when the earliest still-unflushed edit was made. */
  base: number | null
  demo: boolean
  resurrect?: boolean
}

const metas = new Map<SyncedCollection, Map<string, RecMeta>>()
for (const c of SYNCED_COLLECTIONS) metas.set(c, new Map())

export function metaMap(c: SyncedCollection): Map<string, RecMeta> {
  const m = metas.get(c)
  if (!m) throw new Error(`unknown collection ${c}`)
  return m
}

export function clearAllMeta(): void {
  for (const m of metas.values()) m.clear()
}

// ── settings: singleton objects that sync as records `org|wiza|demo|crossStatus|clock` ──────
export function isSettingsId(id: string): id is SettingsId {
  return (SETTINGS_IDS as readonly string[]).includes(id)
}

export function settingsRecord(id: SettingsId): RecordData & Row {
  switch (id) {
    case 'org': return { ...S.org, id }
    case 'wiza': return { ...S.wiza, id }
    case 'demo': return { ...S.demo, id }
    case 'crossStatus': return { ...S.crossStatus, id }
    case 'clock': return { id, offsetMinutes: getOffsetMinutes() }
  }
}

export function settingsRows(): Array<RecordData & Row> {
  return SETTINGS_IDS.map(settingsRecord)
}

function assignContents(target: object, src: RecordData): void {
  for (const k of Object.keys(target)) Reflect.deleteProperty(target, k)
  for (const [k, v] of Object.entries(src)) if (k !== 'id') Reflect.set(target, k, v)
}

export function applySettings(id: SettingsId, data: RecordData): void {
  switch (id) {
    case 'org': assignContents(S.org, data); break
    case 'wiza': assignContents(S.wiza, data); break
    case 'demo': assignContents(S.demo, data); break
    case 'crossStatus': assignContents(S.crossStatus, data); break
    case 'clock': setOffsetMinutes(typeof data.offsetMinutes === 'number' ? data.offsetMinutes : 0); break
  }
}

// ── normalisation of server rows ────────────────────────────────────────────────────────────
const ARRAY_DEFAULTS: Partial<Record<SyncedCollection, readonly string[]>> = {
  businesses: ['industries', 'roles'],
  teams: ['members'],
  pipelines: ['lostReasons', 'forecast', 'card', 'fields', 'stages'],
  companies: ['tech', 'tags', 'notes'],
  contacts: ['notes'],
  companyRels: ['tags'],
  contactRels: ['tags'],
  deals: ['contactIds', 'stageHistory', 'notes'],
  sequences: ['steps', 'exits'],
  enrolments: ['history'],
  threads: ['sharedWith'],
  mailboxes: ['businessIds', 'authorised'],
  meetings: ['participants'],
  lists: ['contactIds'],
}
const OBJECT_DEFAULTS: Partial<Record<SyncedCollection, readonly string[]>> = {
  deals: ['fields'],
  meetings: ['sections'],
}

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T)
}

/** Deep copy with the empty containers the ported code assumes (it never saw a partial row). */
export function normalise(c: SyncedCollection, id: string, data: RecordData): RecordData & Row {
  const out: RecordData = clone(data)
  for (const k of ARRAY_DEFAULTS[c] ?? []) if (!Array.isArray(out[k])) out[k] = []
  for (const k of OBJECT_DEFAULTS[c] ?? []) if (typeof out[k] !== 'object' || out[k] === null) out[k] = {}
  if (c === 'businesses') {
    for (const k of ['knowledge', 'style', 'desc', 'short']) if (typeof out[k] !== 'string') out[k] = ''
  }
  return { ...out, id }
}

export { clone }
