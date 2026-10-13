import { useEffect, useRef, useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId, Company } from '../../data/types'
import { Banner, Btn, Chip, Fld, Inp, Seg, Sel } from '../../kit/basic'
import { Modal } from '../../kit/overlay'
import { ENGAGEMENT_LABEL, ENGAGEMENT_TYPES } from '../../shared/billing'
import { norm } from '../../shared/constants'
import { BizSel, useF } from '../../shared/forms'
import type { SetF } from '../../shared/useF'
import { formatCents, parseCents } from '../../shared/money'
import { checkRecordWon, creatingContact, NEW_CONTACT, splitName, wonDateProblem, WON_DATE_FUTURE, type RecordWonDraft, type RecordWonErrors } from '../../shared/recordWon'
import { UI } from '../../ui/store'
import { NoEditModal } from './guards'
import { findDuplicate } from './NewCompany'

export interface RecordWonProps { companyId?: string; businessId?: BusinessId }

interface Draft extends RecordWonDraft { businessId: BusinessId }

/** "2026-03-03" -> "3 Mar 2026", and the month it counts in, "March 2026". */
function dayText(day: string): { day: string; month: string } {
  const [y, m, d] = day.split('-').map(Number)
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return { day: `${d} ${F.M[m - 1]} ${y}`, month }
}

/** Companies in the businesses the person belongs to, as the company pickers list them. */
const pickable = (): Company[] => S.companies.filter(c => !c.archived && Q.relsOf(c.id).some(r => Q.member(r.businessId)))

export function RecordWon({ companyId, businessId }: RecordWonProps) {
  const b0 = businessId && Q.canEdit(businessId) ? businessId : Q.defaultBiz()
  if (!b0) return <NoEditModal title="Record a won deal" what="record won deals" />
  const co = companyId ? Q.company(companyId) : undefined
  return <RecordWonForm b0={b0} company={co && !co.archived ? co : undefined} />
}

function RecordWonForm({ b0, company }: { b0: BusinessId; company?: Company }) {
  const [f, set] = useF<Draft>({
    businessId: b0, companyId: company?.id ?? '', companyName: company?.name ?? '', newCompany: false,
    contactId: '', contactName: '', contactEmail: '', title: '', wonOn: F.today(), amount: '', engagementType: 'fixed-price',
  })
  const [err, setErr] = useState<RecordWonErrors>({})
  const [fail, setFail] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const body = useRef<HTMLDivElement>(null)
  const today = F.today()
  const b = f.businessId
  // The contract is frozen here only for Ardorio admins; anyone else who can edit Ardorio records the won value, and an
  // admin sets the contract later from the Billing tab.
  const contract = b === 'ard' && Q.canBill()
  const hasWon = Q.pipeline(b).stages.some(s => s.won)
  const contacts = f.companyId ? S.contacts.filter(c => c.companyId === f.companyId && !c.archived) : []
  const newContact = creatingContact(f)
  // A future won date is said at once, next to the field; the other checks wait for Record.
  const wonErr = err.wonOn ?? (f.wonOn > today ? WON_DATE_FUTURE : undefined)

  // After a refused save, move focus to the first field that needs fixing.
  useEffect(() => {
    if (tries) body.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [tries])

  const save = (): void => {
    setFail(null)
    const c = checkRecordWon(f, today, contract)
    if (!c.ok) {
      setErr(c.errs)
      setTries(t => t + 1)
      return
    }
    setErr({})
    if (!UI.guard(b, 'Recording won deals')) return
    const contact = newContact
      ? { ...splitName(f.contactName), email: f.contactEmail.trim().toLowerCase() }
      : f.contactId ? { id: f.contactId } : null
    const r = Act.recordWonDeal({
      businessId: b, company: f.newCompany ? { name: f.companyName.trim() } : { id: f.companyId }, contact, title: f.title, wonOn: f.wonOn,
      amountCents: c.amountCents, engagementType: contract ? f.engagementType : null,
    })
    if (!r.ok) return setFail(r.error)
    UI.close()
    UI.nav('deal', r.contract ? { id: r.deal.id, q: { tab: 'billing' } } : { id: r.deal.id })
    if (r.contractError) UI.toast(`Won deal recorded, but the contract was not saved: ${r.contractError}`, 'bad')
    else if (r.contract) UI.toast(`Won deal recorded. Contract of ${formatCents(c.amountCents)} ex GST set.`)
    else UI.toast('Won deal recorded')
  }

  const cents = parseCents(f.amount)
  const date = !wonDateProblem(f.wonOn, today) ? dayText(f.wonOn) : null
  const creates = [f.newCompany && 'the company', newContact && 'contact'].filter(Boolean).join(' and ')
  const amountLabel = contract ? 'Contracted amount (A$, ex GST)' : b === 'ard' ? 'Won value (A$, ex GST)' : 'Final contract value (A$)'
  const amountHint = contract
    ? 'Frozen as the contract baseline. Change it later only with a variation.'
    : b === 'ard' ? 'An Ardorio admin sets the contract from the deal’s Billing tab.' : 'Annual value; MRR is derived'

  return (
    <Modal
      title="Record a won deal"
      icon="star"
      width={720}
      footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" onClick={save} disabled={!hasWon}>Record won deal</Btn></>}
    >
      <div ref={body} className="col" style={{ gap: 14 }}>
        <div className="sm muted">For work you have already won, including past deals. It skips the pipeline stages and goes straight to Won.</div>
        {fail && <Banner tone="bad">{fail}</Banner>}
        {!hasWon && <Banner tone="warn">The {Q.pipeline(b).name} pipeline has no Won stage yet. An administrator needs to add one.</Banner>}
        {Q.editScope().length > 1 && (
          <Fld label="Business pipeline">
            <BizSel value={b} onChange={v => set({ businessId: v as BusinessId })} />
          </Fld>
        )}

        <CompanyPick f={f} set={set} err={err.company} locked={company} />

        <div className="grid g2">
          {f.companyId && !f.newCompany && (
            <Fld label="Contact (optional)">
              <Sel
                value={f.contactId}
                onChange={v => set({ contactId: v, contactName: '', contactEmail: '' })}
                placeholder="No contact"
                options={[...contacts.map(c => [c.id, c.title ? `${c.name}, ${c.title}` : c.name] as const), [NEW_CONTACT, '+ New contact'] as const]}
              />
            </Fld>
          )}
          {(f.newCompany || f.contactId === NEW_CONTACT) && (
            <>
              <Fld label={f.newCompany ? 'Contact name (optional)' : 'Contact name'} err={err.contactName} hint={f.newCompany ? 'Created on the new company.' : null}>
                <Inp value={f.contactName} onChange={v => set('contactName', v)} placeholder="e.g. Dana Wong" aria-invalid={err.contactName ? true : undefined} />
              </Fld>
              <Fld label="Contact email (optional)" err={err.contactEmail}>
                <Inp type="email" value={f.contactEmail} onChange={v => set('contactEmail', v)} aria-invalid={err.contactEmail ? true : undefined} />
              </Fld>
            </>
          )}
          <Fld label="Deal title" req err={err.title} style={f.companyId && !f.newCompany && f.contactId !== NEW_CONTACT ? undefined : { gridColumn: '1/-1' }}>
            <Inp value={f.title} onChange={v => set('title', v)} placeholder={f.companyName.trim() ? `${f.companyName.trim()}, project build` : 'e.g. Fleet dashboard build'} aria-invalid={err.title ? true : undefined} />
          </Fld>
          <Fld label="Won date" req err={wonErr} hint="Past dates are fine. A future date is refused.">
            <Inp type="date" max={today} value={f.wonOn} onChange={v => set('wonOn', v)} aria-invalid={wonErr ? true : undefined} />
          </Fld>
          <Fld label={amountLabel} req err={err.amount} hint={amountHint}>
            <Inp className="mono" inputMode="decimal" value={f.amount} onChange={v => set('amount', v)} placeholder="120000" aria-invalid={err.amount ? true : undefined} />
          </Fld>
        </div>

        {contract && (
          <div className="fld">
            <span className="lbl" style={{ fontSize: 12, fontWeight: 600 }}>Engagement type</span>
            <Seg label="Engagement type" value={f.engagementType} onChange={v => set('engagementType', v as Draft['engagementType'])} opts={ENGAGEMENT_TYPES.map(t => [t, ENGAGEMENT_LABEL[t]] as const)} />
            {err.engagementType ? <div className="err" role="alert">{err.engagementType}</div> : <div className="hint">Shapes how billing is set up. No recurring revenue is counted for Ardorio.</div>}
          </div>
        )}

        <div className="card" style={{ boxShadow: 'none', background: 'var(--surf2)' }} aria-label="What recording does" role="group">
          <div className="card-b col" style={{ gap: 6 }}>
            <div className="b sm">What recording does</div>
            <div className="sm">
              Creates {creates ? `${creates}, and ` : ''}the deal straight in <b>Won</b>{date ? <> on {date.day}</> : null}.
            </div>
            {cents !== null && cents > 0 && date && (
              <div className="sm">
                {contract
                  ? <>Freezes a contract baseline of <b className="money">{formatCents(cents)}</b> ex GST and counts it as Won value in {date.month}.</>
                  : <>Counts <b className="money">{formatCents(cents)}</b> as Won value in {date.month}.</>}
              </div>
            )}
            <div className="sm muted">
              The activity log says “Recorded as won directly by {Q.me().name}”.
              {contract ? ' Add milestones and any money already invoiced from the deal’s Billing tab.' : ''}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/** Pick a company, or create one by name only. A name that matches an existing company offers that one instead of a copy. */
function CompanyPick({ f, set, err, locked }: { f: Draft; set: SetF<Draft>; err?: string; locked?: Company }) {
  if (locked) {
    return (
      <Fld label="Company">
        <Inp id="rw-company" value={locked.name} readOnly />
      </Fld>
    )
  }
  const q = f.companyName.trim()
  const n = norm(q)
  const picked = f.companyId ? Q.company(f.companyId) : undefined
  const open = !!q && !picked && !f.newCompany
  const matches = open ? pickable().filter(c => norm(c.name).includes(n)).sort((a, c) => a.name.localeCompare(c.name)).slice(0, 6) : []
  const dup = open ? findDuplicate(q, '') : undefined
  const use = (c: Company): void => set({ companyId: c.id, companyName: c.name, newCompany: false, contactId: '', contactName: '', contactEmail: '' })
  const change = (): void => set({ companyId: '', newCompany: false, contactId: '', contactName: '', contactEmail: '' })

  return (
    <div className="fld">
      <label htmlFor="rw-company">Company<span style={{ color: 'var(--bad2)' }}> *</span></label>
      {picked || f.newCompany ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <Inp id="rw-company" value={f.companyName} readOnly style={{ flex: '1 1 220px' }} aria-describedby="rw-company-state" />
          <span id="rw-company-state" className="row" style={{ gap: 6 }}>
            {f.newCompany ? <Chip tone="acc" icon="plus">New company · not researched yet</Chip> : <Chip tone="ok" icon="check">In your CRM</Chip>}
          </span>
          <Btn size="sm" kind="ghost" onClick={change}>Change</Btn>
        </div>
      ) : (
        <Inp
          id="rw-company"
          value={f.companyName}
          onChange={v => set({ companyName: v, companyId: '', newCompany: false })}
          placeholder="Type a company name"
          autoFocus
          aria-invalid={err ? true : undefined}
          aria-describedby="rw-company-hint"
        />
      )}
      {open && (
        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="card-b col" style={{ gap: 6, padding: 10 }}>
            {matches.length > 0 && (
              <ul aria-label="Matching companies" className="col" style={{ gap: 4, listStyle: 'none', margin: 0, padding: 0 }}>
                {matches.map(c => (
                  <li key={c.id}><Btn size="sm" kind="ghost" icon="building" onClick={() => use(c)} aria-label={`Use ${c.name}`}>{c.name}</Btn></li>
                ))}
              </ul>
            )}
            {dup && !matches.some(c => c.id === dup.id) && (
              <div className="row wrap" style={{ gap: 8 }}>
                <span className="sm">“{dup.name}” is already in the CRM. Use it rather than creating a copy.</span>
                <Btn size="sm" onClick={() => use(dup)}>Use {dup.name}</Btn>
              </div>
            )}
            {!dup && (
              <>
                <div className="sm muted">No company called {q} in your CRM.</div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <Btn size="sm" kind="pri" onClick={() => set({ newCompany: true, companyId: '', companyName: q, contactId: '' })}>+ Create “{q}”</Btn>
                  <Chip>New company · not researched yet</Chip>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {err ? <div className="err" role="alert">{err}</div> : <div className="hint" id="rw-company-hint">Only the name is needed. You can research the company later from its page.</div>}
    </div>
  )
}
