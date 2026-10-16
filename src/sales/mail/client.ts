import { useEffect, useSyncExternalStore } from 'react'
import { mailStatusApi } from '../api/mailboxes'
import { S } from '../data/store'

/**
 * Is real Gmail set up on the server? Kept for the session, per signed-in person. While it is not, the Integrations page keeps its
 * simulated mailboxes and says so, and no page claims mail is real. When the question itself fails the answer is 'error', never 'off':
 * a network blip must not turn a live inbox into a simulated one (simulated sends would then be written for real conversations), so
 * nothing sends while it is 'error', and it is asked again with a growing delay until it is answered.
 */
export type MailState = { s: 'loading' } | { s: 'live' } | { s: 'off'; reason?: string } | { s: 'error' }

let cached: { user: string; state: MailState } | undefined
let inflight: Promise<void> | null = null
let retry: ReturnType<typeof setTimeout> | null = null
let failures = 0
let version = 0
const subs = new Set<() => void>()
const emit = (): void => { version++; subs.forEach(f => f()) }
const subscribe = (f: () => void): (() => void) => { subs.add(f); return () => { subs.delete(f) } }

async function load(user: string): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await mailStatusApi()
      failures = 0
      cached = { user, state: r.configured ? { s: 'live' } : { s: 'off', reason: r.reason } }
    } catch {
      failures++
      cached = { user, state: { s: 'error' } }
      if (retry) clearTimeout(retry)
      retry = setTimeout(() => { retry = null; if (cached?.user === user && cached.state.s === 'error') void load(user) }, Math.min(60000, 2000 * 2 ** (failures - 1)))
    } finally {
      inflight = null
      emit()
    }
  })()
  return inflight
}

export function useMailState(): MailState {
  useSyncExternalStore(subscribe, () => version)
  const user = S.session.userId
  const state: MailState = cached && cached.user === user ? cached.state : { s: 'loading' }
  const idle = state.s === 'loading'
  useEffect(() => { if (idle) void load(user) }, [idle, user])
  return state
}

/** Ask again now (a Retry button). */
export function recheckMailState(): void { void load(S.session.userId) }

/** A send may go ahead only once the server has said which kind of mail this is. */
export const mailDecided = (s: MailState['s']): boolean => s === 'live' || s === 'off'

export function clearMailState(): void {
  cached = undefined
  inflight = null
  failures = 0
  if (retry) clearTimeout(retry)
  retry = null
  emit()
}

/** Where Google sends the browser back to, read once: ?mailbox=connected|error&reason=… */
export interface MailReturn { ok: boolean; reason?: string; sending?: boolean }
export function readMailReturn(search: string): MailReturn | null {
  const q = new URLSearchParams(search)
  const m = q.get('mailbox')
  if (m !== 'connected' && m !== 'error') return null
  return { ok: m === 'connected', reason: q.get('reason') ?? undefined, ...(q.get('sending') === '1' ? { sending: true } : {}) }
}

const REASONS: Record<string, string> = {
  denied: 'Google sign-in was cancelled. Nothing was connected.',
  'wrong-account': 'That Google account is not this mailbox’s address, so it was not connected. Sign in as the mailbox’s own account.',
  'already-connected': 'That Google account is already connected to another mailbox.',
  'not-allowed': 'You are not allowed to connect this mailbox.',
  'no-mailbox': 'That mailbox no longer exists.',
  'missing-send-scope': 'Google did not allow sending, so sending stays off. Turn it on again and allow “Send email on your behalf”.',
  'missing-scope': 'Google did not give read access. Connect again and allow “Read your email”.',
  'no-refresh-token': 'Google did not return a lasting connection. Remove SalesOS under your Google account’s connected apps, then connect again.',
  'bad-state': 'The sign-in link expired. Press Connect again.',
  'not-configured': 'Mailbox connections are not set up on the server.',
}
export const mailReturnMessage = (r: MailReturn): string =>
  r.ok ? (r.sending ? 'Sending is on for this mailbox. Use Compose or Reply in the Inbox.' : 'Mailbox connected. Mail from your contacts will appear in the Inbox shortly.') : REASONS[r.reason ?? ''] ?? 'The mailbox could not be connected. Try again.'
