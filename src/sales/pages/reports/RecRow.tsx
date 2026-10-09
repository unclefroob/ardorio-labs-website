import { useState, type FC } from 'react'
import { draft as aiDraft, suggestReply } from '../../ai/client'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId, Rec } from '../../data/types'
import { BizDot, Btn, Chip } from '../../kit'
import { UI } from '../../ui/store'

export interface RecRowProps { r: Rec; compact?: boolean }

const text = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

export const RecRow: FC<RecRowProps> = ({ r, compact }) => {
  const [busy, setBusy] = useState(false)
  const can = Q.canEdit(r.businessId)
  const d = Q.deal(r.dealId)
  const ct = Q.contact(r.contactId)
  const ex = S.tasks.find(t => t.recId === r.id)
  const meetingId = text(r.meetingId)
  const fromBiz = text(r.fromBiz) as BusinessId | undefined

  const doTask = (): void => {
    if (!UI.guard(r.businessId, 'Creating tasks')) return
    const res = Act.recTask(r.id)
    if (!res) return
    if ('dup' in res) {
      UI.confirm({
        title: 'Task already created',
        body: `A task from this recommendation already exists (“${res.dup.title}”, due ${F.dt(res.dup.due)}). Create another one?`,
        confirm: 'Create duplicate',
        onConfirm: () => {
          Act.recTask(r.id, true)
          UI.toast('Duplicate task created')
        },
      })
    } else {
      const id = res.task.id
      UI.toast(`Task created: ${res.task.title}`, undefined, { label: 'View', fn: () => UI.drawer('task', { id }) })
    }
  }

  const draftEmail = async (): Promise<void> => {
    const c = ct ?? Q.contact(d?.primaryContact)
    if (!c) {
      UI.toast('No contact linked', 'bad')
      return
    }
    const thread = Q.thread(r.threadId)
    setBusy(true)
    try {
      const res = thread ? await suggestReply(thread) : await aiDraft(c, r.businessId, d ? 'stale' : 'intro', { deal: d })
      UI.open('compose', {
        contactId: c.id, dealId: r.dealId, businessId: r.businessId, threadId: r.threadId,
        subject: res.value.subject, body: res.value.body, ai: res.ai,
      })
    } catch {
      UI.toast("Couldn't draft the email. Try again.", 'bad')
    } finally {
      setBusy(false)
    }
  }

  const view = (): void => {
    if (r.threadId) UI.nav('inbox', { id: r.threadId })
    else if (r.dealId) UI.nav('deal', { id: r.dealId })
    else if (r.contactId) UI.nav('contact', { id: r.contactId })
    else if (r.companyId) UI.nav('company', { id: r.companyId })
  }
  const target = r.threadId ? 'email' : r.dealId ? 'deal' : r.contactId ? 'contact' : 'company'
  const live = r.status === 'New' || r.status === 'Accepted'

  return (
    <div className={compact ? '' : 'card card-b'} style={compact ? { paddingBottom: 10, borderBottom: '1px solid var(--line)' } : undefined}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <BizDot b={r.businessId} />
            <b className="sm">{r.title}</b>
            {!compact && <Chip tone="ai">{r.type}</Chip>}
            {r.status !== 'New' && <Chip tone={r.status === 'Accepted' || r.status === 'Completed' ? 'ok' : ''}>{r.status}</Chip>}
          </div>
          <div className="muted sm" style={{ marginTop: 3 }}>{r.explain}</div>
          <div className="faint xs" style={{ marginTop: 3 }}>Evidence: {r.evidence} · Confidence {r.confidence} · {F.rel(r.createdAt)}</div>
          {ex && <div className="xs" style={{ marginTop: 3, color: 'var(--ok)' }}>✓ Task created: {ex.title}</div>}
        </div>
      </div>
      {live && (
        <div className="row wrap" style={{ gap: 4, marginTop: 8 }}>
          {r.action === 'brief' ? (
            <Btn size="xs" kind="pri" icon="spark" onClick={() => UI.open('meetingBrief', { id: meetingId })}>Open briefing</Btn>
          ) : r.action === 'intro' ? (
            <Btn size="xs" kind="pri" icon="swap" onClick={() => UI.open('crossIntro', { companyId: r.companyId, toBiz: r.businessId, fromBiz, recId: r.id })}>Coordinate introduction</Btn>
          ) : (
            r.action === 'task' && <Btn size="xs" kind="pri" icon="checksq" disabled={!can} onClick={doTask}>Create task</Btn>
          )}
          {(ct || d) && r.action !== 'intro' && (
            <Btn size="xs" icon="mail" disabled={!can || busy} onClick={() => void draftEmail()}>{busy ? 'Drafting…' : 'Draft email'}</Btn>
          )}
          {r.suggestDeal && (
            <Btn size="xs" icon="kanban" disabled={!can} onClick={() => {
              UI.open('newDeal', { companyId: r.companyId, contactIds: r.contactId ? [r.contactId] : [], businessId: r.businessId, title: '' })
              Act.recStatus(r.id, 'Accepted')
            }}>Create opportunity</Btn>
          )}
          <Btn size="xs" kind="ghost" onClick={view}>View {target}</Btn>
          {r.status === 'New' && (
            <Btn size="xs" kind="ghost" disabled={!can} onClick={() => {
              Act.recStatus(r.id, 'Dismissed')
              UI.toast('Dismissed')
            }}>Dismiss</Btn>
          )}
        </div>
      )}
    </div>
  )
}
