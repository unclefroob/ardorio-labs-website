import { ageDays } from '../data/signalAdjust'
import type { Intel } from '../data/types'
import { Q } from '../data/Q'

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** "today", "yesterday", "5 days ago". */
export function daysAgo(iso: string | undefined, now: number = Date.now()): string {
  const d = ageDays(iso, now)
  if (d === Infinity) return 'at an unknown time'
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d} days ago`
}

/** "Checked 3 days ago by Sam". */
export function checkedLine(r: Pick<Intel, 'ts' | 'by'>, now: number = Date.now()): string {
  const who = Q.user(r.by)?.name
  return `Checked ${daysAgo(r.ts, now)}${who ? ` by ${who}` : ''}`
}

export function copyText(text: string, done: (msg: string, tone?: 'warn') => void, what = 'Copied'): void {
  if (!navigator.clipboard) return done('Copy is not available in this browser. Select the text and copy it.', 'warn')
  navigator.clipboard.writeText(text).then(
    () => done(what),
    () => done('Could not copy. Select the text and copy it.', 'warn'),
  )
}
