import { useMemo, useState } from 'react'
import { classify, localAi } from '../../ai/client'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { BusinessId, Contact } from '../../data/types'
import { Banner, Btn, Ck, Empty, EST, Fld, Icon, Modal, Sel, TA } from '../../kit'
import { UI } from '../../ui/store'
import { NoEditModal } from '../entities/guards'

const SCEN: ReadonlyArray<readonly [string, string]> = [
  ['Interested', "Thanks for reaching out. This might actually be relevant. We're looking at replacing our current system. Can you send some information and perhaps organise a demo next week?"],
  ['Wants a meeting', 'Happy to catch up — are you available next Tuesday or Wednesday afternoon for a call?'],
  ['Needs more information', 'Could you send some more information and a case study? I will review it with the team.'],
  ['Pricing objection', 'Looks interesting but pricing would need to be competitive. What does it cost?'],
  ['Not right now', 'Not right now — we are locked in until next year. Could you revisit in Q2?'],
  ['Not interested', 'Thanks, but we are not interested. We are happy with our current setup.'],
  ['Wrong person', 'I am not the right person for this — I no longer work in operations.'],
  ['Referral to colleague', "Please speak to my colleague in HR who looks after this. I have cc'd her here."],
  ['Out of office', 'I am out of the office on annual leave, returning on 20 Oct. For urgent matters contact reception.'],
  ['Unsubscribe request', 'Please unsubscribe me and do not contact me again.'],
  ['Delivery failure', 'Delivery Status Notification (Failure): your message could not be delivered. The address was not found.'],
]
const LIVE = ['active', 'awaiting_task', 'paused']
const textFor = (name: string): string => (SCEN.find(x => x[0] === name) ?? SCEN[0])[1]

interface Props { contactId?: string; scenario?: string; enrolmentId?: string; threadId?: string }

export function SimReply(p: Props) {
  if (!Q.anyEdit()) return <NoEditModal title="Simulate incoming reply" what="record replies" />
  return <SimReplyForm p={p} />
}

function SimReplyForm({ p }: { p: Props }) {
  useStore()
  const uniq = useMemo(() => {
    const ids = S.enrolments.filter(e => Q.inScope(e.businessId)).map(e => e.contactId).concat(S.threads.filter(t => Q.inScope(t.businessId)).map(t => t.contactId ?? ''))
    if (p.contactId) ids.push(p.contactId)
    return [...new Set(ids.filter(Boolean))].map(Q.contact).filter((c): c is Contact => !!c).sort((a, b) => a.name.localeCompare(b.name))
  }, [p.contactId])
  const [cid, setC] = useState(p.contactId ?? uniq[0]?.id ?? '')
  const [sc, setSc] = useState(p.scenario ?? 'Interested')
  const [txt, setT] = useState(textFor(p.scenario ?? 'Interested'))
  const [glob, setG] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ct = Q.contact(cid)
  const enr = S.enrolments.filter(e => e.contactId === cid)
  const live = enr.find(e => LIVE.includes(e.status))
  const liveSeq = live ? Q.seq(live.seqId) : undefined
  const pv = localAi.classify(txt)

  const deliver = async (): Promise<void> => {
    if (!ct) return
    setBusy(true)
    setErr('')
    try {
      const biz: BusinessId | undefined = (p.threadId ? Q.thread(p.threadId)?.businessId : undefined) ?? live?.businessId ?? Q.primaryBiz(ct)
      const c = biz ? await classify(txt, biz) : undefined
      const t = Act.simulateReply({ contactId: cid, text: txt, global: glob, enrolmentId: p.enrolmentId, threadId: p.threadId, businessId: biz, classification: c?.value })
      UI.close()
      if (!t) return UI.toast('Could not record the reply. The contact needs an enrolment, a thread or a mailbox for this business.', 'bad')
      UI.toast('Reply received from ' + ct.name + (t.classification ? ' — classified ' + t.classification.cat : ''), undefined, { label: 'Open in inbox', fn: () => UI.nav('inbox', { id: t.id }) })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not classify the reply')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Simulate incoming reply"
      icon="reply"
      width={620}
      sub="Demo control. Delivers a reply as if the contact had written it."
      footer={uniq.length ? <><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" disabled={busy || !ct || !txt.trim()} onClick={() => void deliver()}>{busy ? 'Delivering…' : 'Deliver reply'}</Btn></> : <Btn onClick={UI.close}>Close</Btn>}
    >
      {!uniq.length ? (
        <Empty icon="reply" title="Nobody to reply yet" body="A simulated reply needs a contact who has been emailed or enrolled in a sequence." />
      ) : (
        <div className="col gap12">
          <Fld label="Contact"><Sel value={cid} onChange={setC} options={uniq.map(c => [c.id, c.name + ' · ' + (Q.company(c.companyId)?.name ?? '')] as const)} /></Fld>
          {ct && (
            <div className="faint sm">
              {live && liveSeq ? 'Active in “' + liveSeq.name + '” (' + (EST[live.status]?.[0] ?? live.status) + ')' : enr.length ? 'Previously enrolled — no active sequence' : 'Not enrolled; reply will attach to latest thread'}
            </div>
          )}
          <Fld label="Scenario"><Sel value={sc} onChange={v => { setSc(v); setT(textFor(v)) }} options={SCEN.map(x => x[0])} /></Fld>
          <Fld label="Message content"><TA value={txt} onChange={setT} rows={4} /></Fld>
          {pv.cat === 'Unsubscribe' && <Ck checked={glob} onChange={setG}>Apply as global suppression (all businesses)</Ck>}
          <div className="ai card-b row">
            <Icon n="spark" s={14} style={{ color: '#7C3AED' }} />
            <span className="sm">Quick estimate: <b>{pv.cat}{pv.secondary ? ' / ' + pv.secondary : ''}</b> ({Math.round(pv.conf * 100)}%). The final classification is set when the reply is delivered.</span>
          </div>
          {err && <Banner tone="bad" action={<Btn size="sm" onClick={() => void deliver()}>Retry</Btn>}>{err}</Banner>}
        </div>
      )}
    </Modal>
  )
}
