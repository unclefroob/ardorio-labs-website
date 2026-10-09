import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import type { Task } from '../../data/types'
import { Banner, Btn, Empty, Fld, Inp, Sel, TA } from '../../kit/basic'
import { CoLink, CtLink, DlLink, Link } from '../../kit/links'
import { Icon } from '../../kit/Icon'
import { Drawer } from '../../kit/overlay'
import { useF } from '../../shared/forms'
import { completeFlow } from '../../shared/moves'
import { UI } from '../../ui/store'
import { PRIORITIES, TASK_STATUSES } from './options'

interface TaskDraft {
  title: string
  desc: string
  priority: string
  assigneeId: string
  date: string
  time: string
  status: string
  type: string
}

const SNOOZES: ReadonlyArray<readonly [hours: number, label: string]> = [[3, '3 hours'], [24, 'Tomorrow'], [72, '3 days']]

export function TaskDrawer({ id }: { id: string }) {
  const t = Q.task(id)
  if (!t) {
    return (
      <Drawer title="Task" onClose={() => UI.drawer(null)}>
        <Empty icon="search" title="Task not found" body="It may have been deleted, or you may not have access to it." />
      </Drawer>
    )
  }
  return <TaskDrawerForm t={t} />
}

function TaskDrawerForm({ t }: { t: Task }) {
  const [f, set] = useF<TaskDraft>({
    title: t.title, desc: t.desc || '', priority: t.priority, assigneeId: t.assigneeId, date: t.due.slice(0, 10), time: t.due.slice(11, 16),
    status: t.status, type: t.type,
  })
  const can = Q.canEdit(t.businessId)
  const mgr = Q.canManage(t.businessId)
  const owners = !mgr && f.assigneeId === Q.me().id ? [Q.me()] : Q.usersIn(t.businessId)
  const seq = t.seqId ? Q.seq(t.seqId) : undefined

  const save = (): void => {
    if (!f.title.trim()) return UI.toast('Title is required', 'bad')
    Act.updateTask(t.id, { title: f.title, desc: f.desc, priority: f.priority, assigneeId: f.assigneeId, due: `${f.date}T${f.time}`, status: f.status as Task['status'], type: f.type })
    UI.toast('Task updated')
  }
  const remove = (): void =>
    UI.confirm({
      title: 'Delete task?',
      body: 'This permanently removes the task. Related activity history is kept.',
      danger: true,
      confirm: 'Delete',
      onConfirm: () => {
        Act.deleteTask(t.id)
        UI.drawer(null)
      },
    })

  return (
    <Drawer
      title={t.title}
      sub={`${Q.biz(t.businessId)?.name ?? t.businessId} · ${t.type}${t.source ? ' · ' + t.source : ''}`}
      onClose={() => UI.drawer(null)}
      footer={can && (
        <>
          <Btn kind="danger" icon="trash" aria-label="Delete task" onClick={remove} />
          <span className="sp" />
          <Btn onClick={save}>Save</Btn>
          {!Q.done(t) && <Btn kind="pri" icon={t.kind === 'email' ? 'mail' : 'check'} onClick={() => { UI.drawer(null); completeFlow(t) }}>{t.kind === 'email' ? 'Open email' : 'Complete'}</Btn>}
        </>
      )}
    >
      <div className="col gap12">
        {!can && <Banner icon="lock">Read-only. You can't edit tasks in {Q.biz(t.businessId)?.name ?? 'this business'}.</Banner>}
        <Fld label="Title"><Inp value={f.title} onChange={v => set('title', v)} disabled={!can} /></Fld>
        <div className="grid g2">
          <Fld label="Status"><Sel value={f.status} onChange={v => set('status', v)} options={t.kind === 'email' ? TASK_STATUSES.filter(x => x !== 'Completed') : TASK_STATUSES} disabled={!can} /></Fld>
          <Fld label="Priority"><Sel value={f.priority} onChange={v => set('priority', v)} options={PRIORITIES} disabled={!can} /></Fld>
          <Fld label="Due date"><Inp type="date" value={f.date} onChange={v => set('date', v)} disabled={!can} /></Fld>
          <Fld label="Time"><Inp type="time" value={f.time} onChange={v => set('time', v)} disabled={!can} /></Fld>
        </div>
        <Fld label="Assigned to" hint={mgr ? null : 'Only managers can reassign'}>
          <Sel value={f.assigneeId} onChange={v => set('assigneeId', v)} disabled={!mgr || !can} options={owners.map(u => [u.id, u.name + (u.id === Q.me().id ? ' (you)' : '')] as const)} />
        </Fld>
        <Fld label="Description"><TA value={f.desc} onChange={v => set('desc', v)} rows={3} disabled={!can} /></Fld>
        {t.kind === 'email' && t.draft && (
          <div className="card-b" style={{ background: 'var(--surf2)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
            <div className="row sm" style={{ gap: 6 }}><Icon n="mail" s={13} /><b>Draft email</b><span className="sp" /><span className="faint">to {t.draft.to}</span></div>
            <div className="sm" style={{ marginTop: 6 }}><b>{t.draft.subject}</b></div>
            <div className="sm muted" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{t.draft.body}</div>
            {!Q.done(t) && <div style={{ marginTop: 8 }}><Btn size="sm" icon="mail" onClick={() => { UI.drawer(null); completeFlow(t) }}>Open email</Btn></div>}
          </div>
        )}
        {t.script && (
          <div className="ai card-b">
            <div className="ai-h"><Icon n="spark" s={13} />Script / suggested message</div>
            <div className="sm" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{t.script}</div>
          </div>
        )}
        <dl className="dl">
          {t.companyId && <><dt>Company</dt><dd><CoLink id={t.companyId} /></dd></>}
          {t.contactId && <><dt>Contact</dt><dd><CtLink id={t.contactId} /></dd></>}
          {t.dealId && <><dt>Deal</dt><dd><DlLink id={t.dealId} /></dd></>}
          {t.seqId && <><dt>Sequence</dt><dd><Link to="sequence" id={t.seqId}>{seq?.name ?? 'Sequence'}</Link></dd></>}
          <dt>Created</dt><dd>{F.dt(t.createdAt)}</dd>
          {t.completedAt && <><dt>Completed</dt><dd>{F.dt(t.completedAt)}{t.outcome ? ' · ' + t.outcome : ''}</dd></>}
        </dl>
        {can && !Q.done(t) && (
          <div className="row wrap">
            <span className="faint sm">Snooze:</span>
            {SNOOZES.map(([h, l]) => (
              <Btn key={h} size="sm" onClick={() => { Act.snoozeTask(t.id, h); UI.drawer(null); UI.toast('Snoozed until ' + F.dt(F.addHours(F.nowIso(), h))) }}>{l}</Btn>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  )
}
