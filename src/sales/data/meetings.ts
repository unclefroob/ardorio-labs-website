import { idx } from './store'
import type { Activity, Meeting } from './types'

/**
 * Meeting lifecycle (contract: "Meeting lifecycle and activity voiding").
 *
 * A meeting is 'upcoming', 'completed', 'cancelled' or 'no-show'. Only an upcoming meeting whose start is still ahead
 * counts as upcoming anywhere (KPIs, My Day, reminders). An upcoming meeting whose start has passed is overdue: it
 * counts nowhere until someone records what happened. Cancelled and no-show meetings never count as upcoming or held.
 *
 * Booked vs held: a 'meeting_booked' activity keeps counting as a booking even when the meeting is later cancelled or
 * missed (the booking did happen); only voiding that activity removes it. A 'meeting' (held) activity counts only
 * while its meeting is still completed.
 */
export const MEETING_STATUSES = ['upcoming', 'completed', 'cancelled', 'no-show'] as const
export type MeetingStatus = typeof MEETING_STATUSES[number]

export const MEETING_STATUS_LABEL: Record<string, string> = { upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled', 'no-show': 'No-show' }
/** Chip tone per status. The label is always shown too, so the colour never carries the meaning alone. */
export const MEETING_STATUS_TONE: Record<string, string | undefined> = { upcoming: 'info', completed: 'ok', cancelled: undefined, 'no-show': 'warn' }

export const CANCEL_REASON_MAX = 300

const minute = (s: string): string => s.slice(0, 16)

/** Upcoming and still ahead of `clock` (org wall clock, F.nowIso()). */
export const isAhead = (m: Pick<Meeting, 'status' | 'start'>, clock: string): boolean => m.status === 'upcoming' && minute(m.start) > minute(clock)

/** Still marked upcoming but its start has passed: someone needs to say what happened. */
export const isOverdue = (m: Pick<Meeting, 'status' | 'start'>, clock: string): boolean => m.status === 'upcoming' && minute(m.start) <= minute(clock)

/** A held-meeting activity whose meeting is no longer completed (cancelled, no-show or set back to upcoming). */
export function heldNoLonger(a: Pick<Activity, 'type' | 'meetingId'>): boolean {
  if (a.type !== 'meeting' || !a.meetingId) return false
  const m = idx.meetings.get(a.meetingId)
  return !!m && m.status !== 'completed'
}

/** The statuses the meeting form offers: a new meeting is booked or logged; an existing one may also be closed out. */
export function statusOptions(existing: Pick<Meeting, 'status'> | undefined): MeetingStatus[] {
  if (!existing) return ['upcoming', 'completed']
  // A cancelled meeting stays cancelled: book a new one instead of reviving it.
  if (existing.status === 'cancelled') return ['cancelled']
  return ['upcoming', 'completed', 'cancelled', 'no-show']
}
