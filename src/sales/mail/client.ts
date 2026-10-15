import { useEffect, useSyncExternalStore } from 'react'
import { mailStatusApi } from '../api/mailboxes'
import { S } from '../data/store'

/**
 * Is real Gmail set up on the server? Kept for the session, per signed-in person. While it is not (or the question fails), the
 * Integrations page keeps its simulated mailboxes and says so, and no page claims mail is real.
 */
export type MailState = { s: 'loading' } | { s: 'live' } | { s: 'off'; reason?: string }

let cached: { user: string; state: MailState } | undefined
let inflight: Promise<void> | null = null
let version = 0
const subs = new Set<() => void>()
const emit = (): void => { version++; subs.forEach(f => f()) }
const subscribe = (f: () => void): (() => void) => { subs.add(f); return () => { subs.delete(f) } }

async function load(user: string): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await mailStatusApi()
      cached = { user, state: r.configured ? { s: 'live' } : { s: 'off', reason: r.reason } }
    } catch {
      cached = { user, state: { s: 'off' } }
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

export function clearMailState(): void { cached = undefined; inflight = null; emit() }

/** Where Google sends the browser back to, read once: ?mailbox=connected|error&reason=… */
export interface MailReturn { ok: boolean; reason?: string }
export function readMailReturn(search: string): MailReturn | null {
  const q = new URLSearchParams(search)
  const m = q.get('mailbox')
  if (m !== 'connected' && m !== 'error') return null
  return { ok: m === 'connected', reason: q.get('reason') ?? undefined }
}

const REASONS: Record<string, string> = {
  denied: 'Google sign-in was cancelled. Nothing was connected.',
  'wrong-account': 'That Google account is not this mailbox’s address, so it was not connected. Sign in as the mailbox’s own account.',
  'already-connected': 'That Google account is already connected to another mailbox.',
  'not-allowed': 'You are not allowed to connect this mailbox.',
  'no-mailbox': 'That mailbox no longer exists.',
  'missing-scope': 'Google did not give read access. Connect again and allow “Read your email”.',
  'no-refresh-token': 'Google did not return a lasting connection. Remove SalesOS under your Google account’s connected apps, then connect again.',
  'bad-state': 'The sign-in link expired. Press Connect again.',
  'not-configured': 'Mailbox connections are not set up on the server.',
}
export const mailReturnMessage = (r: MailReturn): string => (r.ok ? 'Mailbox connected. Mail from your contacts will appear in the Inbox shortly.' : REASONS[r.reason ?? ''] ?? 'The mailbox could not be connected. Try again.')
