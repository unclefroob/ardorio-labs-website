import { useSyncExternalStore } from 'react'
import type { CollectionName, FieldConflict } from '../api/contract'
import type { RecordData } from '../api/contract'
import { idx } from './store'
import { SYSTEM_USER, SYSTEM_USER_ID } from './systemUser'

/** What the user is asked after a batch result that did not simply apply (contract 5.2, D16). */
export type ConflictPrompt =
  | { id: number; kind: 'field'; collection: CollectionName; recId: string; label: string; rev: number; fields: FieldConflict[] }
  | { id: number; kind: 'deleted'; collection: CollectionName; recId: string; label: string; rev: number; by: string; record: RecordData }
  | { id: number; kind: 'modified'; collection: CollectionName; recId: string; label: string; rev: number; by: string }

type NewPrompt =
  | Omit<Extract<ConflictPrompt, { kind: 'field' }>, 'id'>
  | Omit<Extract<ConflictPrompt, { kind: 'deleted' }>, 'id'>
  | Omit<Extract<ConflictPrompt, { kind: 'modified' }>, 'id'>

let prompts: ConflictPrompt[] = []
let seq = 0
let version = 0
const subs = new Set<() => void>()

function emit(): void {
  version++
  prompts = [...prompts]
  subs.forEach(f => f())
}

function subscribePrompts(f: () => void): () => void {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

export function addPrompt(p: NewPrompt): void {
  prompts.push({ ...p, id: ++seq } as ConflictPrompt)
  emit()
}

export function removePrompt(id: number): void {
  prompts = prompts.filter(p => p.id !== id)
  emit()
}

/** Drop the named paths from a field prompt; the prompt closes when none remain. */
export function resolvePaths(id: number, paths: readonly string[]): void {
  const next: ConflictPrompt[] = []
  for (const p of prompts) {
    if (p.id !== id || p.kind !== 'field') {
      next.push(p)
      continue
    }
    const fields = p.fields.filter(f => !paths.includes(f.path))
    if (fields.length) next.push({ ...p, fields })
  }
  prompts = next
  emit()
}

export function getPrompts(): readonly ConflictPrompt[] {
  return prompts
}

export function usePrompts(): readonly ConflictPrompt[] {
  useSyncExternalStore(subscribePrompts, () => version)
  return prompts
}

export function userName(id: string): string {
  return idx.users.get(id)?.name ?? (id === SYSTEM_USER_ID ? SYSTEM_USER.name : 'a teammate')
}

const NOUN: Partial<Record<CollectionName, string>> = {
  companies: 'company', contacts: 'contact', deals: 'deal', tasks: 'task', meetings: 'meeting',
  sequences: 'sequence', templates: 'template', lists: 'lead list', goals: 'goal', threads: 'thread',
  settings: 'settings', pipelines: 'pipeline', businesses: 'business settings',
}

export function describeRecord(collection: CollectionName, data: RecordData | undefined): string {
  const noun = NOUN[collection] ?? 'record'
  if (!data) return noun
  for (const k of ['name', 'title', 'subject']) {
    const v = data[k]
    if (typeof v === 'string' && v) return `${noun} "${v}"`
  }
  return noun
}
