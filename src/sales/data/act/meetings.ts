import { commit } from '../commit'
import { F } from '../F'
import { audit } from '../internals'
import { CANCEL_REASON_MAX } from '../meetings'
import { idx, removeRow } from '../store'

/**
 * Meeting lifecycle actions (contract: "Meeting lifecycle and activity voiding"). None of them writes an activity: the
 * booking stays a booking, and a held meeting is counted from its 'meeting' activity only while it stays completed
 * (data/meetings.ts heldNoLonger). cancelledBy is server-set, so the browser never writes it.
 */

export type MeetingActResult = { ok: true } | { ok: false; reason: 'missing' | 'reason_required' | 'reason_too_long' | 'not_upcoming' | 'bad_start' | 'same_start' }

/** Cancel an upcoming meeting with a reason (1..300 characters). */
export function cancelMeeting(id: string, reason: string): MeetingActResult {
  const m = idx.meetings.get(id)
  if (!m) return { ok: false, reason: 'missing' }
  const r = reason.trim()
  if (!r) return { ok: false, reason: 'reason_required' }
  if (r.length > CANCEL_REASON_MAX) return { ok: false, reason: 'reason_too_long' }
  if (m.status === 'cancelled') return { ok: false, reason: 'not_upcoming' }
  m.status = 'cancelled'
  m.cancelledAt = F.nowIso()
  m.cancelReason = r
  audit('Meeting cancelled', m.title)
  commit()
  return { ok: true }
}

/** The contact did not turn up. Only an upcoming meeting (usually an overdue one) can be marked no-show. */
export function markMeetingNoShow(id: string): MeetingActResult {
  const m = idx.meetings.get(id)
  if (!m) return { ok: false, reason: 'missing' }
  if (m.status !== 'upcoming') return { ok: false, reason: 'not_upcoming' }
  m.status = 'no-show'
  audit('Meeting marked no-show', m.title)
  commit()
  return { ok: true }
}

/** Move an upcoming meeting to a new start (YYYY-MM-DDTHH:MM). It stays upcoming; the old start is kept in rescheduledFrom. */
export function rescheduleMeeting(id: string, start: string): MeetingActResult {
  const m = idx.meetings.get(id)
  if (!m) return { ok: false, reason: 'missing' }
  if (m.status !== 'upcoming') return { ok: false, reason: 'not_upcoming' }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start)) return { ok: false, reason: 'bad_start' }
  if (start === m.start.slice(0, 16)) return { ok: false, reason: 'same_start' }
  m.rescheduledFrom = [...(m.rescheduledFrom ?? []), m.start]
  m.start = start
  audit('Meeting rescheduled', m.title)
  commit()
  return { ok: true }
}

/** Delete a meeting record (its owner or a manager+ of the business; the server enforces it). Its activities stay. */
export function deleteMeeting(id: string): MeetingActResult {
  const m = idx.meetings.get(id)
  if (!m) return { ok: false, reason: 'missing' }
  removeRow('meetings', id)
  audit('Record deleted', `Meeting: ${m.title}`)
  commit()
  return { ok: true }
}
