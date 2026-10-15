import type { Sequence } from '../../../data/types'

/** Questions a Check can ask, grouped as the editor shows them. `needs` marks those that only answer Yes when tracking is on. */
export interface Question { key: string; label: string; group: 'Your emails' | 'Your own work' | 'The CRM'; needs?: 'opens' | 'clicks' }
export const QUESTIONS: readonly Question[] = [
  { key: 'opened', label: 'Did they open an email?', group: 'Your emails', needs: 'opens' },
  { key: 'clicked', label: 'Did they click a link in an email?', group: 'Your emails', needs: 'clicks' },
  { key: 'call_connected', label: 'Was the call connected?', group: 'Your own work' },
  { key: 'task_done', label: 'Was the previous task done?', group: 'Your own work' },
  { key: 'meeting', label: 'Did they book a meeting?', group: 'Your own work' },
  { key: 'open_deal', label: 'Is there an open deal for their company?', group: 'The CRM' },
  { key: 'has_mobile', label: 'Do we have their mobile?', group: 'The CRM' },
]

// The older checks (continue only if, otherwise exit or skip) used these too; kept so their labels still read.
export const CONDS: ReadonlyArray<readonly [key: string, label: string]> = [
  ['no_reply', 'No human reply received'],
  ['replied', 'Contact replied'],
  ['positive', 'Positive reply received'],
  ['meeting', 'Meeting booked'],
  ['bounced', 'Email bounced'],
  ['unsub', 'Contact unsubscribed'],
  ['task_done', 'Previous task completed'],
  ['clicked', 'Tracked link clicked'],
  ...QUESTIONS.filter(q => !['meeting', 'task_done', 'clicked'].includes(q.key)).map(q => [q.key, q.label] as const),
]

export const condLabel = (k: unknown): string => CONDS.find(c => c[0] === k)?.[1] ?? 'condition'

export interface SeqVersion { n: number; ts: string; by: string; steps: number }
export type Draft = Sequence & { versions?: SeqVersion[] }

export const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
