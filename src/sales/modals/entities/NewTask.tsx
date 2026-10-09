import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId } from '../../data/types'
import { Banner, Btn, Fld, Inp, Sel, TA } from '../../kit/basic'
import { Modal } from '../../kit/overlay'
import { BizSel, CoSel, CtSel, OwnerSel, useF } from '../../shared/forms'
import { UI } from '../../ui/store'
import { NoEditModal } from './guards'
import { PRIORITIES, TASK_STATUSES, TASK_TYPES } from './options'

export interface NewTaskProps {
  businessId?: BusinessId
  title?: string
  type?: string
  desc?: string
  priority?: string
  assigneeId?: string
  companyId?: string
  contactId?: string
  dealId?: string
  date?: string
  time?: string
  reminder?: string
  source?: string
}

interface TaskDraft {
  title: string
  type: string
  desc: string
  businessId: BusinessId
  assigneeId: string
  priority: string
  date: string
  time: string
  companyId: string
  contactId: string
  dealId: string
  reminder: string
  status: string
}

export function NewTask(p: NewTaskProps) {
  const b0 = p.businessId && Q.canEdit(p.businessId) ? p.businessId : Q.defaultBiz()
  if (!b0) return <NoEditModal title="New task" what="create tasks" />
  return <NewTaskForm b0={b0} p={p} />
}

function NewTaskForm({ b0, p }: { b0: BusinessId; p: NewTaskProps }) {
  const [f, set] = useF<TaskDraft>({
    title: p.title ?? '', type: p.type ?? 'Follow-up', desc: p.desc ?? '', businessId: b0, assigneeId: p.assigneeId ?? Q.me().id,
    priority: p.priority ?? 'Medium', date: p.date ?? F.addDays(F.nowIso(), 1).slice(0, 10), time: p.time ?? '10:00',
    companyId: p.companyId ?? '', contactId: p.contactId ?? '', dealId: p.dealId ?? '', reminder: p.reminder ?? '15 minutes before',
    status: TASK_STATUSES[0],
  })
  const [err, setErr] = useState('')
  const canAssign = Q.canManage(f.businessId)
  const title = f.title.trim().toLowerCase()
  const dup = title ? S.tasks.find(t => !Q.done(t) && t.title.toLowerCase() === title && (t.contactId || '') === (f.contactId || '')) : undefined
  const deals = S.deals.filter(d => d.companyId === f.companyId && d.businessId === f.businessId)

  const save = (): void => {
    if (!f.title.trim()) return setErr('Title is required')
    if (!UI.guard(f.businessId, 'Creating tasks')) return
    Act.createTask({
      title: f.title, type: f.type, desc: f.desc, businessId: f.businessId, assigneeId: f.assigneeId, priority: f.priority,
      due: `${f.date}T${f.time}`, companyId: f.companyId || null, contactId: f.contactId || null, dealId: f.dealId || null,
      reminder: f.reminder, status: 'Not Started', source: p.source ?? 'Manual',
    })
    UI.close()
    UI.toast('Task created' + (f.assigneeId !== Q.me().id ? ' and assigned to ' + (Q.user(f.assigneeId)?.name ?? 'a teammate') : ''))
  }

  return (
    <Modal title="New task" icon="checksq" width={620} footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" onClick={save}>Create task</Btn></>}>
      <div className="grid g2">
        <Fld label="Title" req err={err} style={{ gridColumn: '1/-1' }}><Inp value={f.title} onChange={v => { set('title', v); setErr('') }} autoFocus /></Fld>
        {dup && (
          <div style={{ gridColumn: '1/-1' }}>
            <Banner tone="warn">A matching open task already exists (due {F.dt(dup.due)}, {Q.user(dup.assigneeId)?.name ?? 'unassigned'}). You can still create this one.</Banner>
          </div>
        )}
        <Fld label="Type"><Sel value={f.type} onChange={v => set('type', v)} options={TASK_TYPES} /></Fld>
        <Fld label="Priority"><Sel value={f.priority} onChange={v => set('priority', v)} options={PRIORITIES} /></Fld>
        <Fld label="Business"><BizSel value={f.businessId} onChange={v => set({ businessId: v as BusinessId, assigneeId: Q.me().id, dealId: '' })} /></Fld>
        <Fld label="Assigned to" hint={canAssign ? null : 'Sales users can assign tasks to themselves'}>
          <OwnerSel b={f.businessId} selfOnly={!canAssign} value={f.assigneeId} onChange={v => set('assigneeId', v)} />
        </Fld>
        <Fld label="Due date"><Inp type="date" value={f.date} onChange={v => set('date', v)} /></Fld>
        <Fld label="Due time"><Inp type="time" value={f.time} onChange={v => set('time', v)} /></Fld>
        <Fld label="Company"><CoSel value={f.companyId} onChange={v => set({ companyId: v, contactId: '', dealId: '' })} /></Fld>
        <Fld label="Contact"><CtSel companyId={f.companyId} value={f.contactId} onChange={v => set('contactId', v)} placeholder="—" /></Fld>
        <Fld label="Deal"><Sel value={f.dealId} onChange={v => set('dealId', v)} placeholder="—" options={deals.map(d => [d.id, d.title] as const)} /></Fld>
        <Fld label="Reminder"><Sel value={f.reminder} onChange={v => set('reminder', v)} options={['None', '15 minutes before', '1 hour before', 'Morning of']} /></Fld>
        <Fld label="Description" style={{ gridColumn: '1/-1' }}><TA value={f.desc} onChange={v => set('desc', v)} rows={2} /></Fld>
      </div>
    </Modal>
  )
}
