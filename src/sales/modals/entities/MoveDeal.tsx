import { useState } from 'react'
import { moveDealApi } from '../../api/deals'
import { SalesHttpError } from '../../api/http'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import { pollOnce } from '../../data/sync'
import type { BusinessId } from '../../data/types'
import { Banner, Btn, Fld, Sel } from '../../kit/basic'
import { Modal } from '../../kit/overlay'
import { CoSel, MultiCt } from '../../shared/forms'
import { UI } from '../../ui/store'

/**
 * Move a deal still in the pipeline to another company, another of our businesses, or both. Its open tasks, upcoming meetings,
 * suggestions and (where the mailbox allows) conversations go with it; it keeps its step in the pipeline. A won deal is a customer and
 * is not moved here.
 */
export function MoveDeal({ id }: { id: string }) {
  useStore()
  const d = Q.deal(id)
  const [b, setB] = useState<BusinessId | ''>(d?.businessId ?? '')
  const [co, setCo] = useState(d?.companyId ?? '')
  const [cts, setCts] = useState<string[]>(d?.contactIds ?? [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!d) return null
  const won = d.status === 'won'
  const bizOpts = Q.myBiz().filter(x => Q.canEdit(x)).map(x => [x, Q.biz(x)?.name ?? x] as const)
  const companyChanged = co !== d.companyId
  const bizChanged = b !== d.businessId
  const nothing = !companyChanged && !bizChanged
  const stage = Q.stage(d)
  const stepName = stage?.name ?? 'its step'
  // What will go with it (counted here; the server does the same and says what it actually moved).
  const tasks = S.tasks.filter(t => t.dealId === d.id && !Q.done(t)).length
  const meetings = S.meetings.filter(m => m.dealId === d.id && (m.status === 'upcoming' || !m.status)).length
  const threads = S.threads.filter(t => t.dealId === d.id).length
  const fromName = Q.biz(d.businessId)?.name ?? d.businessId
  const toName = b ? Q.biz(b)?.name ?? b : ''

  const go = async (): Promise<void> => {
    setErr('')
    if (!b || !co) return setErr('Choose where to move it')
    setBusy(true)
    try {
      const r = await moveDealApi(d.id, { ...(bizChanged ? { businessId: b } : {}), ...(companyChanged ? { companyId: co, contactIds: cts } : {}) })
      UI.close()
      const parts = [r.moved.tasks && `${r.moved.tasks} task${r.moved.tasks === 1 ? '' : 's'}`, r.moved.meetings && `${r.moved.meetings} meeting${r.moved.meetings === 1 ? '' : 's'}`, r.moved.threads && `${r.moved.threads} conversation${r.moved.threads === 1 ? '' : 's'}`].filter(Boolean)
      UI.toast(`Deal moved${bizChanged ? ` to ${toName}` : ''}${companyChanged ? ` to ${Q.company(co)?.name ?? 'the new company'}` : ''}${parts.length ? `, with ${parts.join(', ')}` : ''}.`)
      for (const n of r.notes) UI.toast(n, 'warn')
      void pollOnce()
    } catch (e) {
      setErr(e instanceof SalesHttpError ? e.message : 'Could not reach the server. Nothing was moved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Move deal"
      icon="swap"
      sub={d.title}
      width={560}
      footer={
        <>
          {err && <span className="sm" role="alert" style={{ color: 'var(--bad2)', flex: 1 }}>{err}</span>}
          <Btn onClick={UI.close} disabled={busy}>Cancel</Btn>
          <Btn kind="pri" icon="swap" onClick={() => void go()} loading={busy} disabled={won || nothing || !co}>{busy ? 'Moving…' : 'Move deal'}</Btn>
        </>
      }
    >
      {won ? (
        <Banner tone="info">This deal is won, so it is a customer now, with any billing and accounts that go with it. Only deals still in the pipeline can be moved.</Banner>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          <div className="grid g2">
            <Fld label="Business">
              <Sel value={b} onChange={v => setB(v as BusinessId)} options={bizOpts} />
            </Fld>
            <Fld label="Company">
              <CoSel value={co} b={1} onChange={v => { setCo(v); setCts(v === d.companyId ? d.contactIds : []) }} />
            </Fld>
          </div>
          {companyChanged && co && (
            <Fld label="Contacts on the deal" hint="People at the new company. Contacts at the old company stay with it, not on this deal.">
              <MultiCt companyId={co} value={cts} onChange={setCts} />
            </Fld>
          )}
          {!nothing && (
            <div className="card card-b sm col" style={{ gap: 6, background: 'var(--surf2)' }}>
              <b>What happens</b>
              {bizChanged && <span>It moves from {fromName} to {toName}, at the same step ({stepName}). Its value stays; fields only {fromName} has are dropped.</span>}
              {(tasks > 0 || meetings > 0) && <span>{[tasks && `${tasks} open task${tasks === 1 ? '' : 's'}`, meetings && `${meetings} upcoming meeting${meetings === 1 ? '' : 's'}`].filter(Boolean).join(' and ')} {tasks + meetings === 1 ? 'goes' : 'go'} with it.</span>}
              {bizChanged && threads > 0 && <span>Its conversations go with it when their mailbox also serves {toName}; any others stay in {fromName}.</span>}
              <span className="faint">Its history (calls, emails, stage changes) stays as it happened and still shows on the deal.</span>
              {bizChanged && d.businessId === 'ros' && <span className="faint">If Rosterio already has it as a lead, that lead stays in Rosterio: close it there if it should not be followed up.</span>}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
