import { useState } from 'react'
import { Btn, BizDot } from '../kit/basic'
import { Menu } from '../kit/overlay'
import { RichText } from '../kit/RichText'
import { Inp } from '../kit/basic'
import { Act } from '../data/Act'
import { F } from '../data/F'
import { Q } from '../data/Q'
import type { Message } from '../data/types'
import { UI } from '../ui/store'

export function Approval({ m }: { m: Message }) {
  const e = Q.enrol(m.enrolmentId)
  const seq = Q.seq(e?.seqId)
  const c = Q.contact(e?.contactId)
  const [ed, setEd] = useState(false)
  const [sj, setSj] = useState(m.subject)
  const [bd, setBd] = useState(m.body)
  const [open, setOpen] = useState(false)
  if (!e || !seq || !c) return null
  const approve = () => {
    const r = Act.approveMsg(m.id, ed ? { subject: sj, body: bd } : undefined)
    UI.toast(r === 'blocked' ? 'Blocked: contact is suppressed' : 'Approved — email sent (simulated) to ' + c.name, r === 'blocked' ? 'bad' : undefined)
  }
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
      <div className="row wrap">
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="row" style={{ gap: 6 }}><BizDot b={e.businessId} /><b className="sm">{c.name}</b><span className="faint sm">· {Q.company(c.companyId)?.name}</span></div>
          <div className="sm trunc">{m.subject}</div>
          <div className="faint xs">{seq.name} · step {e.stepIdx + 1} of {seq.steps.length} · from {m.from} · queued {F.rel(m.ts)}</div>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <Btn size="sm" kind="ghost" icon="eye" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Preview'}</Btn>
          <Btn size="sm" icon="edit" onClick={() => { setOpen(true); setEd(true) }}>Edit</Btn>
          <Btn size="sm" kind="pri" icon="send" onClick={approve}>Approve & send</Btn>
          <Menu
            align="right"
            trigger={<Btn size="sm" kind="ghost" icon="more" aria-label="More actions" />}
            items={[
              { label: 'Snooze 1 day', icon: 'clock', onClick: () => { Act.snoozeMsg(m.id, 24); UI.toast('Snoozed') } },
              { label: 'Reject (skip step)', icon: 'x', onClick: () => { Act.rejectMsg(m.id); UI.toast('Step skipped') } },
              { label: 'Pause enrolment', icon: 'pause', onClick: () => Act.setEnrol(e.id, 'paused', 'Paused from approval queue') },
            ]}
          />
        </div>
      </div>
      {open && (
        <div className="card card-b" style={{ marginTop: 8, background: 'var(--surf2)' }}>
          {ed ? (
            <div className="col"><Inp value={sj} onChange={setSj} aria-label="Subject" /><RichText value={bd} onChange={setBd} minH={120} /></div>
          ) : (
            <><div className="b sm">{m.subject}</div><div className="sm" style={{ marginTop: 6 }} dangerouslySetInnerHTML={{ __html: F.body(m.body) }} /></>
          )}
        </div>
      )}
    </div>
  )
}
