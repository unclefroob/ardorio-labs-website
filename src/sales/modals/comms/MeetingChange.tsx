import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { CANCEL_REASON_MAX } from '../../data/meetings'
import { Q } from '../../data/Q'
import type { Meeting } from '../../data/types'
import { Btn, Fld, Inp, Modal, TA } from '../../kit'
import { UI } from '../../ui/store'
import { MissingModal, NoEditModal } from '../entities/guards'

/** Cancel a meeting with a reason (contract: cancelReason, plain text up to 300 characters). */
export function CancelMeeting({ id }: { id?: string }) {
  const m = id ? Q.meeting(id) : undefined
  if (!m) return <MissingModal title="Cancel meeting" what="Meeting" />
  if (!Q.canEdit(m.businessId)) return <NoEditModal title="Cancel meeting" what="cancel meetings" />
  return <CancelForm m={m} />
}

function CancelForm({ m }: { m: Meeting }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const left = CANCEL_REASON_MAX - reason.trim().length
  const save = (): void => {
    const r = Act.cancelMeeting(m.id, reason)
    if (r.ok) {
      UI.close()
      UI.toast(`Meeting cancelled: ${m.title}`)
      return
    }
    setErr(r.reason === 'reason_required' ? 'Say why the meeting was cancelled.'
      : r.reason === 'reason_too_long' ? `Keep the reason to ${CANCEL_REASON_MAX} characters.`
      : r.reason === 'not_upcoming' ? 'Only an upcoming meeting can be cancelled.' : 'This meeting no longer exists.')
  }
  return (
    <Modal
      title="Cancel meeting"
      icon="x"
      width={480}
      sub={`${m.title} · ${F.dt(m.start)}`}
      footer={<><Btn onClick={UI.close}>Keep meeting</Btn><Btn kind="danger" icon="x" onClick={save}>Cancel meeting</Btn></>}
    >
      <div className="col gap12">
        <div className="muted sm">The meeting stops counting as upcoming. The booking stays in the activity log.</div>
        <Fld label="Reason" req err={err || undefined} hint={left < 50 ? `${Math.max(left, 0)} characters left` : undefined}>
          <TA value={reason} onChange={v => { setReason(v); setErr('') }} rows={3} maxLength={CANCEL_REASON_MAX} placeholder="e.g. Client asked to push it back to next quarter" />
        </Fld>
      </div>
    </Modal>
  )
}

/** Move an upcoming meeting to a new date and time. It stays upcoming and keeps its earlier start. */
export function RescheduleMeeting({ id }: { id?: string }) {
  const m = id ? Q.meeting(id) : undefined
  if (!m) return <MissingModal title="Reschedule meeting" what="Meeting" />
  if (!Q.canEdit(m.businessId)) return <NoEditModal title="Reschedule meeting" what="reschedule meetings" />
  return <RescheduleForm m={m} />
}

function RescheduleForm({ m }: { m: Meeting }) {
  const clock = F.nowIso()
  const [date, setDate] = useState('')
  const [time, setTime] = useState(m.start.slice(11, 16) || '10:00')
  const [err, setErr] = useState('')
  const save = (): void => {
    if (!date || !time) return setErr('Pick the new date and time.')
    const start = `${date}T${time}`
    if (start <= clock.slice(0, 16)) return setErr('Pick a date and time in the future.')
    const r = Act.rescheduleMeeting(m.id, start)
    if (r.ok) {
      UI.close()
      UI.toast(`Meeting moved to ${F.dt(start)}`)
      return
    }
    setErr(r.reason === 'same_start' ? 'That is the time it is already booked for.'
      : r.reason === 'not_upcoming' ? 'Only an upcoming meeting can be rescheduled.'
      : r.reason === 'bad_start' ? 'Pick the new date and time.' : 'This meeting no longer exists.')
  }
  return (
    <Modal
      title="Reschedule meeting"
      icon="cal"
      width={480}
      sub={`${m.title} · now ${F.dt(m.start)}`}
      footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" icon="cal" onClick={save}>Reschedule</Btn></>}
    >
      <div className="col gap12">
        <div className="grid g2">
          <Fld label="New date" req err={err || undefined}><Inp type="date" value={date} min={clock.slice(0, 10)} onChange={v => { setDate(v); setErr('') }} /></Fld>
          <Fld label="Time" req><Inp type="time" value={time} onChange={v => { setTime(v); setErr('') }} /></Fld>
        </div>
        <div className="faint sm">It stays upcoming. The original time is kept on the meeting.</div>
      </div>
    </Modal>
  )
}
