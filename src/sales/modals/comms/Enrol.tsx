import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import { Banner, BizDot, Btn, Ck, Empty, Fld, Icon, Inp, Modal, SearchInp, Sel } from '../../kit'
import { UI } from '../../ui/store'
import { NoEditModal } from '../entities/guards'

interface Props { contactIds?: string[]; seqId?: string }

export function Enrol(p: Props) {
  if (!Q.anyEdit()) return <NoEditModal title="Enrol in sequence" what="enrol contacts" />
  return <EnrolFlow p={p} />
}

function EnrolFlow({ p }: { p: Props }) {
  useStore()
  const [step, setStep] = useState(p.contactIds?.length && p.seqId ? 2 : 1)
  const [ids, setIds] = useState<string[]>(p.contactIds ?? [])
  const seqs = S.sequences.filter(s => Q.editScope().includes(s.businessId) && s.status !== 'archived')
  const [seqId, setSeq] = useState(p.seqId ?? seqs.find(s => s.status === 'active')?.id ?? '')
  const seq = Q.seq(seqId)
  const [mbPick, setMb] = useState('')
  const mbId = mbPick || seq?.mailboxId || ''
  const [start, setStart] = useState(F.nowIso().slice(0, 16))
  const [prev, setPrev] = useState(0)
  const [q, setQ] = useState('')

  const rows = ids.flatMap(i => {
    const ct = Q.contact(i)
    return ct ? [{ ct, el: Q.eligibility(i, seqId, mbId) }] : []
  })
  const ok = rows.filter(r => !r.el.blocks.length)
  const me = Q.me()
  const mbs = seq ? S.mailboxes.filter(m => m.businessIds.includes(seq.businessId) && (m.type === 'shared' ? m.authorised.includes(me.id) || Q.isSuper() : m.ownerId === me.id || m.ownerId === seq.ownerId)) : []
  const pc = ok[prev]?.ct ?? rows[0]?.ct
  const first = seq?.steps.find(s => s.type === 'email')
  const tok = pc && seq ? Q.tokens(pc, Q.senderOf(Q.mailbox(mbId)), seq.businessId) : {}
  const needle = q.toLowerCase()
  const matches = Q.contacts().filter(c => !needle || c.name.toLowerCase().includes(needle) || (Q.company(c.companyId)?.name ?? '').toLowerCase().includes(needle))
  const pool = matches.slice(0, 60)

  const go = (): void => {
    if (!seq) return
    const r = Act.enrol(ok.map(x => x.ct.id), seqId, { mailboxId: mbId, start: start.replace(' ', 'T') })
    UI.close()
    UI.toast(r.ok.length + ' enrolled in “' + seq.name + '”' + (r.skipped.length ? ' · ' + r.skipped.length + ' skipped' : ''), r.ok.length ? undefined : 'warn', {
      label: 'View sequence',
      fn: () => UI.nav('sequence', { id: seqId, q: { tab: 'enrolments' } }),
    })
  }

  return (
    <Modal
      title="Enrol in sequence"
      icon="send"
      width={760}
      footer={
        step === 1 || !seq ? (
          <>
            <Btn onClick={UI.close}>Cancel</Btn>
            <Btn kind="pri" disabled={!ids.length || !seqId} onClick={() => setStep(2)}>Review eligibility</Btn>
          </>
        ) : (
          <>
            <Btn onClick={() => setStep(1)}>Back</Btn>
            <span className="sp" />
            <span className="sm muted">{ok.length} of {rows.length} eligible</span>
            <Btn kind="pri" disabled={!ok.length} onClick={go}>Enrol {ok.length} contact{ok.length !== 1 ? 's' : ''}</Btn>
          </>
        )
      }
    >
      {!seqs.length ? (
        <Empty icon="send" title="No sequences yet" body="Create a sequence first, then come back to enrol contacts into it." action={<Btn onClick={() => { UI.close(); UI.nav('sequences') }}>Open sequences</Btn>} />
      ) : step === 1 || !seq ? (
        <div className="col gap12">
          <div className="grid g2">
            <Fld label="Sequence">
              <Sel value={seqId} onChange={v => { setSeq(v); setMb('') }} placeholder="Select…" options={seqs.map(s => [s.id, (Q.biz(s.businessId)?.name ?? '') + ' · ' + s.name + (s.status !== 'active' ? ' (' + s.status + ')' : '')] as const)} />
            </Fld>
            <Fld label="Start"><Inp type="datetime-local" value={start} onChange={setStart} /></Fld>
          </div>
          <Fld label={'Contacts (' + ids.length + ' selected)'}>
            <SearchInp value={q} onChange={setQ} placeholder="Search contacts" w={2000} />
            {pool.length ? (
              <div className="col" style={{ gap: 2, maxHeight: 280, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 7, padding: 6, marginTop: 6 }}>
                {pool.map(c => (
                  <Ck key={c.id} checked={ids.includes(c.id)} onChange={v => setIds(v ? ids.concat(c.id) : ids.filter(x => x !== c.id))}>
                    <span className="sm">{c.name} <span className="faint">· {c.title} · {Q.company(c.companyId)?.name}</span></span>
                  </Ck>
                ))}
                {matches.length > pool.length && <div className="faint xs" style={{ padding: 4 }}>Showing the first {pool.length} of {matches.length}. Search to narrow the list.</div>}
              </div>
            ) : (
              <div style={{ marginTop: 6 }}>
                <Empty icon="users" title={needle ? 'No contacts match' : 'No contacts yet'} body={needle ? 'Try a different name or company.' : 'Add or import contacts before enrolling them.'} />
              </div>
            )}
          </Fld>
        </div>
      ) : (
        <div className="col gap12">
          <div className="grid g3">
            <Fld label="Sequence">
              <div className="row"><BizDot b={seq.businessId} /><b>{seq.name}</b></div>
              <div className="faint xs">{seq.steps.length} steps · email steps become tasks to send</div>
            </Fld>
            <Fld label="Sender mailbox">
              {mbs.length ? (
                <Sel value={mbId} onChange={setMb} options={mbs.map(m => [m.id, m.address + (m.status !== 'connected' ? ' (disconnected)' : '')] as const)} />
              ) : (
                <Banner tone="warn">No mailbox is available to you for this sequence.</Banner>
              )}
            </Fld>
            <Fld label="Start"><div>{F.dt(start)}</div></Fld>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="tbl">
              <thead><tr><th scope="col">Contact</th><th scope="col">Eligibility</th></tr></thead>
              <tbody>
                {rows.map(({ ct, el }) => (
                  <tr key={ct.id}>
                    <td><b>{ct.name}</b><div className="faint xs">{ct.email || 'no email'} · {Q.company(ct.companyId)?.name}</div></td>
                    <td className="w">
                      {el.blocks.map(x => (
                        <div key={x} className="row sm" style={{ color: 'var(--bad2)' }}>
                          <Icon n="stop" s={12} />{x}
                          {x.startsWith('No outreach permission') && Q.canEdit(seq.businessId) && (
                            <Btn size="xs" onClick={() => Act.setPermission(ct.id, 'Legitimate business interest')}>Record: legitimate business interest</Btn>
                          )}
                        </div>
                      ))}
                      {el.warns.map(x => <div key={x} className="row sm" style={{ color: 'var(--warn)' }}><Icon n="alert" s={12} />{x}</div>)}
                      {!el.blocks.length && !el.warns.length && <span className="row sm" style={{ color: 'var(--ok)' }}><Icon n="check" s={12} />Eligible</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {first && pc && (
            <div className="card card-b" style={{ background: 'var(--surf2)' }}>
              <div className="row xs faint" style={{ marginBottom: 6 }}>
                <Icon n="eye" s={12} />First email preview for
                <Sel className="sm" style={{ width: 200 }} aria-label="Preview contact" value={String(prev)} onChange={v => setPrev(+v)} options={ok.map((r, i) => [String(i), r.ct.name] as const)} />
              </div>
              <div className="b sm">{Q.render(first.subject, tok).text}</div>
              <div className="sm" style={{ marginTop: 6, maxHeight: 180, overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: F.body(Q.render(first.body, tok).text) }} />
            </div>
          )}
          <Banner tone="info">Each email step becomes a task for the owner to copy and send by hand. SalesOS does not send email.</Banner>
        </div>
      )}
    </Modal>
  )
}
