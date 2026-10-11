import { useState } from 'react'
import { draft as aiDraft, suggestReply, type AiTag } from '../../ai/client'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { BusinessId, Thread } from '../../data/types'
import { AiBadge, AiNotConfigured, Banner, Btn, Chip, Fld, Icon, Inp, Menu, Modal, RichText, Sel, TOKENS } from '../../kit'
import { BizSel, useF } from '../../shared/forms'
import { UI } from '../../ui/store'
import { NoEditModal } from '../entities/guards'
import { Openers, withOpener } from './Openers'

interface Props {
  threadId?: string
  contactId?: string
  businessId?: BusinessId
  mailboxId?: string
  subject?: string
  body?: string
  dealId?: string
  draftId?: string
  ai?: AiTag
}
interface ComposeForm { mailboxId: string; contactId: string; to: string; cc: string; subject: string; body: string; dealId: string; companyId: string }

export function Compose(p: Props) {
  useStore()
  const t = p.threadId ? Q.thread(p.threadId) : undefined
  const ct0 = Q.contact(p.contactId ?? t?.contactId)
  const b0 = t?.businessId ?? p.businessId ?? (ct0 ? Q.primaryBiz(ct0) : undefined) ?? Q.defaultBiz()
  const start = b0 && Q.canEdit(b0) ? b0 : Q.defaultBiz()
  if (!start) return <NoEditModal title={t ? 'Reply' : 'Compose email'} what="send email" />
  return <ComposeForm p={p} t={t} start={start} />
}

function ComposeForm({ p, t, start }: { p: Props; t: Thread | undefined; start: BusinessId }) {
  const ct0 = Q.contact(p.contactId ?? t?.contactId)
  const [b, setB] = useState<BusinessId>(start)
  const mbs = Q.myMailboxes(b)
  const [f, set] = useF<ComposeForm>(() => ({
    mailboxId: p.mailboxId || (t && mbs.find(m => m.id === t.mailboxId) ? t.mailboxId : (mbs.find(m => m.type === 'personal') ?? mbs[0])?.id) || '',
    contactId: ct0?.id ?? '', to: ct0?.email ?? '', cc: '', subject: p.subject ?? (t ? 'Re: ' + t.subject.replace(/^Re: /, '') : ''), body: p.body ?? '',
    dealId: p.dealId ?? t?.dealId ?? '', companyId: ct0?.companyId ?? t?.companyId ?? '',
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [tag, setTag] = useState<AiTag | undefined>(p.ai)
  const mb = Q.mailbox(f.mailboxId)
  const ct = Q.contact(f.contactId)
  const sender = Q.senderOf(mb)
  const tok = Q.tokens(ct, sender, b)
  const pr = Q.render(f.subject + ' ' + F.plain(f.body), tok)
  const sup = ct ? Q.suppressed(ct, b) : null
  const tpls = S.templates.filter(x => x.businessId === b)
  const contacts = Q.contacts().filter(c => Q.contactBiz(c).includes(b)).sort((a, c) => a.name.localeCompare(c.name))
  const bizName = Q.biz(b)?.name ?? b

  const send = (asDraft: boolean): void => {
    setErr('')
    if (!asDraft) {
      if (!f.to || !/@/.test(f.to)) return setErr('Add a valid recipient')
      if (!f.subject.trim()) return setErr('Add a subject')
      if (!mb) return setErr('No authorised sender mailbox for ' + bizName)
      if (mb.status !== 'connected') return setErr('The mailbox ' + mb.address + ' is disconnected. Reconnect it in Integrations, or choose another sender.')
      if (sup && ct) return setErr(ct.name + ' is suppressed (' + sup.reason.toLowerCase() + '). Outreach is blocked.')
      if (pr.missing.length) return setErr('Unresolved personalisation: {{' + pr.missing.join('}}, {{') + '}}. Edit the email or complete the contact record.')
    }
    if (!mb) return setErr('Choose a sender mailbox before saving a draft')
    if (!UI.guard(b, 'Sending email')) return
    const r = Act.sendEmail({
      businessId: b, mailboxId: f.mailboxId, to: f.to, cc: f.cc, subject: Q.render(f.subject, tok).text, body: Q.render(f.body, tok).text,
      contactId: f.contactId || undefined, companyId: f.companyId || undefined, dealId: f.dealId || null, threadId: t?.id, draft: asDraft, draftId: p.draftId,
    })
    if (!r.ok) return setErr(r.reason === 'suppressed' ? `${r.detail}. Outreach to a suppressed address is blocked.` : 'Choose a sender mailbox before sending')
    UI.close()
    UI.toast(asDraft ? 'Draft saved' : 'Email sent (simulated) from ' + mb.address, undefined, { label: 'View thread', fn: () => UI.nav('inbox', { id: r.thread.id }) })
  }

  const draftIt = async (): Promise<void> => {
    if (!ct) return setErr('Select a contact to draft for')
    setErr('')
    setBusy(true)
    try {
      const deal = f.dealId ? Q.deal(f.dealId) : undefined
      const purpose = deal && F.days(deal.lastActivity, F.nowIso()) > 7 ? 'stale' : t ? 'follow' : 'intro'
      const r = t && t.classification ? await suggestReply(t) : await aiDraft(ct, b, purpose, { deal })
      set({ subject: f.subject || r.value.subject, body: r.value.body })
      setTag(r.ai)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not draft this email. Try again or write it yourself.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t ? 'Reply' : 'Compose email'}
      icon="mail"
      width={720}
      sub={<span className="row" style={{ gap: 6 }}><Chip icon="spark" title="Mail is recorded in SalesOS but not delivered over SMTP yet.">Sending is simulated</Chip> No email leaves SalesOS.</span>}
      footer={
        <>
          {err && <span className="sm" role="alert" style={{ color: 'var(--bad2)', flex: 1 }}>{err}</span>}
          <Btn onClick={UI.close}>Cancel</Btn>
          <Btn onClick={() => send(true)} disabled={!mb}>Save draft</Btn>
          <Btn kind="pri" icon="send" onClick={() => send(false)} disabled={!mb}>Send (simulated)</Btn>
        </>
      }
    >
      <div className="col" style={{ gap: 10 }}>
        <div className="grid g2">
          <Fld label="Business"><BizSel value={b} onChange={v => { setB(v as BusinessId); set('mailboxId', Q.myMailboxes(v)[0]?.id ?? '') }} /></Fld>
          <Fld label="From">
            {mbs.length ? (
              <Sel value={f.mailboxId} onChange={v => set('mailboxId', v)} options={mbs.map(m => [m.id, m.address + (m.type === 'shared' ? ' (shared)' : ' (personal)') + (m.status !== 'connected' ? ' — disconnected' : '')] as const)} />
            ) : (
              <Banner tone="warn" action={<Btn size="sm" onClick={() => { UI.close(); UI.nav('integrations') }}>Integrations</Btn>}>No authorised mailbox for {bizName}. Connect one to send.</Banner>
            )}
          </Fld>
        </div>
        {mb && mb.status !== 'connected' && (
          <Banner tone="bad" action={<Btn size="sm" onClick={() => { UI.close(); UI.nav('integrations') }}>Reconnect</Btn>}>Mailbox {mb.address} is disconnected.</Banner>
        )}
        <div className="grid g2">
          <Fld label="Contact" hint={!contacts.length ? 'No contacts for this business yet' : undefined}>
            <Sel
              value={f.contactId}
              onChange={v => { const c = Q.contact(v); set({ contactId: v, to: c?.email ?? '', companyId: c?.companyId ?? '' }) }}
              placeholder="—"
              options={contacts.map(c => [c.id, c.name + ' · ' + (Q.company(c.companyId)?.name ?? '')] as const)}
            />
          </Fld>
          <Fld label="To"><Inp value={f.to} onChange={v => set('to', v)} type="email" /></Fld>
        </div>
        {sup && ct && <Banner tone="bad">{ct.name} has a {sup.scope} suppression ({sup.reason}). Sending is blocked.</Banner>}
        {ct && !ct.email && <Banner tone="warn" action={<Btn size="sm" icon="zap" onClick={() => UI.open('enrich', { contactId: ct.id })}>Enrich</Btn>}>This contact has no email address.</Banner>}
        <div className="grid g2">
          <Fld label="Cc"><Inp value={f.cc} onChange={v => set('cc', v)} /></Fld>
          <Fld label="Related deal"><Sel value={f.dealId} onChange={v => set('dealId', v)} placeholder="—" options={S.deals.filter(d => d.companyId === f.companyId && d.businessId === b).map(d => [d.id, d.title] as const)} /></Fld>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <Fld label="Subject" style={{ flex: 1 }}><Inp value={f.subject} onChange={v => set('subject', v)} /></Fld>
          <Fld label="Template">
            <Menu
              align="right"
              trigger={<Btn iconRight="down" icon="file">Insert</Btn>}
              items={tpls.length ? tpls.map(x => ({ label: x.name, right: x.category, onClick: () => set({ subject: f.subject || x.subject, body: x.body }) })) : [{ label: 'No templates for ' + bizName + ' yet', disabled: true }]}
            />
          </Fld>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <AiNotConfigured />
          <AiBadge tag={tag} />
        </div>
        <Openers key={b + '|' + f.companyId + '|' + f.contactId} b={b} companyId={f.companyId || undefined} contactId={f.contactId || undefined} onInsert={line => set('body', withOpener(f.body, line))} />
        <RichText value={f.body} onChange={v => set('body', v)} tokens={TOKENS} onAI={() => void draftIt()} aiBusy={busy} />
        {ct && (f.body.includes('{{') || f.subject.includes('{{')) && (
          <div className="card card-b" style={{ background: 'var(--surf2)' }}>
            <div className="row xs faint" style={{ marginBottom: 6 }}>
              <Icon n="eye" s={12} />Preview for {ct.name}
              {pr.missing.length > 0 && <Chip tone="warn">Missing: {pr.missing.join(', ')}</Chip>}
            </div>
            <div className="b sm">{Q.render(f.subject, tok).text}</div>
            <div className="sm" style={{ marginTop: 6 }} dangerouslySetInnerHTML={{ __html: F.body(Q.render(f.body, tok).text) }} />
          </div>
        )}
      </div>
    </Modal>
  )
}
