import { S } from '../data/store'
import type { Enrolment, Message, Sequence } from '../data/types'

export interface SeqStats {
  en: Enrolment[]
  enrolled: number
  active: number
  completed: number
  sent: number
  replies: number
  positive: number
  meetings: number
  unsub: number
  bounced: number
  /** Open email tasks: drafted by the server, waiting for a rep to send them. */
  emailsToSend: number
  opens: number
  tasksDone: number
  tasks: number
  msgs: Message[]
}

const POSITIVE = ['Interested', 'Meeting Requested', 'More Information Requested']

export function seqStats(s: Sequence): SeqStats {
  const en = S.enrolments.filter(e => e.seqId === s.id)
  const ids = new Set(en.map(e => e.id))
  const msgs = S.messages.filter(m => m.enrolmentId != null && ids.has(m.enrolmentId))
  const ths = S.threads.filter(t => t.seqId === s.id)
  const rep = ths.filter(t => S.messages.some(m => m.threadId === t.id && m.dir === 'in' && !/mailer-daemon/.test(m.from)))
  const pos = rep.filter(t => POSITIVE.includes(t.classification?.cat ?? ''))
  const cids = new Set(en.map(e => e.contactId))
  const meet =
    S.activities.filter(a => a.type === 'meeting_booked' && a.contactId != null && cids.has(a.contactId) && en.some(e => e.contactId === a.contactId && a.ts >= e.startedAt)).length +
    en.filter(e => e.reason === 'Meeting booked').length
  const tasks = S.tasks.filter(t => t.seqId === s.id)
  return {
    en,
    enrolled: en.length,
    active: en.filter(e => ['active', 'awaiting_approval', 'awaiting_task'].includes(e.status)).length,
    completed: en.filter(e => e.status === 'completed').length,
    sent: msgs.filter(m => m.status === 'sent').length,
    replies: rep.length,
    positive: pos.length,
    meetings: meet,
    unsub: en.filter(e => e.status === 'unsubscribed').length,
    bounced: en.filter(e => e.status === 'bounced').length,
    emailsToSend: tasks.filter(t => t.kind === 'email' && t.status !== 'Completed' && t.status !== 'Cancelled').length,
    opens: S.activities.filter(a => a.type === 'email_open' && a.seqId === s.id).length,
    tasksDone: tasks.filter(t => t.status === 'Completed').length,
    tasks: tasks.length,
    msgs,
  }
}
