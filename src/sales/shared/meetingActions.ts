import { Act } from '../data/Act'
import { Q } from '../data/Q'
import type { Meeting } from '../data/types'
import type { MenuItem } from '../kit'
import { UI } from '../ui/store'

/** Meeting lifecycle actions behind the controls in shared/meetingUi.tsx. */

/** Who may change a meeting's status: anyone who can edit its business. */
export const canChangeMeeting = (m: Pick<Meeting, 'businessId'>): boolean => Q.canEdit(m.businessId)

/** Who may delete it: its owner or a manager+ of its business (the server enforces the same). */
export const canDeleteMeeting = (m: Pick<Meeting, 'businessId' | 'ownerId'>): boolean =>
  Q.canEdit(m.businessId) && (m.ownerId === Q.me().id || Q.canManage(m.businessId))

export function recordOutcome(m: Pick<Meeting, 'id'>): void {
  UI.open('logMeeting', { id: m.id, status: 'completed' })
}
export function openReschedule(m: Pick<Meeting, 'id'>): void {
  UI.open('rescheduleMeeting', { id: m.id })
}
export function openCancel(m: Pick<Meeting, 'id'>): void {
  UI.open('cancelMeeting', { id: m.id })
}
export function noShow(m: Pick<Meeting, 'id' | 'title'>): void {
  const r = Act.markMeetingNoShow(m.id)
  UI.toast(r.ok ? `Marked as no-show: ${m.title}` : 'Only an upcoming meeting can be marked no-show', r.ok ? undefined : 'bad')
}
export function askDelete(m: Pick<Meeting, 'id' | 'title'>, after?: () => void): void {
  UI.confirm({
    title: 'Delete meeting?',
    body: `“${m.title}” is removed from SalesOS for everyone. Activity already logged for it stays in the timeline. This cannot be undone.`,
    confirm: 'Delete meeting',
    danger: true,
    onConfirm: () => {
      const r = Act.deleteMeeting(m.id)
      UI.toast(r.ok ? 'Meeting deleted' : 'This meeting no longer exists', r.ok ? undefined : 'bad')
      if (r.ok) after?.()
    },
  })
}

/** The actions a meeting offers in its current state, for a Menu. */
export function meetingMenuItems(m: Meeting, opts: { notes?: boolean } = {}): MenuItem[] {
  const edit = canChangeMeeting(m)
  const up = m.status === 'upcoming'
  return [
    edit && up && { label: 'Record outcome', icon: 'check', onClick: () => recordOutcome(m) },
    edit && up && { label: 'Reschedule', icon: 'cal', onClick: () => openReschedule(m) },
    edit && up && { label: 'Mark no-show', icon: 'stop', onClick: () => noShow(m) },
    edit && up && { label: 'Cancel meeting', icon: 'x', onClick: () => openCancel(m) },
    opts.notes !== false && { label: up ? 'Edit meeting' : 'Open meeting notes', icon: 'edit', onClick: () => UI.open('logMeeting', { id: m.id }) },
    canDeleteMeeting(m) && '-',
    canDeleteMeeting(m) && { label: 'Delete meeting', icon: 'trash', onClick: () => askDelete(m) },
  ]
}
