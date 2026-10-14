import { useState } from 'react'
import { Act, type BookedMeeting } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import { isVoided } from '../../data/voided'
import type { BusinessId, Contact, Task } from '../../data/types'
import { Btn, Ck, Fld, Inp, TA } from '../../kit/basic'
import { Icon } from '../../kit/Icon'
import { Modal } from '../../kit/overlay'
import { OUTCOMES } from '../../shared/constants'
import { CoSel, CtSel, useF } from '../../shared/forms'
import { UI } from '../../ui/store'
import { MissingModal, NoEditModal } from './guards'

export interface CallOutcomeProps { taskId?: string; contactId?: string; companyId?: string; dealId?: string; businessId?: BusinessId }

interface CallDraft {
  outcome: string
  notes: string
  fu: boolean
  fuTitle: string
  fuDate: string
  deal: boolean
  contactId: string
  companyId: string
  /** 'Meeting Booked' only: when the meeting is. Required, so every booked meeting is a dated Meeting record. */
  mtDate: string
  mtTime: string
  mtMins: string
}

const FOLLOW_UP_OUTCOMES: readonly string[] = ['Follow-up Required', 'Interested', 'Meeting Booked', 'Voicemail Left', 'No Answer']

export function CallOutcome({ taskId, contactId, companyId, dealId, businessId }: CallOutcomeProps) {
  const t = Q.task(taskId)
  if (taskId && !t) return <MissingModal title="Complete call task" what="Task" />
  const ct = Q.contact(t ? t.contactId : contactId)
  const b = t ? t.businessId : businessId ?? (ct ? Q.primaryBiz(ct) : undefined) ?? Q.defaultBiz()
  if (!b) return <NoEditModal title="Log call" what="log calls" />
  return <CallForm t={t} ct={ct} b={b} companyId={companyId} dealId={dealId} />
}

function CallForm({ t, ct, b, companyId, dealId }: { t?: Task; ct?: Contact; b: BusinessId; companyId?: string; dealId?: string }) {
  const [f, set] = useF<CallDraft>({
    outcome: 'Connected', notes: '', fu: false, fuTitle: 'Follow up with ' + (ct?.firstName ?? 'contact'),
    fuDate: F.addDays(F.nowIso(), 2).slice(0, 10), deal: false, contactId: ct?.id ?? '', companyId: ct?.companyId ?? companyId ?? '',
    mtDate: '', mtTime: '10:00', mtMins: '30',
  })
  const [mtErr, setMtErr] = useState('')
  const booked = f.outcome === 'Meeting Booked'
  const clock = F.nowIso()
  const knownDeal = dealId ?? t?.dealId ?? null
  const last = ct ? S.activities.filter(a => a.contactId === ct.id && Q.actVisible(a) && !isVoided(a)).sort((a, c) => c.ts.localeCompare(a.ts))[0] : undefined

  const pick = (o: string): void => {
    set({
      outcome: o,
      fu: FOLLOW_UP_OUTCOMES.includes(o) || f.fu,
      deal: o === 'Interested' && !knownDeal ? true : f.deal,
      fuTitle: o === 'Meeting Booked' ? 'Prepare for meeting with ' + (ct?.firstName ?? 'contact')
        : o === 'Voicemail Left' || o === 'No Answer' ? 'Retry call — ' + (ct?.firstName ?? 'contact') : f.fuTitle,
    })
  }

  const save = (): void => {
    if (!UI.guard(b, 'Logging calls')) return
    if (!t && !f.contactId && !f.companyId) return UI.toast('Select who you called', 'bad')
    let meeting: BookedMeeting | undefined
    if (booked) {
      if (!f.mtDate || !f.mtTime) return setMtErr('Enter the date and time of the meeting you booked.')
      const start = f.mtDate + 'T' + f.mtTime
      if (start <= clock) return setMtErr('A booked meeting is in the future. Pick a later date or time.')
      meeting = { start, duration: parseInt(f.mtMins, 10) || 30 }
    }
    if (t) Act.completeTask(t.id, { outcome: f.outcome, notes: f.notes, meeting })
    else Act.logCall({ businessId: b, contactId: f.contactId || null, companyId: f.companyId || null, dealId: dealId ?? null, outcome: f.outcome, notes: f.notes, meeting })
    if (f.fu) {
      Act.createTask({
        title: f.fuTitle, type: f.outcome === 'Meeting Booked' ? 'Meeting Preparation' : 'Follow-up', businessId: b, assigneeId: Q.me().id,
        due: f.fuDate + 'T10:00', companyId: f.companyId || null, contactId: f.contactId || null, dealId: knownDeal, source: 'Call outcome',
      })
    }
    UI.close()
    UI.toast('Call logged: ' + f.outcome + (meeting ? ' · meeting added for ' + F.dt(meeting.start) : '') + (f.fu ? ' · follow-up created' : ''))
    if (f.deal) UI.open('newDeal', { companyId: f.companyId, contactIds: f.contactId ? [f.contactId] : [], businessId: b })
  }

  return (
    <Modal
      title={t ? 'Complete call task' : 'Log call'}
      icon="phone"
      sub={ct ? ct.name + ' · ' + (ct.phone || ct.mobile || 'no phone on file') : undefined}
      width={560}
      footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" onClick={save}>Save call</Btn></>}
    >
      <div className="col gap12">
        {!t && !ct && (
          <div className="grid g2">
            <Fld label="Company"><CoSel value={f.companyId} onChange={v => set({ companyId: v, contactId: '' })} /></Fld>
            <Fld label="Contact"><CtSel companyId={f.companyId} value={f.contactId} onChange={v => set('contactId', v)} /></Fld>
          </div>
        )}
        {t?.script && (
          <div className="ai card-b">
            <div className="ai-h"><Icon n="spark" s={13} />Suggested call script</div>
            <div className="sm" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{t.script}</div>
          </div>
        )}
        {last && <div className="faint sm">Last interaction: {last.subject} · {F.rel(last.ts)}</div>}
        <Fld label="Outcome">
          <div className="row wrap" style={{ gap: 6 }} role="group" aria-label="Call outcome">
            {OUTCOMES.map(o => <Btn key={o} size="sm" kind={f.outcome === o ? 'pri' : undefined} aria-pressed={f.outcome === o} onClick={() => pick(o)}>{o}</Btn>)}
          </div>
        </Fld>
        {booked && (
          <div className="grid g3">
            <Fld label="Meeting date" req err={mtErr || undefined}><Inp type="date" value={f.mtDate} min={clock.slice(0, 10)} onChange={v => { set({ mtDate: v, fuDate: v && v < f.fuDate ? v : f.fuDate }); setMtErr('') }} /></Fld>
            <Fld label="Time" req><Inp type="time" value={f.mtTime} onChange={v => { set('mtTime', v); setMtErr('') }} /></Fld>
            <Fld label="Mins"><Inp value={f.mtMins} onChange={v => set('mtMins', v)} inputMode="numeric" /></Fld>
          </div>
        )}
        {booked && <div className="faint xs" style={{ marginTop: -6 }}>The meeting is added as upcoming, so it shows in My Day, on the deal and in meeting reminders.</div>}
        <Fld label="Call notes"><TA value={f.notes} onChange={v => set('notes', v)} rows={3} placeholder="What was discussed, objections, next steps…" /></Fld>
        <Ck checked={f.fu} onChange={v => set('fu', v)}>Create a follow-up task</Ck>
        {f.fu && (
          <div className="grid g2">
            <Fld label="Follow-up"><Inp value={f.fuTitle} onChange={v => set('fuTitle', v)} /></Fld>
            <Fld label="Due"><Inp type="date" value={f.fuDate} onChange={v => set('fuDate', v)} /></Fld>
          </div>
        )}
        {!knownDeal && <Ck checked={f.deal} onChange={v => set('deal', v)}>Create a deal after saving</Ck>}
      </div>
    </Modal>
  )
}
