import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import type { BusinessId } from '../../data/types'
import { Btn, Fld, Inp, Sel, TA } from '../../kit/basic'
import { Modal } from '../../kit/overlay'
import { BizSel, CoSel, DealFieldInput, MultiCt, OwnerSel, RosCalc, useF } from '../../shared/forms'
import { UI } from '../../ui/store'
import { NoEditModal } from './guards'
import { PRIORITIES } from './options'

interface DealDraft {
  businessId: BusinessId
  title: string
  companyId: string
  contactIds: string[]
  stageId: string
  ownerId: string
  close: string
  value: string
  priority: string
  source: string
  description: string
  fields: Record<string, unknown>
}

type Errors = Partial<Record<'title' | 'companyId' | 'close' | 'ros', string>>

export interface NewDealProps { companyId?: string; contactIds?: string[]; businessId?: BusinessId; title?: string }

const PLACEHOLDER: Record<string, string> = {
  ard: 'Employee Operations Platform',
  ros: 'Rostering Platform Replacement',
  pth: 'Career Simulation Licence',
  adv: 'Employee Wellbeing Platform',
}
const SOURCES = ['Outbound', 'Inbound enquiry', 'Referral', 'Event', 'Partner', 'Cross-business introduction', 'Sequence reply'] as const
const CALC_KEYS = ['employees', 'rate', 'override', 'overrideMrr']

export function NewDeal({ companyId, contactIds, businessId, title }: NewDealProps) {
  const b0 = businessId && Q.canEdit(businessId) ? businessId : Q.defaultBiz()
  if (!b0) return <NoEditModal title="New deal" what="create deals" />
  return <NewDealForm b0={b0} companyId={companyId} contactIds={contactIds} title={title} />
}

function NewDealForm({ b0, companyId, contactIds, title }: { b0: BusinessId; companyId?: string; contactIds?: string[]; title?: string }) {
  const [f, set] = useF<DealDraft>({
    businessId: b0, title: title ?? '', companyId: companyId ?? '', contactIds: contactIds ?? [], stageId: '', ownerId: Q.me().id,
    close: F.addDays(F.nowIso(), 60).slice(0, 10), value: '', priority: 'Medium', source: 'Outbound', description: '', fields: {},
  })
  const [err, setErr] = useState<Errors>({})
  const pl = Q.pipeline(f.businessId)
  const open = pl.stages.filter(s => !s.won && !s.lost)
  const firstStage = open[0] ?? pl.stages[0]
  const setField = (k: string, v: unknown): void => set('fields', { ...f.fields, [k]: v })
  const pthVal = f.businessId === 'pth' && Number(f.fields.eligible) && Number(f.fields.price) ? Math.round(Number(f.fields.eligible) * Number(f.fields.price)) : null
  // The Rosterio plan is always offered first so it is never cut off by the four-field limit.
  const keyFields = pl.fields.filter(x => x.active && !CALC_KEYS.includes(x.key)).sort((a, b) => Number(b.key === 'plan') - Number(a.key === 'plan')).slice(0, 4)

  const save = (): void => {
    const e: Errors = {}
    if (!f.title.trim()) e.title = 'Required'
    if (!f.companyId) e.companyId = 'Required'
    if (!f.close) e.close = 'Required'
    if (f.businessId === 'ros' && !(Q.rosMrr(f.fields) > 0)) e.ros = 'Enter billable employees and a monthly rate (or a custom MRR)'
    setErr(e)
    if (Object.keys(e).length) return
    if (!UI.guard(f.businessId, 'Creating deals')) return
    const d = Act.createDeal({ ...f, stageId: f.stageId || firstStage?.id, value: pthVal ?? f.value })
    if (!d) return UI.toast('Could not create the deal. Check the company and pipeline stages.', 'bad')
    UI.close()
    UI.toast('Deal created in ' + pl.name)
    UI.nav('deal', { id: d.id })
  }

  return (
    <Modal title="New deal" icon="kanban" width={660} footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" onClick={save} disabled={!firstStage}>Create deal</Btn></>}>
      <div className="grid g2">
        <Fld label="Business pipeline"><BizSel value={f.businessId} onChange={v => set({ businessId: v as BusinessId, stageId: '', fields: {}, ownerId: Q.me().id })} /></Fld>
        <Fld label="Stage" hint={firstStage ? null : 'This pipeline has no stages yet. An administrator needs to set it up.'}>
          <Sel value={f.stageId || firstStage?.id} onChange={v => set('stageId', v)} options={open.map(s => [s.id, `${s.name} (${s.prob}%)`] as const)} />
        </Fld>
        <Fld label="Deal name" req err={err.title} style={{ gridColumn: '1/-1' }}>
          <Inp value={f.title} onChange={v => set('title', v)} placeholder={PLACEHOLDER[f.businessId]} autoFocus />
        </Fld>
        <Fld label="Company" req err={err.companyId}><CoSel value={f.companyId} onChange={v => set({ companyId: v, contactIds: [] })} b={1} /></Fld>
        <Fld label="Owner"><OwnerSel b={f.businessId} value={f.ownerId} onChange={v => set('ownerId', v)} /></Fld>
        <Fld label="Stakeholders" style={{ gridColumn: '1/-1' }}><MultiCt companyId={f.companyId} value={f.contactIds} onChange={v => set('contactIds', v)} /></Fld>
        {f.businessId === 'ros' ? (
          <div style={{ gridColumn: '1/-1' }}>
            <RosCalc f={f.fields} set={setField} />
            {err.ros && <div className="err sm" role="alert" style={{ color: 'var(--bad2)', marginTop: 4 }}>{err.ros}</div>}
          </div>
        ) : f.businessId === 'pth' ? (
          <>
            <Fld label="Eligible students"><Inp value={String(f.fields.eligible ?? '')} onChange={v => setField('eligible', +v || '')} inputMode="numeric" /></Fld>
            <Fld label="Price per student / yr (A$)" hint={pthVal ? 'Annual contract value ' + F.money(pthVal) : 'Or enter a value below'}>
              <Inp value={String(f.fields.price ?? '')} onChange={v => setField('price', +v || '')} inputMode="decimal" />
            </Fld>
            {!pthVal && <Fld label="Annual contract value (A$)"><Inp value={f.value} onChange={v => set('value', v)} inputMode="numeric" /></Fld>}
          </>
        ) : (
          <Fld label={f.businessId === 'adv' ? 'Annual subscription value (A$)' : 'Estimated project value (A$)'}>
            <Inp value={f.value} onChange={v => set('value', v.replace(/[^0-9]/g, ''))} inputMode="numeric" />
          </Fld>
        )}
        <Fld label="Expected close" req err={err.close}><Inp type="date" value={f.close} onChange={v => set('close', v)} /></Fld>
        <Fld label="Priority"><Sel value={f.priority} onChange={v => set('priority', v)} options={PRIORITIES} /></Fld>
        <Fld label="Lead source"><Sel value={f.source} onChange={v => set('source', v)} options={SOURCES} /></Fld>
        {keyFields.map(fd => (
          <Fld key={fd.key} label={fd.label}><DealFieldInput fd={fd} value={f.fields[fd.key]} onChange={v => setField(fd.key, v)} companyId={f.companyId} /></Fld>
        ))}
        <Fld label="Description / scope summary" style={{ gridColumn: '1/-1' }}><TA value={f.description} onChange={v => set('description', v)} rows={2} /></Fld>
      </div>
    </Modal>
  )
}
