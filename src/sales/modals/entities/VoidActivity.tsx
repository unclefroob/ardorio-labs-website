import { useState } from 'react'
import { Act } from '../../data/Act'
import { canVoidActivity } from '../../data/voidRules'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { idx, useStore } from '../../data/store'
import type { Activity } from '../../data/types'
import { isVoided, VOID_REASON_MAX } from '../../data/voided'
import { AIC, Btn, Empty, Fld, Modal, TA } from '../../kit'
import { UI } from '../../ui/store'
import { MissingModal } from './guards'

/** "Mark as a mistake": void an activity with a reason (contract: activity void). */
export function VoidActivity({ id }: { id?: string }) {
  useStore()
  const a = id ? idx.activities.get(id) : undefined
  if (!a) return <MissingModal title="Mark as a mistake" what="Activity" />
  if (isVoided(a)) {
    return (
      <Modal title="Mark as a mistake" footer={<Btn onClick={UI.close}>Close</Btn>}>
        <Empty icon="check" title="Already marked as a mistake" body={a.voidReason ? `Reason: ${a.voidReason}` : 'It no longer counts anywhere.'} />
      </Modal>
    )
  }
  if (!canVoidActivity(a)) {
    return (
      <Modal title="Mark as a mistake" footer={<Btn onClick={UI.close}>Close</Btn>}>
        <Empty icon="lock" title="Only its author or a manager" body={`Only the person who logged this activity, or a manager of ${Q.biz(a.businessId)?.name ?? 'its business'}, can mark it as a mistake.`} />
      </Modal>
    )
  }
  return <VoidForm a={a} />
}

function VoidForm({ a }: { a: Activity }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const left = VOID_REASON_MAX - reason.trim().length
  const label = AIC[a.type]?.[1] ?? a.type
  const save = (): void => {
    const r = Act.voidActivity(a.id, reason)
    if (r.ok) {
      UI.close()
      UI.toast('Marked as a mistake. It no longer counts.')
      return
    }
    setErr(r.reason === 'reason_required' ? 'Say what was wrong with it.'
      : r.reason === 'reason_too_long' ? `Keep the reason to ${VOID_REASON_MAX} characters.`
      : r.reason === 'already_voided' ? 'This activity is already marked as a mistake.'
      : r.reason === 'not_allowed' ? 'Only the person who logged it, or a manager, can do this.' : 'This activity no longer exists.')
  }
  return (
    <Modal
      title="Mark as a mistake"
      icon="x"
      width={480}
      sub={`${label} · ${Q.actVisible(a) ? (a.subject ?? '') : 'Private email'} · ${F.dt(a.ts)}`}
      footer={<><Btn onClick={UI.close}>Keep it</Btn><Btn kind="danger" icon="x" onClick={save}>Mark as a mistake</Btn></>}
    >
      <div className="col gap12">
        <div className="muted sm">
          Activity is never deleted. It stays in the timeline struck through with your reason, and stops counting in goals,
          reports, the dashboard and sequence stats. This can’t be undone.
        </div>
        <Fld label="Reason" req err={err || undefined} hint={left < 50 ? `${Math.max(left, 0)} characters left` : undefined}>
          <TA value={reason} onChange={v => { setReason(v); setErr('') }} rows={3} maxLength={VOID_REASON_MAX} placeholder="e.g. Logged against the wrong contact" />
        </Fld>
      </div>
    </Modal>
  )
}
