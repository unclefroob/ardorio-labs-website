import type { Sequence } from '../../../data/types'

export const CONDS: ReadonlyArray<readonly [key: string, label: string]> = [
  ['no_reply', 'No human reply received'],
  ['replied', 'Contact replied'],
  ['positive', 'Positive reply received'],
  ['meeting', 'Meeting booked'],
  ['bounced', 'Email bounced'],
  ['unsub', 'Contact unsubscribed'],
  ['task_done', 'Previous task completed'],
  ['clicked', 'Tracked link clicked (simulated)'],
]

export const condLabel = (k: unknown): string => CONDS.find(c => c[0] === k)?.[1] ?? 'condition'

export interface SeqVersion { n: number; ts: string; by: string; steps: number }
export type Draft = Sequence & { versions?: SeqVersion[] }

export const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
