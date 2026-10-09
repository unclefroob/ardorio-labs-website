import { useRef, useState } from 'react'
import { draft as aiDraft, suggestReply as aiSuggest, type AiResult } from '../../../ai/client'
import * as localAi from '../../../ai/local'
import { Act } from '../../../data/Act'
import { F } from '../../../data/F'
import { Q } from '../../../data/Q'
import { S, useStore } from '../../../data/store'
import type { Thread } from '../../../data/types'
import { AiBadge, AiNotConfigured, Av, BizChip, Btn, Card, Chip, CLS_TONE, CoLink, CtLink, DlLink, EnrolChip, Link, Menu, Owner, RichText, ScoreRing, Sel, Sim, TOKENS } from '../../../kit'
import { UI } from '../../../ui/store'

const NO_SUGGEST = ['Unsubscribe', 'Out of Office', 'Delivery Failure']

interface Reply { mailboxId: string; body: string }

export function ThreadView({ t, onClose }: { t: Thread; onClose: () => void }) {
  useStore()
  const me = Q.me()
  const ms = Q.msgs(t.id).filter(m => m.status !== 'discarded')
  const ct = Q.contact(t.contactId)
  const co = Q.company(t.companyId)
  const d = t.dealId ? Q.deal(t.dealId) : undefined
  const can = Q.canEdit(t.businessId)
  const mb = Q.mailbox(t.mailboxId)
  const biz = Q.biz(t.businessId)
  const en = S.enrolments.filter(e => e.contactId === t.contactId && e.businessId === t.businessId).pop()
  const cl = t.classification
  const meta = cl ? localAi.META[cl.cat] : undefined
  const rec = S.recs.find(r => r.threadId === t.id)
  const sug = cl && !NO_SUGGEST.includes(cl.cat) ? localAi.suggestReply(t) : null
  const mailboxes = Q.myMailboxes(t.businessId)
  const [reply, setReply] = useState<Reply | null>(null)
  const [aiSug, setAiSug] = useState<AiResult<localAi.Draft> | null>(null)
  const [sugBusy, setSugBusy] = useState(false)
  const [draftBusy, setDraftBusy] = useState(false)
  const [draftTag, setDraftTag] = useState<AiResult<localAi.Draft>['ai'] | null>(null)
  const [aiErr, setAiErr] = useState('')
  const seq = useRef(0)

  const startReply = (body?: string): void => {
    const mailboxId = mailboxes.find(m => m.id === t.mailboxId)?.id ?? mailboxes[0]?.id ?? ''
    setReply({ mailboxId, body: body ?? '' })
  }

  const writeWithAi = async (): Promise<void> => {
    const n = ++seq.current
    setSugBusy(true)
    setAiErr('')
    try {
      const out = await aiSuggest(t)
      if (n === seq.current) setAiSug(out)
    } catch (e) {
      if (n === seq.current) setAiErr(e instanceof Error ? e.message : 'Could not write a reply')
    } finally {
      if (n === seq.current) setSugBusy(false)
    }
  }

  const aiDraftReply = async (): Promise<void> => {
    if (!reply) return
    setDraftBusy(true)
    setAiErr('')
    try {
      const out = aiSug ?? (ct ? await aiDraft(ct, t.businessId, 'follow') : { value: sug ?? localAi.suggestReply(t), ai: { source: 'fallback' as const, model: null } })
      setDraftTag(out.ai)
      setReply(r => (r ? { ...r, body: out.value.body } : r))
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : 'Could not draft a reply')
    } finally {
      setDraftBusy(false)
    }
  }

  const subject = 'Re: ' + t.subject.replace(/^Re: /, '')

  const saveDraft = (): void => {
    if (!reply || !ct) return
    Act.sendEmail({ businessId: t.businessId, mailboxId: reply.mailboxId, to: ct.email ?? '', subject, body: reply.body, threadId: t.id, contactId: t.contactId, draft: true })
    setReply(null)
    UI.toast('Draft saved')
  }

  const send = (): void => {
    if (!reply) return
    const m = Q.mailbox(reply.mailboxId)
    if (!m || m.status !== 'connected') return void UI.toast('Mailbox disconnected — reconnect in Integrations', 'bad')
    if (ct && Q.suppression(ct.id, t.businessId)) return void UI.toast('Contact is suppressed — sending blocked', 'bad')
    if (!F.plain(reply.body).trim()) return void UI.toast('Write a reply first', 'bad')
    if (!ct) return void UI.toast('This conversation has no linked contact to reply to', 'bad')
    Act.sendEmail({ businessId: t.businessId, mailboxId: reply.mailboxId, to: ct.email ?? '', subject, body: reply.body, threadId: t.id, contactId: t.contactId, dealId: t.dealId })
    setReply(null)
    UI.toast('Reply sent (simulated)')
  }

  const share = (): void => UI.confirm({
    title: 'Share this private thread?',
    body: `Members of the ${biz?.name ?? 'business'} team will be able to read this conversation.`,
    confirm: 'Share with team',
    onConfirm: () => {
      Act.shareThread(t.id, Q.usersIn(t.businessId).map(u => u.id))
      Act.markThread(t.id, { visibility: 'shared' })
    },
  })

  const menu = [
    { label: t.unread ? 'Mark read' : 'Mark unread', icon: 'mail', disabled: !can, onClick: () => Act.markThread(t.id, { unread: !t.unread }) },
    { label: t.needsReply ? 'Mark as handled' : 'Mark needs reply', icon: 'reply', disabled: !can, onClick: () => Act.markThread(t.id, { needsReply: !t.needsReply }) },
    { label: t.archived ? 'Unarchive' : 'Archive', icon: 'archive', disabled: !can, onClick: () => Act.markThread(t.id, { archived: !t.archived }) },
    t.visibility === 'private' && t.ownerId === me.id && { label: 'Share with team…', icon: 'users', onClick: share },
    Q.anyAdmin() && { label: 'Simulate reply on this thread', icon: 'zap', onClick: () => UI.open('simReply', { contactId: t.contactId, threadId: t.id }) },
  ]

  const suppressed = ct ? Q.suppression(ct.id, t.businessId) : undefined
  const sc = ct ? Q.score(ct.id, t.businessId) : undefined
  const followUp = meta ? (meta.days === 0 ? 'Today' : F.date(F.addDays(F.nowIso(), meta.days))) : ''

  return (
    <div style={{ padding: '16px 20px', maxWidth: 980 }}>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <Btn kind="ghost" size="sm" icon="left" className="hamb" aria-label="Back to conversations" onClick={onClose} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, flex: 1, minWidth: 200 }}>{t.subject}</h2>
        <Menu align="right" trigger={<Btn size="sm" icon="more" aria-label="Conversation actions" />} items={menu} />
      </div>
      <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
        <BizChip b={t.businessId} />
        <Chip icon={t.visibility === 'private' ? 'lock' : 'users'}>{t.visibility === 'private' ? 'Private CRM-linked email' : t.sharedWith.length ? 'Shared with team' : 'Shared business inbox'}</Chip>
        {mb && <Chip icon="mail">{mb.address}</Chip>}
        {t.seqId && <Chip icon="send">{Q.seq(t.seqId)?.name}</Chip>}
        <span className="sp" />
        <span className="xs faint">Assigned</span>
        {Q.canManage(t.businessId) || t.assigneeId === me.id ? (
          <Sel
            className="sm" style={{ width: 150 }} aria-label="Assignee" value={t.assigneeId}
            onChange={v => { Act.markThread(t.id, { assigneeId: v }); UI.toast('Conversation assigned to ' + (Q.user(v)?.name ?? 'user')) }}
            options={Q.usersIn(t.businessId).map(u => [u.id, u.name] as [string, string])}
          />
        ) : <Owner id={t.assigneeId} />}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 14, alignItems: 'start' }}>
        <div className="col" style={{ gap: 10 }}>
          {ms.length === 0 && <div className="msg faint sm">No messages in this conversation yet.</div>}
          {ms.map(m => {
            const border = m.status === 'pending' ? { borderStyle: 'dashed', borderColor: 'var(--warn)' } : m.status === 'bounced' ? { borderColor: 'var(--bad2)' } : m.dir === 'in' ? { borderLeft: '3px solid var(--acc)' } : undefined
            const who = m.dir === 'in' ? (ct?.name ?? m.from) : (Q.senderOf(Q.mailbox(m.mailboxId ?? t.mailboxId))?.name ?? m.from)
            return (
              <div key={m.id} className="msg" style={border}>
                <div className="row xs" style={{ marginBottom: 8 }}>
                  <Av name={who} s={22} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="b sm">{m.dir === 'in' ? (ct?.name ?? m.from) : m.from}</div>
                    <div className="faint">to {m.to}{m.cc ? ' · cc ' + m.cc : ''}</div>
                  </div>
                  <span className="faint">{F.dt(m.ts)}</span>
                  {m.status === 'pending' && <Chip tone="warn">Awaiting approval</Chip>}
                  {m.status === 'draft' && <Chip>Draft</Chip>}
                  {m.status === 'bounced' && <Chip tone="bad">Bounced</Chip>}
                  {m.dir === 'out' && m.status === 'sent' && <Sim>Sent (simulated)</Sim>}
                </div>
                <div className="sm" style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: F.body(m.body) }} />
                {m.status === 'pending' && can && (
                  <div className="row" style={{ marginTop: 10 }}>
                    <Btn size="sm" kind="pri" icon="send" onClick={() => { if (Act.approveMsg(m.id) === 'blocked') UI.toast('Sending blocked — the contact is suppressed or the mailbox is unavailable', 'bad'); else UI.toast('Approved and sent (simulated)') }}>Approve &amp; send</Btn>
                    <Btn size="sm" onClick={() => { Act.rejectMsg(m.id); UI.toast('Step skipped') }}>Reject</Btn>
                  </div>
                )}
                {m.status === 'draft' && can && <Btn size="sm" style={{ marginTop: 10 }} onClick={() => UI.open('compose', { threadId: t.id, subject: m.subject, body: m.body, draftId: m.id, contactId: t.contactId })}>Edit draft</Btn>}
              </div>
            )
          })}
          {cl && (
            <div className="ai card-b">
              <div className="row wrap">
                <div className="ai-h"><span>AI reply classification</span></div>
                <span className="sp" />
                {cl.corrected ? <Chip tone="info">Corrected manually</Chip> : <Sim />}
              </div>
              <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
                <Chip tone={CLS_TONE(cl.cat)}>{cl.cat}{cl.secondary ? ' / ' + cl.secondary : ''}</Chip>
                <span className="sm">Confidence <b>{Math.round(cl.conf * 100)}%</b></span>
                {cl.impact && <Chip icon="send">{cl.impact}</Chip>}
              </div>
              <div className="sm muted" style={{ marginTop: 8 }}>{cl.reason}</div>
              {meta && (
                <div className="grid g2 sm" style={{ marginTop: 10 }}>
                  <div><span className="faint">Recommended next action:</span> <b>{meta.next}</b></div>
                  <div><span className="faint">Follow up:</span> {followUp}</div>
                  {meta.deal && !d && <div><span className="faint">Deal suggestion:</span> Create a {biz?.name ?? ''} opportunity (requires confirmation)</div>}
                  {en && <div><span className="faint">Sequence:</span> <EnrolChip s={en.status} /> {Q.seq(en.seqId)?.name}</div>}
                </div>
              )}
              {sug && (
                <div className="card card-b" style={{ marginTop: 10 }}>
                  <div className="row wrap" style={{ marginBottom: 4 }}>
                    <div className="xs faint">Suggested response (not sent)</div>
                    <span className="sp" />
                    {aiSug ? <AiBadge tag={aiSug.ai} /> : <Chip>Template</Chip>}
                    {!aiSug && <AiNotConfigured />}
                  </div>
                  <div className="sm" style={{ whiteSpace: 'pre-wrap' }}>{(aiSug?.value ?? sug).body}</div>
                  {aiErr && <div className="sm" style={{ color: 'var(--bad)', marginTop: 6 }} role="alert">{aiErr}</div>}
                </div>
              )}
              {can && (
                <div className="row wrap" style={{ gap: 4, marginTop: 10 }}>
                  {rec && rec.status === 'New' && rec.action === 'task' && (
                    <Btn size="sm" kind="pri" icon="checksq" onClick={() => { const r = Act.recTask(rec.id); if (r && 'dup' in r) UI.toast('Task already exists', 'bad'); else UI.toast('Follow-up task created — see My Day') }}>Accept: create task</Btn>
                  )}
                  {sug && <Btn size="sm" icon="reply" onClick={() => startReply((aiSug?.value ?? sug).body)}>Use suggested reply</Btn>}
                  {sug && <Btn size="sm" kind="ghost" icon="spark" disabled={sugBusy} onClick={() => void writeWithAi()}>{sugBusy ? 'Writing…' : aiSug ? 'Rewrite with AI' : 'Write with AI'}</Btn>}
                  {meta?.deal && !d && <Btn size="sm" icon="kanban" onClick={() => UI.open('newDeal', { companyId: t.companyId, contactIds: t.contactId ? [t.contactId] : [], businessId: t.businessId, title: '' })}>Create opportunity</Btn>}
                  <Menu trigger={<Btn size="sm" kind="ghost" iconRight="down">Correct classification</Btn>} items={Object.keys(localAi.META).map(k => ({ label: k, checked: cl.cat === k, onClick: () => { Act.correctClass(t.id, k); UI.toast('Classification corrected to ' + k) } }))} />
                  {rec && rec.status === 'New' && <Btn size="sm" kind="ghost" onClick={() => Act.recStatus(rec.id, 'Dismissed')}>Dismiss</Btn>}
                </div>
              )}
            </div>
          )}
          {can && (reply ? (
            <div className="msg">
              <div className="row" style={{ marginBottom: 8 }}>
                <b className="sm">Reply</b>
                <Sel className="sm" style={{ width: 260 }} aria-label="Send from mailbox" value={reply.mailboxId} onChange={v => setReply({ ...reply, mailboxId: v })} placeholder={mailboxes.length ? null : 'No mailbox available'} options={mailboxes.map(m => [m.id, m.address] as [string, string])} />
                <span className="sp" />
                {draftTag && <AiBadge tag={draftTag} />}
                <Btn size="xs" kind="ghost" icon="spark" disabled={draftBusy} onClick={() => void aiDraftReply()}>{draftBusy ? 'Drafting…' : 'AI draft'}</Btn>
                <Btn size="xs" kind="ghost" icon="x" aria-label="Discard reply" onClick={() => setReply(null)} />
              </div>
              <RichText value={reply.body} onChange={v => setReply(r => (r ? { ...r, body: v } : r))} tokens={TOKENS} minH={120} label="Reply" />
              {aiErr && <div className="sm" style={{ color: 'var(--bad)', marginTop: 6 }} role="alert">{aiErr}</div>}
              <div className="row" style={{ marginTop: 8 }}>
                <Sim>Sending is simulated</Sim>
                <span className="sp" />
                <Btn size="sm" disabled={!ct || !reply.mailboxId} onClick={saveDraft}>Save draft</Btn>
                <Btn size="sm" kind="pri" icon="send" disabled={!reply.mailboxId} onClick={send}>Send</Btn>
              </div>
            </div>
          ) : (
            <div className="row">
              <Btn icon="reply" onClick={() => startReply()}>Reply</Btn>
              <Btn icon="send" onClick={() => UI.open('compose', { threadId: t.id, contactId: t.contactId })}>Open in composer</Btn>
            </div>
          ))}
        </div>
        <div className="col" style={{ gap: 10 }}>
          {ct && (
            <Card title="Contact">
              <div className="b sm"><CtLink id={ct.id} /></div>
              <div className="faint xs">{ct.title}</div>
              <div className="sm" style={{ marginTop: 6 }}><CoLink id={co?.id} /></div>
              {sc && (
                <div className="row" style={{ marginTop: 8, gap: 6 }}>
                  <ScoreRing v={sc.total} s={34} />
                  <Chip tone={Q.scoreTone(sc.label)}>{sc.label}</Chip>
                </div>
              )}
              {suppressed && <Chip tone="bad" style={{ marginTop: 6 }}>Suppressed</Chip>}
              {can && (
                <div className="row wrap" style={{ gap: 4, marginTop: 8 }}>
                  <Btn size="xs" icon="phone" onClick={() => UI.open('logCall', { contactId: ct.id, businessId: t.businessId })}>Log call</Btn>
                  <Btn size="xs" icon="checksq" onClick={() => UI.open('newTask', { businessId: t.businessId, companyId: ct.companyId, contactId: ct.id, dealId: t.dealId ?? '' })}>Task</Btn>
                </div>
              )}
            </Card>
          )}
          {d ? (
            <Card title="Deal">
              <DlLink id={d.id} />
              <div className="faint xs">{Q.stage(d)?.name} · {F.money(d.value, 1)}</div>
            </Card>
          ) : co && (
            <Card title="Deal">
              <div className="faint sm">No deal linked</div>
              {can && <Btn size="xs" style={{ marginTop: 6 }} onClick={() => UI.open('newDeal', { companyId: co.id, contactIds: ct ? [ct.id] : [], businessId: t.businessId })}>Create deal</Btn>}
            </Card>
          )}
          {en && (
            <Card title="Sequence">
              <Link to="sequence" id={en.seqId}>{Q.seq(en.seqId)?.name}</Link>
              <div style={{ marginTop: 4 }}><EnrolChip s={en.status} /></div>
              {en.reason && <div className="faint xs" style={{ marginTop: 4 }}>{en.reason}</div>}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
