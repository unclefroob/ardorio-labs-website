import { S } from './store'
import type { Activity, Message, Thread } from './types'
import { isVoided } from './voided'

/**
 * Simulated mail.
 *
 * SalesOS has no real mail send or inbound sync yet. The composer and Inbox reply (`sendEmail`) and the
 * "Simulate reply" demo control (`simulateReply`) only write records, so those records carry
 * `simulated: true`: the message, the thread they create, and the `email_out` / `email_in` activity.
 * The demo tracking events (`simEvent`) carry it on their activity too, and a demo "meeting booked" that ends an
 * enrolment marks the enrolment `reasonSimulated: true`, so its "Meeting booked" exit is not counted either. A message the rep sent from their
 * own mail client and marked as sent (`markEmailSent`) is real and keeps the existing `manual: true` flag.
 *
 * Simulated records are shown with a Simulated chip and never count in Goals, Reports, the dashboard,
 * sequence stats or the engagement score.
 *
 * Records written before the flag existed are identified like this:
 * - an outbound message with status 'sent' and no `manual` flag can only have come from `sendEmail`;
 * - every inbound message so far came from `simulateReply` (nothing syncs real mail);
 * - an `email_out` activity whose description ends in "(simulated)" came from `sendEmail`;
 * - every `email_in` activity so far came from `simulateReply`;
 * - an `email_open` / `link_click` activity whose subject says "simulated" came from `simEvent`.
 * A legacy demo "meeting booked via scheduling link" cannot be told apart from a real one, so it still counts.
 *
 * When real mail sync lands it must write `simulated: false` on what it records, so the legacy rules
 * above stop applying to real mail.
 */

const UNSENT = new Set(['draft', 'pending', 'discarded', 'scheduled'])

/** Was this message never really sent or received? Drafts and queued messages are never "simulated sends". */
export function isSimMsg(m: Message): boolean {
  if (UNSENT.has(m.status)) return false
  if (m.simulated === true) return true
  if (m.simulated === false || m.manual) return false
  if (m.dir === 'in') return true
  return m.status === 'sent'
}

/** Was this activity recorded by a simulated path (no real email, reply or tracking event behind it)? */
export function isSimAct(a: Activity): boolean {
  if (a.simulated === true) return true
  if (a.simulated === false || a.manual) return false
  if (a.type === 'email_out') return /\(simulated\)\s*$/.test(a.desc ?? '')
  if (a.type === 'email_in') return true
  if (a.type === 'email_open' || a.type === 'link_click') return /simulated/i.test(a.subject ?? '')
  return false
}

/**
 * Activities that really happened: not simulated, and not voided as logged in error (data/voided.ts). Use it for
 * every count, goal, report and score.
 */
export const realActs = <T extends Activity>(acts: readonly T[]): T[] => acts.filter(a => !isSimAct(a) && !isVoided(a))

export type SimLevel = 'all' | 'some' | null

/**
 * How much of a thread is simulated: 'all' when every sent or received message is simulated (or the
 * thread was created by a simulated path and has nothing sent yet), 'some' when real and simulated mail
 * are mixed, null when nothing in it is simulated.
 */
export function simThread(t: Thread, msgs: readonly Message[] = S.messages.filter(m => m.threadId === t.id)): SimLevel {
  const done = msgs.filter(m => !UNSENT.has(m.status))
  const sim = done.filter(isSimMsg).length
  if (!done.length) return t.simulated === true ? 'all' : null
  if (sim === done.length) return 'all'
  return sim ? 'some' : null
}

/** Did the thread's latest inbound message come from a simulated reply? Its classification is then simulated too. */
export function simReplied(t: Thread, msgs: readonly Message[] = S.messages.filter(m => m.threadId === t.id)): boolean {
  const last = msgs.filter(m => m.dir === 'in' && !UNSENT.has(m.status)).sort((a, b) => a.ts.localeCompare(b.ts)).pop()
  return !!last && isSimMsg(last)
}

export const SIM_MAIL_NOTE = 'No real email is sent or received yet. Simulated mail does not count in goals or reports.'
