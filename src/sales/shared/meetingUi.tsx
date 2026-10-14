import { F } from '../data/F'
import { isOverdue, MEETING_STATUS_LABEL, MEETING_STATUS_TONE } from '../data/meetings'
import { Q } from '../data/Q'
import type { Meeting } from '../data/types'
import { Btn, Chip, Menu } from '../kit'
import { canChangeMeeting, meetingMenuItems, noShow, openCancel, openReschedule, recordOutcome } from './meetingActions'

/**
 * Meeting lifecycle controls shared by the meeting brief, the deal's Meetings card, My Day and Activities: status chip,
 * the "What happened?" prompt for an overdue meeting, and the actions menu (record outcome, reschedule, cancel,
 * no-show, delete).
 */

/** Status as words (never colour alone). An upcoming meeting whose start has passed reads "Outcome needed". */
export function MeetingStatusChip({ m, clock }: { m: Meeting; clock: string }) {
  if (isOverdue(m, clock)) return <Chip tone="warn" icon="alert">Outcome needed</Chip>
  return <Chip tone={MEETING_STATUS_TONE[m.status]}>{MEETING_STATUS_LABEL[m.status] ?? m.status}</Chip>
}

/** "Rescheduled from …" and "Cancelled by … : reason" lines, when there is anything to say. */
export function MeetingHistory({ m }: { m: Meeting }) {
  const from = m.rescheduledFrom ?? []
  return (
    <>
      {from.length > 0 && <div className="faint xs">Rescheduled from {F.dt(from[from.length - 1])}{from.length > 1 ? ` (moved ${from.length} times)` : ''}</div>}
      {m.status === 'cancelled' && (
        <div className="faint xs">
          Cancelled{m.cancelledAt ? ' ' + F.date(m.cancelledAt) : ''}{m.cancelledBy ? ' by ' + m.cancelledBy : ''}{m.cancelReason ? ': ' + m.cancelReason : ''}
        </div>
      )}
    </>
  )
}

export function MeetingMenu({ m, notes }: { m: Meeting; notes?: boolean }) {
  const items = meetingMenuItems(m, { notes }).filter(Boolean)
  if (!items.some(x => x && x !== '-')) return null
  return <Menu align="right" trigger={<Btn size="xs" kind="ghost" icon="more" aria-label={`Actions for ${m.title}`} />} items={items} />
}

/** The overdue prompt: the meeting's start has passed and it is still upcoming. */
export function OutcomePrompt({ m }: { m: Meeting }) {
  if (!canChangeMeeting(m)) return <div className="faint xs">Its start has passed. Someone who can edit {Q.biz(m.businessId)?.name ?? 'this business'} needs to record what happened.</div>
  return (
    <div className="row wrap" style={{ gap: 4, marginTop: 4 }} role="group" aria-label={`What happened at ${m.title}?`}>
      <span className="b xs">What happened?</span>
      <Btn size="xs" icon="check" onClick={() => recordOutcome(m)}>Completed</Btn>
      <Btn size="xs" icon="stop" onClick={() => noShow(m)}>No-show</Btn>
      <Btn size="xs" icon="x" onClick={() => openCancel(m)}>Cancelled</Btn>
      <Btn size="xs" icon="cal" onClick={() => openReschedule(m)}>Reschedule</Btn>
    </div>
  )
}
