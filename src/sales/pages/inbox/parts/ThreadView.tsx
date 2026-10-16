import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { draft as aiDraft, suggestReply as aiSuggest, type AiResult } from '../../../ai/client'
import * as localAi from '../../../ai/local'
import { Act } from '../../../data/Act'
import { F } from '../../../data/F'
import { Q } from '../../../data/Q'
import { isSimMsg, simThread } from '../../../data/simulated'
import { S, useStore } from '../../../data/store'
import type { Message, Thread } from '../../../data/types'
import { AiBadge, AiNotConfigured, Av, BizChip, Btn, Card, Chip, CLS_TONE, CoLink, CtLink, DlLink, EnrolChip, Inp, Link, Menu, Owner, RichText, ScoreRing, SearchInp, Sel, Sim, SimChip, Spinner, TOKENS } from '../../../kit'
import { sendMailApi } from '../../../api/mailboxes'
import { SalesHttpError } from '../../../api/http'
import { pollOnce } from '../../../data/sync'
import { mailDecided, recheckMailState, useMailState } from '../../../mail/client'
import { EmailBody } from './EmailBody'
import { Attachments, SignatureLine, toSend, type PendingFile } from '../../../modals/comms/MailExtras'
import { dealCandidates } from '../../../shared/dealLink'
import { customerOf } from '../../../shared/customerOf'
import { rosterioLinkOf } from '../../../data/rosterio'
import { UI } from '../../../ui/store'
import { tokenNames } from '../../../data/tokens'

const NO_SUGGEST = ['Unsubscribe', 'Out of Office', 'Delivery Failure']

interface Reply { mailboxId: string; to: string; cc: string; bcc: string; showCc: boolean; body: string; files: PendingFile[]; sig: boolean }

// Unsent replies, by conversation, for the session: switching to another conversation (or a poll that briefly drops this one) keeps them.
const drafts = new Map<string, Reply>()
export const clearReplyDrafts = (): void => drafts.clear()

const addrOf = (s: string): string => (/<([^>]+)>/.exec(s)?.[1] ?? s).trim()

/** Reply to whoever wrote last, as Gmail does; the linked contact when nobody has written in yet. */
function replyTo(ms: Message[], fallback: string): string {
  const last = [...ms].reverse().find(m => m.dir === 'in' && m.status !== 'draft')
  return last ? addrOf(last.from) : fallback
}

// Addresses as text ("a@x, B <b@y>") or, on some records, a list.
const addrsOf = (s: unknown): string[] => (Array.isArray(s) ? s.join(',') : typeof s === 'string' ? s : '').split(/[,;]/).map(x => addrOf(x).toLowerCase()).filter(x => x.includes('@'))

/** Reply all: everyone else on the last message (its sender, To and Cc), less our own mailboxes and whoever the reply goes to. */
export function replyAllCc(ms: Message[], to: string, own: string[]): string {
  const last = [...ms].reverse().find(m => m.status !== 'draft')
  if (!last) return ''
  const skip = new Set([...own.map(a => a.toLowerCase()), to.toLowerCase()])
  return [...new Set([...addrsOf(last.from), ...addrsOf(last.to), ...addrsOf(last.cc)])].filter(a => !skip.has(a)).join(', ')
}

/** The body of a forward, as Gmail writes it: the original's headers, then its text. */
export function forwardBody(m: Message, who: string): string {
  const line = (k: string, v: string): string => `<div>${k}: ${F.body(v)}</div>`
  const files = m.attachments?.length ? `<div><br></div><div>(${m.attachments.length} attachment${m.attachments.length === 1 ? '' : 's'} not included: forward from Gmail to send them on.)</div>` : ''
  return `<div><br></div><div>---------- Forwarded message ---------</div>${line('From', who)}${line('Date', F.dt(m.ts))}${line('Subject', m.subject)}${line('To', m.to)}${m.cc ? line('Cc', m.cc) : ''}<div><br></div>${F.body(m.body)}${files}`
}

/** Put a message at the top of the conversation pane (desktop) or the page (narrow screens, where the pane is the page). */
function bringIntoView(el: HTMLElement): void {
  const box = el.closest<HTMLElement>('.ib-r')
  if (box && getComputedStyle(box).overflowY === 'auto') box.scrollTop = Math.max(0, el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12)
  else el.scrollIntoView?.({ block: 'start' })
}

export function ThreadView({ t, target, onClose, onArchived }: { t: Thread; target?: string; onClose: () => void; onArchived?: (id: string) => void }) {
  const mailState = useMailState().s
  const sims = mailState === 'off'
  const live = mailState === 'live'
  useStore()
  const me = Q.me()
  const ms = Q.msgs(t.id).filter(m => m.status !== 'discarded')
  const sim = simThread(t, ms)
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
  const [reply, setReply] = useState<Reply | null>(() => drafts.get(t.id) ?? null)
  useEffect(() => {
    if (reply) drafts.set(t.id, reply)
    else drafts.delete(t.id)
  }, [reply, t.id])
  const [sending, setSending] = useState(false)
  // A reply on its way: shown in the conversation at once (where the editor was), "Sending…" then "Sent", until the synced message
  // takes its place. If Gmail refuses it, the editor comes back with the reply in it.
  const [pending, setPending] = useState<{ body: string; to: string; id?: string; at: string } | null>(null)
  const landed = !!pending?.id && Q.msgs(t.id).some(x => x.id === pending.id)
  useEffect(() => { if (landed) setPending(null) }, [landed])

  // Older messages fold to one line, as in Gmail; the one you came for (a link's message, else the newest) is open and in view.
  const newest = ms[ms.length - 1]
  const goal = (target && ms.find(m => m.id === target)) || newest
  const [exp, setExp] = useState<Record<string, boolean>>({})
  const isOpen = (m: Message): boolean => exp[m.id] ?? (m.id === goal?.id || m.id === newest?.id || m.status === 'draft' || ms.length <= 2)
  const root = useRef<HTMLDivElement>(null)
  const goalEl = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    // The first message is the top of the conversation: show the subject with it.
    const el = goal && goal.id !== ms[0]?.id ? goalEl.current : root.current
    if (el) bringIntoView(el)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- once, when the conversation opens; new mail must not move the page
  const [linking, setLinking] = useState(false)
  const standing = customerOf(co, t.businessId, { deals: S.deals, rel: co ? Q.rel(co.id, t.businessId) : undefined, rosterio: rosterioLinkOf(co) })
  const [aiSug, setAiSug] = useState<AiResult<localAi.Draft> | null>(null)
  const [sugBusy, setSugBusy] = useState(false)
  const [draftBusy, setDraftBusy] = useState(false)
  const [draftTag, setDraftTag] = useState<AiResult<localAi.Draft>['ai'] | null>(null)
  const [aiErr, setAiErr] = useState('')
  const seq = useRef(0)

  const startReply = (body?: string, all = false): void => {
    const mailboxId = mailboxes.find(m => m.id === t.mailboxId)?.id ?? mailboxes[0]?.id ?? ''
    const to = replyTo(ms, ct?.email ?? '')
    const cc = all ? replyAllCc(ms, to, S.mailboxes.map(m => m.address)) : ''
    setReply({ mailboxId, to, cc, bcc: '', showCc: !!cc, body: body ?? '', files: [], sig: true })
  }
  const othersOnLast = replyAllCc(ms, replyTo(ms, ct?.email ?? ''), S.mailboxes.map(m => m.address))
  const forward = (): void => {
    const m = newest
    if (!m) return
    const who = m.dir === 'in' ? (ct?.name ? `${ct.name} <${addrOf(m.from)}>` : m.from) : m.from
    UI.open('compose', { businessId: t.businessId, mailboxId: t.mailboxId, subject: 'Fwd: ' + t.subject.replace(/^(Fwd|Fw): /i, ''), body: forwardBody(m, who), dealId: t.dealId ?? undefined })
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
    const r = Act.sendEmail({ businessId: t.businessId, mailboxId: reply.mailboxId, to: reply.to, subject, body: reply.body, threadId: t.id, contactId: t.contactId, draft: true })
    if (!r.ok) return void UI.toast('Draft could not be saved', 'bad')
    setReply(null)
    UI.toast('Draft saved')
  }

  const send = async (): Promise<void> => {
    if (!reply || sending) return
    const m = Q.mailbox(reply.mailboxId)
    if (!m || m.status !== 'connected') return void UI.toast('Mailbox disconnected — reconnect in Integrations', 'bad')
    if (ct && Q.suppressed(ct, t.businessId)) return void UI.toast('Contact is suppressed — sending blocked', 'bad')
    if (!F.plain(reply.body).trim()) return void UI.toast('Write a reply first', 'bad')
    if (!/@/.test(reply.to)) return void UI.toast('Add who the reply goes to', 'bad')
    if (!mailDecided(mailState)) return void UI.toast('Could not check whether Gmail is connected, so nothing was sent. Try again in a moment.', 'bad')
    if (!UI.guard(t.businessId, 'Sending email')) return
    const tok = Q.tokens(ct, Q.senderOf(m), t.businessId)
    const pr = Q.render(F.plain(reply.body), tok)
    if (pr.unknown.length) return void UI.toast(`{{${pr.unknown.join('}}, {{')}}} ${pr.unknown.length === 1 ? 'is not a variable' : 'are not variables'}. Remove ${pr.unknown.length === 1 ? 'it' : 'them'} or pick one from Insert.`, 'bad')
    if (pr.missing.length) return void UI.toast(`${ct?.name ?? 'This contact'} has no ${tokenNames(pr.missing).toLowerCase()}. Fill in the contact, add a fallback such as {{${pr.missing[0]}|…}}, or edit the reply.`, 'bad')
    const body = Q.render(reply.body, tok).text
    if (live) {
      // Real Gmail: the reply really goes, the same way Compose sends it. The server checks everything again and says so when it refuses.
      if (!m.canSend) return void UI.toast('Sending is off for ' + m.address + '. Switch it on in Integrations.', 'bad')
      const inGmail = !!t.gmailThreadId && t.mailboxId === m.id
      const draft = reply
      setSending(true)
      setPending({ body, to: reply.to, at: F.nowIso() })
      setReply(null)
      try {
        const r = await sendMailApi({
          mailboxId: m.id, to: draft.to, cc: draft.cc || undefined, bcc: draft.bcc || undefined, subject, body, ...(inGmail ? { threadId: t.id } : { businessId: t.businessId }), contactId: t.contactId, dealId: t.dealId ?? null,
          attachments: draft.files.length ? toSend(draft.files) : undefined, signature: draft.sig, quote: inGmail,
        })
        drafts.delete(t.id)
        UI.toast(
          r.recorded ? 'Reply sent from ' + m.address : 'Reply sent from ' + m.address + '. It will show here shortly.',
          undefined,
          r.recorded && r.threadId !== t.id ? { label: 'View thread', fn: () => UI.nav('inbox', { id: r.threadId }) } : undefined,
        )
        // It is sent: say so in place, and let the sync bring the real message in (which then replaces this).
        if (r.recorded && r.threadId === t.id) setPending(p => (p ? { ...p, id: r.messageId } : p))
        void pollOnce().finally(() => setPending(p => (p && (!p.id || r.threadId !== t.id) ? null : p)))
      } catch (e) {
        setPending(null)
        setReply(draft)
        UI.toast(e instanceof SalesHttpError ? e.message : 'Could not reach the server. Nothing was sent. Try again.', 'bad')
      } finally {
        setSending(false)
      }
      return
    }
    const r = Act.sendEmail({ businessId: t.businessId, mailboxId: reply.mailboxId, to: reply.to, subject, body, threadId: t.id, contactId: t.contactId, dealId: t.dealId })
    if (!r.ok) return void UI.toast(r.reason === 'suppressed' ? 'Contact is suppressed — sending blocked' : 'Reply could not be sent', 'bad')
    setReply(null)
    UI.toast('Reply sent (simulated)')
  }

  const notNeeded = (): void => {
    Act.markThread(t.id, { needsReply: false })
    UI.toast('Marked as not needing a reply. A new message from them asks again.', undefined, { label: 'Undo', fn: () => Act.markThread(t.id, { needsReply: true }) })
  }
  const archive = (): void => {
    if (t.archived) return void Act.markThread(t.id, { archived: false })
    Act.markThread(t.id, { archived: true })
    onArchived?.(t.id)
    UI.toast('Conversation archived', undefined, { label: 'Undo', fn: () => { Act.markThread(t.id, { archived: false }); UI.replace('inbox', { id: t.id }) } })
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
    { label: t.needsReply ? "Doesn't need a reply" : 'Needs a reply', icon: 'reply', disabled: !can, onClick: () => (t.needsReply ? notNeeded() : Act.markThread(t.id, { needsReply: true })) },
    { label: t.archived ? 'Unarchive' : 'Archive', icon: 'archive', disabled: !can, onClick: archive },
    t.visibility === 'private' && t.ownerId === me.id && { label: 'Share with team…', icon: 'users', onClick: share },
    Q.anyAdmin() && sims && { label: 'Simulate reply on this thread', icon: 'zap', onClick: () => UI.open('simReply', { contactId: t.contactId, threadId: t.id }) },
  ]

  const suppressed = ct ? Q.suppressed(ct, t.businessId) : null
  const sc = ct ? Q.score(ct.id, t.businessId) : undefined
  const followUp = meta ? (meta.days === 0 ? 'Today' : F.date(F.addDays(F.nowIso(), meta.days))) : ''

  return (
    <div ref={root} className="tv">
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <Btn kind="ghost" size="sm" icon="left" className="hamb" aria-label="Back to conversations" onClick={onClose} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, flex: 1, minWidth: 200 }}>{t.subject}</h2>
        {t.needsReply && can && (
          <Btn size="sm" icon="check" onClick={notNeeded}>Doesn't need a reply</Btn>
        )}
        <Menu align="right" trigger={<Btn size="sm" icon="more" aria-label="Conversation actions" />} items={menu} />
      </div>
      <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
        <BizChip b={t.businessId} />
        <Chip icon={t.visibility === 'private' ? 'lock' : 'users'}>{t.visibility === 'private' ? 'Private CRM-linked email' : t.sharedWith.length ? 'Shared with team' : 'Shared business inbox'}</Chip>
        {mb && <Chip icon="mail">{mb.address}</Chip>}
        {t.seqId && <Chip icon="send">{Q.seq(t.seqId)?.name}</Chip>}
        {sim && <SimChip>{sim === 'all' ? 'Simulated conversation' : 'Includes simulated mail'}</SimChip>}
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
      {sim && <div className="faint xs" style={{ margin: '-6px 0 12px' }}>No real email is sent or received yet. Simulated messages are recorded in SalesOS only and do not count in goals or reports.</div>}
      <div className="tv-g">
        <div className="col" style={{ gap: 10 }}>
          {ms.length === 0 && <div className="msg faint sm">No messages in this conversation yet.</div>}
          {ms.map(m => {
            const border = m.status === 'bounced' ? { borderColor: 'var(--bad2)' } : m.dir === 'in' ? { borderLeft: '3px solid var(--acc)' } : undefined
            const who = m.dir === 'in' ? (ct?.name ?? m.from) : (Q.senderOf(Q.mailbox(m.mailboxId ?? t.mailboxId))?.name ?? m.from)
            const ref = m.id === goal?.id ? goalEl : undefined
            if (!isOpen(m)) {
              return (
                <div key={m.id} ref={ref}>
                  <button type="button" className="msg msg-fold" style={border} aria-expanded={false} onClick={() => setExp(x => ({ ...x, [m.id]: true }))}>
                    <Av name={who} s={22} />
                    <span className="b sm trunc msg-fold-who">{m.dir === 'in' ? (ct?.name ?? m.from) : m.from}</span>
                    <span className="faint sm trunc msg-fold-snip">{F.plain(m.body).replace(/\s+/g, ' ').slice(0, 160)}</span>
                    {isSimMsg(m) && <SimChip>Simulated</SimChip>}
                    <span className="faint xs msg-dt">{F.dt(m.ts)}</span>
                  </button>
                </div>
              )
            }
            return (
              <div key={m.id} ref={ref} className={'msg' + (target && m.id === target ? ' msg-target' : '')} style={border}>
                <div className="msg-h xs" onClick={ms.length > 2 && m.id !== newest?.id ? () => setExp(x => ({ ...x, [m.id]: false })) : undefined} style={ms.length > 2 && m.id !== newest?.id ? { cursor: 'pointer' } : undefined}>
                  <Av name={who} s={22} />
                  <div className="msg-w">
                    {/* The name and date sit on one line that wraps as a whole, so a long recipient list never squeezes them. */}
                    <div className="msg-top">
                      <span className="b sm">{m.dir === 'in' ? (ct?.name ?? m.from) : m.from}</span>
                      <span className="sp" />
                      {m.status === 'draft' && <Chip>Draft</Chip>}
                      {m.status === 'bounced' && <Chip tone="bad">Bounced</Chip>}
                      {m.dir === 'out' && m.status === 'sent' && m.manual && <Chip tone="ok" icon="check">Sent by hand</Chip>}
                      {isSimMsg(m) && <SimChip>{m.dir === 'in' ? 'Received (simulated)' : 'Sent (simulated)'}</SimChip>}
                      <span className="faint msg-dt">{F.dt(m.ts)}</span>
                    </div>
                    <div className="faint msg-to">to {m.to}{m.cc ? ' · cc ' + m.cc : ''}</div>
                  </div>
                </div>
                <EmailBody m={m} />
                <MessageExtras m={m} address={Q.mailbox(m.mailboxId ?? t.mailboxId)?.address} />
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
          {pending && (
            <div className="msg msg-pending" aria-live="polite" aria-busy={!pending.id}>
              <div className="msg-h xs">
                <Av name={me.name} s={22} />
                <div className="msg-w">
                  <div className="msg-top">
                    <span className="b sm">{mb?.address ?? me.name}</span>
                    <span className="sp" />
                    {sending ? <span className="chip"><Spinner s={11} />Sending…</span> : <Chip tone="ok" icon="check">Sent</Chip>}
                  </div>
                  <div className="faint msg-to">to {pending.to}</div>
                </div>
              </div>
              <div className="sm msg-b" dangerouslySetInnerHTML={{ __html: F.body(pending.body) }} />
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
              <div className="row" style={{ marginBottom: 8, gap: 8 }}>
                <span className="faint xs" style={{ width: 22 }}>To</span>
                <Inp className="sm" style={{ flex: 1 }} aria-label="Reply to" value={reply.to} onChange={v => setReply(r => (r ? { ...r, to: v } : r))} />
                {!reply.showCc && <Btn size="xs" kind="ghost" onClick={() => setReply(r => (r ? { ...r, showCc: true } : r))}>Cc/Bcc</Btn>}
              </div>
              {reply.showCc && (
                <>
                  <div className="row" style={{ marginBottom: 8, gap: 8 }}>
                    <span className="faint xs" style={{ width: 22 }}>Cc</span>
                    <Inp className="sm" style={{ flex: 1 }} aria-label="Cc" value={reply.cc} onChange={v => setReply(r => (r ? { ...r, cc: v } : r))} />
                  </div>
                  <div className="row" style={{ marginBottom: 8, gap: 8 }}>
                    <span className="faint xs" style={{ width: 22 }}>Bcc</span>
                    <Inp className="sm" style={{ flex: 1 }} aria-label="Bcc" value={reply.bcc} onChange={v => setReply(r => (r ? { ...r, bcc: v } : r))} />
                  </div>
                </>
              )}
              <RichText value={reply.body} onChange={v => setReply(r => (r ? { ...r, body: v } : r))} tokens={TOKENS} minH={120} label="Reply" />
              {live && (
                <div className="col" style={{ gap: 6, marginTop: 8 }}>
                  <Attachments files={reply.files} onChange={files => setReply(r => (r ? { ...r, files } : r))} disabled={sending} />
                  <SignatureLine mailboxId={reply.mailboxId} on={reply.sig} onChange={sig => setReply(r => (r ? { ...r, sig } : r))} />
                </div>
              )}
              {aiErr && <div className="sm" style={{ color: 'var(--bad)', marginTop: 6 }} role="alert">{aiErr}</div>}
              <div className="row wrap" style={{ marginTop: 8 }}>
                <ReplyMode state={mailState} canSend={!!Q.mailbox(reply.mailboxId)?.canSend} address={Q.mailbox(reply.mailboxId)?.address} />
                <span className="sp" />
                <Btn size="sm" disabled={!ct || !reply.mailboxId || sending} onClick={saveDraft}>Save draft</Btn>
                <Btn
                  size="sm" kind="pri" icon="send" onClick={() => void send()} loading={sending}
                  disabled={!reply.mailboxId || !mailDecided(mailState) || (live && !Q.mailbox(reply.mailboxId)?.canSend)}
                >{sending ? 'Sending…' : 'Send'}</Btn>
              </div>
            </div>
          ) : (
            !pending && <div className="row wrap">
              <Btn icon="reply" onClick={() => startReply()}>Reply</Btn>
              {othersOnLast && <Btn icon="users" onClick={() => startReply(undefined, true)}>Reply all</Btn>}
              <Btn icon="arrow" onClick={forward} disabled={!newest}>Forward</Btn>
              <Btn icon="send" kind="ghost" onClick={() => UI.open('compose', { threadId: t.id, contactId: t.contactId })}>Open in composer</Btn>
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
          {co && (
            <Card title={t.relation === 'customer' ? 'Customer account' : 'Company'}>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <CoLink id={co.id} />
                {standing.customer && <Chip tone="ok">Customer</Chip>}
              </div>
              {standing.why && <div className="faint xs" style={{ marginTop: 2 }}>{standing.why}</div>}
              {t.relation === 'customer' && <div className="sm" style={{ marginTop: 6 }}>This conversation is about their account with {biz?.name ?? 'us'}, not a sale.</div>}
              {can && t.relation === 'customer' && (
                <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                  <Btn size="xs" onClick={() => { Act.linkThreadCustomer(t.id, false); setLinking(true) }}>Link a deal instead</Btn>
                  <Btn size="xs" kind="ghost" onClick={() => { Act.linkThreadCustomer(t.id, false); UI.toast('No longer marked as about their account') }}>Unlink</Btn>
                </div>
              )}
              {can && t.relation !== 'customer' && standing.customer && (
                <Btn size="xs" style={{ marginTop: 6 }} onClick={() => { Act.linkThreadCustomer(t.id, true); setLinking(false); UI.toast('Linked to their customer account') }}>About their account, not a deal</Btn>
              )}
            </Card>
          )}
          {t.relation === 'customer' ? null : d ? (
            <Card title="Deal">
              <DlLink id={d.id} />
              <div className="faint xs">{Q.stage(d)?.name} · {F.money(d.value, 1)}</div>
              {can && (
                <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                  <Btn size="xs" onClick={() => setLinking(l => !l)}>{linking ? 'Cancel' : 'Change deal'}</Btn>
                  <Btn size="xs" kind="ghost" onClick={() => { Act.linkThreadDeal(t.id, null); UI.toast('Deal unlinked from this conversation') }}>Unlink</Btn>
                </div>
              )}
            </Card>
          ) : (co || can) && (
            <Card title="Deal">
              <div className="faint sm">No deal linked</div>
              {can && (
                <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                  <Btn size="xs" onClick={() => setLinking(l => !l)}>{linking ? 'Cancel' : 'Link existing deal'}</Btn>
                  {co && <Btn size="xs" onClick={() => UI.open('newDeal', { companyId: co.id, contactIds: ct ? [ct.id] : [], businessId: t.businessId })}>Create deal</Btn>}
                </div>
              )}
            </Card>
          )}
          {can && linking && <DealLinker t={t} onDone={() => setLinking(false)} />}
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

const size = (n: number): string => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')

/** What came with a Gmail message (its attachments, by name) and a way to open it in Gmail, where they can be downloaded. */
function MessageExtras({ m, address }: { m: Message; address?: string }) {
  if (!m.gmailId) return null
  const files = m.attachments ?? []
  const href = `https://mail.google.com/mail/${address ? `?authuser=${encodeURIComponent(address)}` : ''}#all/${encodeURIComponent(m.gmailId)}`
  return (
    <div className="row wrap xs" style={{ gap: 6, marginTop: 8 }}>
      {files.map((f, i) => <Chip key={i} icon="file" title={f.mime}>{f.name} · {size(f.size)}</Chip>)}
      <span className="sp" />
      <a className="faint" href={href} target="_blank" rel="noopener noreferrer">{files.length ? 'Open in Gmail to download' : 'Open in Gmail'}</a>
    </div>
  )
}

/** Says how this reply will go: through Gmail, not at all until sending is switched on, or simulated. */
function ReplyMode({ state, canSend, address }: { state: string; canSend: boolean; address?: string }) {
  if (state === 'live') {
    return canSend
      ? <><Chip tone="ok" icon="send">Sends through Gmail</Chip><span className="faint xs">From {address}.</span></>
      : <><Chip icon="lock">Sending is off</Chip><span className="faint xs">Switch it on for {address ?? 'this mailbox'} in Integrations.</span></>
  }
  if (state === 'error') return <><Chip tone="warn" icon="alert">Could not check Gmail</Chip><Btn size="xs" kind="ghost" onClick={recheckMailState}>Retry</Btn></>
  if (state === 'loading') return <span className="faint xs">Checking the mail connection…</span>
  return <><SimChip>Sending is simulated</SimChip><span className="faint xs">No real email is sent yet.</span></>
}

/** Pick an existing deal to link this conversation to: the same contact's and company's first, then search the rest of the business. */
function DealLinker({ t, onDone }: { t: Thread; onDone: () => void }) {
  const [q, setQ] = useState('')
  const choices = dealCandidates(t, S.deals.filter(d => Q.member(d.businessId)), { query: q, limit: 8, companyName: id => Q.company(id)?.name ?? '' })
  const pick = (id: string, name: string): void => { Act.linkThreadDeal(t.id, id); UI.toast('Linked to ' + name); onDone() }
  return (
    <Card title="Link to a deal">
      <SearchInp value={q} onChange={setQ} placeholder="Search deals" w={220} />
      <div className="col" style={{ gap: 4, marginTop: 8 }}>
        {choices.length === 0 && <div className="faint sm">{q ? 'No deals match.' : 'No other deals in ' + (Q.biz(t.businessId)?.name ?? 'this business') + '.'}</div>}
        {choices.map(c => (
          <button key={c.deal.id} type="button" className="ni" style={{ textAlign: 'left', display: 'block', padding: '6px 8px' }} onClick={() => pick(c.deal.id, c.deal.name)}>
            <div className="b sm">{c.deal.name}</div>
            <div className="faint xs">
              {Q.company(c.deal.companyId)?.name ?? ''} · {Q.stage(c.deal)?.name} · {F.money(c.deal.value, 1)}
              {c.why !== 'other' && <> · <span style={{ color: 'var(--acc-ink)' }}>{c.why === 'contact' ? 'this contact' : 'this company'}</span></>}
            </div>
          </button>
        ))}
      </div>
    </Card>
  )
}
