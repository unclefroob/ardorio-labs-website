import { useEffect, useRef, useState, type RefObject } from 'react'

/** Line styles that tell series apart without relying on colour. Index matches the series order. */
export const LINE_DASH: readonly string[] = ['', '7 4', '2 4', '9 3 2 3']

export const TONE: Record<string, string> = { High: 'bad', Medium: 'warn', Low: '' }

export const EST: Record<string, [string, string]> = {
  active: ['Active', 'info'],
  awaiting_approval: ['Awaiting approval', 'warn'],
  awaiting_task: ['Awaiting task', 'warn'],
  paused: ['Paused', ''],
  replied: ['Replied', 'ok'],
  completed: ['Completed', ''],
  bounced: ['Bounced', 'bad'],
  unsubscribed: ['Unsubscribed', 'bad'],
  failed: ['Failed', 'bad'],
  removed: ['Removed', ''],
  scheduled: ['Scheduled', 'info'],
  draft: ['Draft', ''],
}

export function CLS_TONE(c: string): string {
  if (['Interested', 'Meeting Requested', 'More Information Requested'].includes(c)) return 'ok'
  if (['Unsubscribe', 'Not Interested', 'Delivery Failure'].includes(c)) return 'bad'
  if (['Pricing Objection', 'Timing Objection', 'Wrong Contact'].includes(c)) return 'warn'
  return ''
}

/** Activity type -> [icon, label]. */
export const AIC: Record<string, [string, string]> = {
  email_out: ['mail', 'Email sent'],
  email_in: ['reply', 'Email received'],
  email_open: ['eye', 'Email opened'],
  link_click: ['link', 'Link clicked'],
  call: ['phone', 'Call'],
  linkedin_conn: ['li', 'LinkedIn connection'],
  linkedin_msg: ['li', 'LinkedIn message'],
  linkedin_reply: ['li', 'LinkedIn response'],
  meeting: ['users', 'Meeting held'],
  meeting_booked: ['cal', 'Meeting booked'],
  note: ['note', 'Note'],
  stage: ['kanban', 'Stage change'],
  task_done: ['checksq', 'Task completed'],
  enriched: ['zap', 'Enrichment'],
  verified: ['check', 'Email verified'],
  seq_enrolled: ['send', 'Sequence enrolled'],
  seq_paused: ['pause', 'Sequence update'],
  seq_done: ['check', 'Sequence completed'],
  ai_accepted: ['spark', 'AI action'],
  research: ['spark', 'AI research'],
  won: ['star', 'Deal won'],
  lost: ['x', 'Deal lost'],
  bounce: ['alert', 'Bounce'],
  suppressed: ['stop', 'Suppression'],
}

export const TOKENS = ['first_name', 'last_name', 'company_name', 'job_title', 'sender_first_name', 'sender_name', 'business_name', 'meeting_link']

/** Runs `fn` after `ms`, with a busy flag. Used for the simulated integrations. */
export function useSim(ms = 700): [boolean, (fn: () => void) => void] {
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return [
    busy,
    fn => {
      setBusy(true)
      timer.current = setTimeout(() => {
        setBusy(false)
        fn()
      }, ms)
    },
  ]
}

export function download(name: string, text: string, type = 'text/csv'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

/** Quotes any cell containing a comma, quote or newline. Cells starting with = + - @ are prefixed so spreadsheets do not run them as formulas. */
export function toCSV(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows
    .map(r =>
      r
        .map(x => {
          let s = String(x ?? '')
          if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\n')
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]'
const trapStack: symbol[] = []

/** Only the top-most overlay handles Esc and Tab. Focus moves in on open and is restored on close. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const id = Symbol('trap')
    trapStack.push(id)
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!el.contains(document.activeElement)) {
      const first = el.querySelector<HTMLElement>('.modal-b ' + FOCUSABLE.split(',').join(',.modal-b ')) ?? el.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? el).focus()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (trapStack[trapStack.length - 1] !== id) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(x => x.offsetParent !== null || x === document.activeElement)
      if (!items.length) {
        e.preventDefault()
        el.focus()
        return
      }
      const a = items[0]
      const z = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === a || document.activeElement === el)) {
        e.preventDefault()
        z.focus()
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault()
        a.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const at = trapStack.indexOf(id)
      if (at >= 0) trapStack.splice(at, 1)
      if (prev && document.contains(prev)) prev.focus()
    }
  }, [ref])
}
