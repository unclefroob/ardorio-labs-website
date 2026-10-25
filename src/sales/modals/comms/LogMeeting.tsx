import { useState } from 'react'
import { localAi, meetingActions, type AiResult, type AiTag, type MeetingActionsWithSummary } from '../../ai/client'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { CANCEL_REASON_MAX, MEETING_STATUS_LABEL, statusOptions } from '../../data/meetings'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import { flushAll } from '../../data/sync'
import type { BusinessId, Meeting } from '../../data/types'
import { AiBadge, AiNotConfigured, Banner, Btn, Ck, Fld, Icon, Inp, Modal, Seg, Sel, Skel, TA } from '../../kit'
import { SECTIONS } from '../../shared/constants'
import { BizSel, CoSel, MultiCt, useF } from '../../shared/forms'
import { askDelete, canDeleteMeeting } from '../../shared/meetingActions'
import { MeetingHistory } from '../../shared/meetingUi'
import { tryMove } from '../../shared/moves'
import { UI } from '../../ui/store'
import { MissingModal, NoEditModal } from '../entities/guards'

interface MeetingForm {
  title: string
  date: string
  time: string
  duration: string
  businessId: BusinessId
  companyId: string
  participants: string[]
  dealId: string
  type: string
  status: string
  outcome: string
  cancelReason: string
  sections: Record<string, string>
  nextSteps: string
}
interface Props { id?: string; dealId?: string; companyId?: string; businessId?: BusinessId; contactIds?: string[]; status?: string }

const FALLBACK_TAG: AiTag = { source: 'fallback', model: null }
/** Outcomes offered for a completed meeting. No-show and Rescheduled are statuses now; an older record keeps its value. */
const OUTCOMES = ['Positive', 'Neutral', 'Negative']
const DAYS: ReadonlyArray<readonly [string, string]> = [['0', 'Today'], ['1', '+1 day'], ['2', '+2 days'], ['3', '+3 days'], ['5', '+5 days'], ['7', '+1 week']]

export function LogMeeting(p: Props) {
  const ex = p.id ? Q.meeting(p.id) : undefined
  if (p.id && !ex) return <MissingModal title="Edit meeting" what="Meeting" />
  const biz = ex?.businessId ?? (p.dealId ? Q.deal(p.dealId)?.businessId : undefined) ?? p.businessId ?? Q.defaultBiz()
  if (!biz || !Q.canEdit(biz)) return <NoEditModal title={ex ? 'Edit meeting' : 'Log meeting'} what="log meetings" />
  return <MeetingEditor p={p} ex={ex} biz={biz} />
}

function MeetingEditor({ p, ex, biz }: { p: Props; ex: Meeting | undefined; biz: BusinessId }) {
  const d0 = p.dealId ? Q.deal(p.dealId) : undefined
  const statuses = statusOptions(ex)
  // Opened as "Record outcome" (status 'completed') on an existing meeting: start from that status when it is offered.
  const exStatus = ex && p.status && p.status !== ex.status && (statuses as string[]).includes(p.status) ? p.status : ex?.status
  const [f, set] = useF<MeetingForm>(
    ex
      ? {
          title: ex.title, date: ex.start.slice(0, 10), time: ex.start.slice(11, 16), duration: String(ex.duration), businessId: ex.businessId,
          companyId: ex.companyId ?? '', participants: ex.participants || [], dealId: ex.dealId ?? '', type: ex.type, status: exStatus ?? ex.status,
          outcome: ex.outcome || (exStatus === 'completed' && ex.status !== 'completed' ? 'Positive' : ''), cancelReason: ex.cancelReason ?? '',
          sections: { summary: ex.summary, ...ex.sections }, nextSteps: ex.nextSteps || '',
        }
      : {
          title: d0 ? (Q.company(d0.companyId)?.name.split(' ')[0] ?? '') + ' — discovery meeting' : '', date: F.today(), time: '10:00', duration: '45', businessId: biz,
          companyId: d0?.companyId ?? p.companyId ?? '', participants: p.contactIds ?? d0?.contactIds.slice(0, 2) ?? [], dealId: p.dealId ?? '', type: 'Discovery',
          status: p.status ?? 'completed', outcome: 'Positive', cancelReason: '', sections: {}, nextSteps: '',
        },
  )
  const outcomes = f.outcome && !OUTCOMES.includes(f.outcome) ? [...OUTCOMES, f.outcome] : OUTCOMES
  const cancelling = f.status === 'cancelled' && ex?.status !== 'cancelled'
  // Changing the date or time of an upcoming meeting moves it: saveMeeting keeps the old start in its history.
  const moving = !!ex && (ex.status === 'upcoming' || f.status === 'upcoming') && f.date + 'T' + f.time !== ex.start.slice(0, 16)
  const [savedId, setSavedId] = useState<string | undefined>(ex?.id)
  const [res, setRes] = useState<AiResult<MeetingActionsWithSummary> | null>(null)
  const [actions, setActions] = useState<MeetingActionsWithSummary['actions']>([])
  const [upOn, setUpOn] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [stage, setStage] = useState('')
  const [openSec, setOpen] = useState(!!ex)
  const deal = f.dealId ? Q.deal(f.dealId) : undefined
  const deals = S.deals.filter(d => d.companyId === f.companyId && d.businessId === f.businessId && d.status === 'open' && d.archived !== true)
  const sec = (k: string, v: string): void => set('sections', { ...f.sections, [k]: v })
  const noCompanies = Q.companies().length === 0

  const persist = (): Meeting => {
    const { summary, ...rest } = f.sections
    const m = Act.saveMeeting({
      id: savedId, title: f.title.trim(), start: f.date + 'T' + f.time, duration: parseInt(f.duration, 10) || 30, businessId: f.businessId,
      companyId: f.companyId, participants: f.participants, dealId: f.dealId || null, type: f.type, status: f.status, outcome: f.outcome,
      summary: summary ?? '', sections: rest, nextSteps: f.nextSteps, ownerId: ex?.ownerId ?? Q.me().id,
      ...(cancelling ? { cancelReason: f.cancelReason.trim() } : {}),
    })
    setSavedId(m.id)
    return m
  }

  const gen = async (): Promise<void> => {
    if (!Object.values(f.sections).some(x => x && x.trim()) && !f.nextSteps.trim()) return UI.toast('Enter some notes first, then generate action items', 'bad')
    if (!f.title.trim() || !f.companyId) return UI.toast('Title and company are required', 'bad')
    setBusy(true)
    setErr('')
    try {
      const m = persist()
      const synced = await flushAll()
      const r: AiResult<MeetingActionsWithSummary> = synced ? await meetingActions(m) : { value: localAi.meetingActions(m), ai: FALLBACK_TAG }
      setRes(r)
      setActions(r.value.actions)
      setUpOn(Object.fromEntries(r.value.updates.map(u => [u.key, true])))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not generate action items')
    } finally {
      setBusy(false)
    }
  }

  const save = (): void => {
    if (!f.title.trim() || !f.companyId) return UI.toast('Title and company are required', 'bad')
    if (cancelling && !f.cancelReason.trim()) return UI.toast('Say why the meeting was cancelled', 'bad')
    persist()
    let n = 0
    if (res) {
      for (const a of actions.filter(x => x.on)) {
        Act.createTask({
          title: a.title, type: a.type, businessId: f.businessId, assigneeId: a.assigneeId, due: F.addDays(F.today() + 'T10:00', Number(a.days) || 1),
          companyId: f.companyId, contactId: f.participants[0] ?? null, dealId: f.dealId || null, source: 'Meeting action item: ' + f.title,
        })
        n++
      }
      if (deal) {
        const fields: Record<string, unknown> = {}
        const pt: { value?: number } = {}
        for (const u of res.value.updates.filter(x => upOn[x.key])) {
          if (u.key.startsWith('f.')) fields[u.key.slice(2)] = u.value
          else if (u.key === 'value') pt.value = u.value
        }
        if (Object.keys(fields).length || pt.value) Act.updateDeal(deal.id, { ...pt, fields })
      }
    }
    // Close this modal first: tryMove may open its own (missing required fields, or Reopen deal?), and closing after
    // it would pop that one instead, leaving Log meeting open for a second Save that creates the tasks again.
    UI.close()
    if (stage && deal) tryMove(deal.id, stage)
    const email = res?.value.email
    UI.toast('Meeting saved' + (n ? ' · ' + n + ' tasks created' : ''), undefined, email ? {
      label: 'Open follow-up email',
      fn: () => UI.open('compose', { contactId: f.participants[0], dealId: f.dealId, businessId: f.businessId, subject: email.subject, body: email.body, ai: res.ai }),
    } : undefined)
  }

  const setAct = (i: number, patch: Partial<MeetingActionsWithSummary['actions'][number]>): void => setActions(actions.map((a, j) => (j === i ? { ...a, ...patch } : a)))

  return (
    <Modal
      title={ex ? 'Edit meeting' : 'Log meeting'}
      icon="users"
      width={760}
      sub="Manually recorded. No recording or transcription."
      footer={
        <>
          <Btn onClick={UI.close}>Cancel</Btn>
          {ex && savedId && canDeleteMeeting(ex) && <Btn kind="danger" icon="trash" onClick={() => askDelete(ex, UI.close)}>Delete</Btn>}
          <span className="sp" />
          {f.status === 'completed' && <AiNotConfigured />}
          {f.status === 'completed' && (
            <Btn icon="spark" onClick={() => void gen()} disabled={busy}>{busy ? 'Analysing notes…' : res ? 'Regenerate action items' : 'Generate action items'}</Btn>
          )}
          <Btn kind="pri" onClick={save} disabled={busy}>Save meeting</Btn>
        </>
      }
    >
      {ex && (ex.status === 'cancelled' || (ex.rescheduledFrom ?? []).length > 0) && <div style={{ marginBottom: 10 }}><MeetingHistory m={ex} /></div>}
      {noCompanies && <Banner tone="warn" action={<Btn size="sm" onClick={() => UI.open('newCompany')}>Add company</Btn>}>There are no companies yet. A meeting needs a company, so add one first.</Banner>}
      <div className="grid g3">
        <Fld label="Meeting title" req style={{ gridColumn: '1/-1' }}><Inp value={f.title} onChange={v => set('title', v)} /></Fld>
        <Fld label="Status" hint={ex?.status === 'completed' ? 'A held meeting stays completed. If it did not happen, mark its activity as a mistake.' : undefined}><Seg label="Status" value={f.status} onChange={v => set('status', v)} opts={statuses.map(k => [k, MEETING_STATUS_LABEL[k]] as const)} /></Fld>
        <Fld label="Date" hint={moving ? 'Saving moves the meeting. The earlier time stays in its history.' : undefined}><Inp type="date" value={f.date} onChange={v => set('date', v)} /></Fld>
        <div className="row" style={{ gap: 8 }}>
          <Fld label="Time" style={{ flex: 1 }}><Inp type="time" value={f.time} onChange={v => set('time', v)} /></Fld>
          <Fld label="Mins" style={{ width: 70 }}><Inp value={f.duration} onChange={v => set('duration', v)} inputMode="numeric" /></Fld>
        </div>
        <Fld label="Business"><BizSel value={f.businessId} onChange={v => set({ businessId: v as BusinessId, dealId: '' })} /></Fld>
        <Fld label="Company" req><CoSel value={f.companyId} onChange={v => set({ companyId: v, participants: [], dealId: '' })} /></Fld>
        <Fld label="Deal" hint={f.companyId && !deals.length ? 'No open deals at this company' : undefined}>
          <Sel value={f.dealId} onChange={v => set('dealId', v)} placeholder="—" options={deals.map(d => [d.id, d.title] as const)} />
        </Fld>
        <Fld label="Type"><Sel value={f.type} onChange={v => set('type', v)} options={['Discovery', 'Demo', 'Workshop', 'Pilot review', 'Security review', 'Commercial', 'Check-in']} /></Fld>
        {f.status === 'completed' && <Fld label="Outcome"><Sel value={f.outcome} onChange={v => set('outcome', v)} options={outcomes} /></Fld>}
        {cancelling && (
          <Fld label="Reason for cancelling" req style={{ gridColumn: '1/-1' }}>
            <TA value={f.cancelReason} onChange={v => set('cancelReason', v)} rows={2} maxLength={CANCEL_REASON_MAX} />
          </Fld>
        )}
        <Fld label="Participants" style={{ gridColumn: '1/-1' }}><MultiCt companyId={f.companyId} value={f.participants} onChange={v => set('participants', v)} /></Fld>
      </div>
      {f.status === 'completed' && (
        <div style={{ marginTop: 14 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <b>Structured notes</b>
            <span className="faint sm">Fill in any sections. None are required.</span>
            <span className="sp" />
            <Btn size="xs" kind="ghost" onClick={() => setOpen(!openSec)}>{openSec ? 'Collapse' : 'Show all sections'}</Btn>
          </div>
          <div className="grid g2">
            {SECTIONS.filter((_, i) => openSec || i < 2).map(([k, l]) => (
              <Fld key={k} label={l} style={k === 'summary' ? { gridColumn: '1/-1' } : undefined}>
                <TA value={f.sections[k] ?? ''} onChange={v => sec(k, v)} rows={k === 'summary' ? 3 : 2} />
              </Fld>
            ))}
            <Fld label="Next steps" style={{ gridColumn: '1/-1' }}>
              <TA value={f.nextSteps} onChange={v => set('nextSteps', v)} rows={2} placeholder="e.g. Send pilot outline. Book planning session with careers team. Confirm 280 students." />
            </Fld>
          </div>
        </div>
      )}
      {busy && <div className="ai card-b" style={{ marginTop: 14 }} aria-busy="true"><Skel rows={3} /></div>}
      {err && !busy && (
        <div style={{ marginTop: 14 }}>
          <Banner tone="bad" action={<Btn size="sm" onClick={() => void gen()}>Retry</Btn>}>Could not generate action items. {err} Your notes are saved; you can add tasks yourself.</Banner>
        </div>
      )}
      {res && !busy && (
        <div className="ai card-b" style={{ marginTop: 14 }}>
          <div className="ai-h"><Icon n="spark" s={14} />Review suggestions before anything is created<span className="sp" /><AiBadge tag={res.ai} /></div>
          {res.value.summary && !f.sections.summary?.trim() && (
            <div className="row" style={{ marginTop: 10 }}>
              <span className="sm muted" style={{ flex: 1 }}>{res.value.summary}</span>
              <Btn size="xs" onClick={() => sec('summary', res.value.summary ?? '')}>Use as summary</Btn>
            </div>
          )}
          <div className="b sm" style={{ marginTop: 10 }}>Action items</div>
          {actions.length ? (
            <div className="col" style={{ gap: 6, marginTop: 6 }}>
              {actions.map((a, i) => (
                <div key={i} className="row" style={{ gap: 6 }}>
                  <Ck checked={a.on} onChange={v => setAct(i, { on: v })} label={`Create task: ${a.title}`} />
                  <Inp className="sm" aria-label="Task title" value={a.title} onChange={v => setAct(i, { title: v })} />
                  <Sel className="sm" style={{ width: 130 }} aria-label="Assignee" value={a.assigneeId} onChange={v => setAct(i, { assigneeId: v })} options={Q.usersIn(f.businessId).map(u => [u.id, u.name] as const)} />
                  <Sel className="sm" style={{ width: 90 }} aria-label="Due" value={String(a.days)} onChange={v => setAct(i, { days: Number(v) })} options={DAYS} />
                </div>
              ))}
            </div>
          ) : (
            <div className="faint sm" style={{ marginTop: 6 }}>No action items were found in these notes.</div>
          )}
          {deal && res.value.updates.length > 0 && (
            <>
              <div className="b sm" style={{ marginTop: 12 }}>Deal field updates</div>
              {res.value.updates.map(u => (
                <Ck key={u.key} checked={!!upOn[u.key]} onChange={v => setUpOn({ ...upOn, [u.key]: v })}>
                  <span>
                    {u.label}: <s className="faint">{u.from == null ? 'empty' : u.key === 'value' ? F.money(Number(u.from)) : String(u.from)}</s> → <b>{u.key === 'value' ? F.money(u.value) : u.value}</b>
                  </span>
                </Ck>
              ))}
            </>
          )}
          {deal && (
            <div className="row" style={{ marginTop: 12 }}>
              <span className="b sm">Update stage</span>
              <Sel
                className="sm"
                style={{ width: 220 }}
                aria-label="New stage"
                value={stage}
                onChange={setStage}
                placeholder={'Keep at ' + (Q.stage(deal)?.name ?? 'current stage')}
                options={Q.pipeline(deal.businessId).stages.filter(s => !s.won && !s.lost && s.id !== deal.stageId).map(s => [s.id, s.name] as const)}
              />
            </div>
          )}
          {res.value.missing.length > 0 && (
            <div className="sm" style={{ marginTop: 12 }}><b>Missing qualification information:</b> <span className="muted">{res.value.missing.join(' · ')}</span></div>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <Icon n="mail" s={13} />
            <span className="sm">Follow-up email drafted: “{res.value.email.subject}”. Available after saving.</span>
          </div>
        </div>
      )}
    </Modal>
  )
}
