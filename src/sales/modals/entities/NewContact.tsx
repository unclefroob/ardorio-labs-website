import { useState } from 'react'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { normaliseUrl } from '../../shared/url'
import { S } from '../../data/store'
import type { BusinessId, Contact } from '../../data/types'
import { Banner, BizDot, Btn, Chip, Fld, Inp, Sel } from '../../kit/basic'
import { Modal } from '../../kit/overlay'
import { PERM } from '../../shared/constants'
import { BizSel, CoSel, OwnerSel, useF } from '../../shared/forms'
import { UI } from '../../ui/store'
import { NoEditModal } from './guards'
import { BUYING_ROLES, SENIORITY } from './options'

interface ContactDraft {
  firstName: string
  lastName: string
  title: string
  companyId: string
  email: string
  phone: string
  mobile: string
  linkedin: string
  seniority: string
  buyingRole: string
  businessId: BusinessId
  ownerId: string
  permission: string
  location: string
}

type Errors = Partial<Record<'firstName' | 'lastName' | 'companyId' | 'email' | 'linkedin', string>>

export interface NewContactProps { companyId?: string; businessId?: BusinessId }

function findDuplicate(f: ContactDraft): Contact | undefined {
  const email = f.email.trim().toLowerCase()
  const fn = f.firstName.trim().toLowerCase()
  const ln = f.lastName.trim().toLowerCase()
  const checked = normaliseUrl(f.linkedin)
  const li = (checked.ok ? checked.value : f.linkedin.trim()).toLowerCase()
  return S.contacts.find(c => !c.archived && (
    (!!email && c.email === email)
    || (c.companyId === f.companyId && c.firstName.toLowerCase() === fn && c.lastName.toLowerCase() === ln)
    || (!!li && !!c.linkedin && c.linkedin.toLowerCase() === li)
  ))
}

export function NewContact({ companyId, businessId }: NewContactProps) {
  const b0 = businessId && Q.canEdit(businessId) ? businessId : Q.defaultBiz()
  if (!b0) return <NoEditModal title="New contact" what="add contacts" />
  return <NewContactForm b0={b0} companyId={companyId} />
}

function NewContactForm({ b0, companyId }: { b0: BusinessId; companyId?: string }) {
  const [f, set] = useF<ContactDraft>({
    firstName: '', lastName: '', title: '', companyId: companyId ?? '', email: '', phone: '', mobile: '', linkedin: '',
    seniority: 'Manager', buyingRole: 'Influencer', businessId: b0, ownerId: Q.me().id, permission: 'Legitimate business interest', location: '',
  })
  const [err, setErr] = useState<Errors>({})
  const [dup, setDup] = useState<Contact | null>(null)

  const create = (): void => {
    if (!UI.guard(f.businessId, 'Creating contacts')) return
    const li = normaliseUrl(f.linkedin)
    const c = Act.createContact({ ...f, linkedin: li.ok ? li.value : '' })
    UI.close()
    UI.toast('Contact created')
    UI.nav('contact', { id: c.id })
  }

  const save = (): void => {
    const e: Errors = {}
    if (!f.firstName.trim()) e.firstName = 'Required'
    if (!f.lastName.trim()) e.lastName = 'Required'
    if (!f.companyId) e.companyId = 'Select a company'
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.email = 'Enter a valid email'
    const li = normaliseUrl(f.linkedin, 'LinkedIn URL')
    if (!li.ok) e.linkedin = li.error
    setErr(e)
    if (Object.keys(e).length) return
    const m = findDuplicate(f)
    if (m) setDup(m)
    else create()
  }

  if (dup) {
    const has = !!Q.crel(dup.id, f.businessId)
    const bizName = Q.biz(f.businessId)?.name ?? f.businessId
    const why = dup.email && dup.email === f.email.trim().toLowerCase() ? 'email address' : dup.companyId === f.companyId ? 'name at this company' : 'LinkedIn profile'
    const linkExisting = (): void => {
      if (!UI.guard(f.businessId, 'Linking a contact')) return
      Act.linkContact(dup.id, f.businessId, f.ownerId)
      UI.close()
      UI.toast('Linked existing contact to ' + bizName)
      UI.nav('contact', { id: dup.id })
    }
    return (
      <Modal
        title="Duplicate contact detected"
        icon="alert"
        footer={
          <>
            <Btn onClick={() => setDup(null)}>Back</Btn>
            <Btn onClick={create}>Create anyway</Btn>
            {has
              ? <Btn kind="pri" onClick={() => { UI.close(); UI.nav('contact', { id: dup.id }) }}>Open existing</Btn>
              : <Btn kind="pri" onClick={linkExisting}>Link existing to {bizName}</Btn>}
          </>
        }
      >
        <Banner tone="warn">A contact with the same {why} already exists. Contacts exist once across the portfolio.</Banner>
        <div className="card card-b" style={{ marginTop: 12 }}>
          <b>{dup.name}</b>
          <div className="muted sm">{dup.title} · {Q.company(dup.companyId)?.name ?? 'Unknown company'} · {dup.email || 'no email'}</div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            {Q.crelsOf(dup.id).map(r => (
              <Chip key={r.id}><BizDot b={r.businessId} />{Q.biz(r.businessId)?.name}{Q.member(r.businessId) ? ' · ' + (Q.user(r.ownerId)?.name ?? 'Unassigned') : ''}</Chip>
            ))}
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="New contact" icon="user" width={620} footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" onClick={save}>Create contact</Btn></>}>
      <div className="grid g2">
        <Fld label="First name" req err={err.firstName}><Inp value={f.firstName} onChange={v => set('firstName', v)} autoFocus /></Fld>
        <Fld label="Last name" req err={err.lastName}><Inp value={f.lastName} onChange={v => set('lastName', v)} /></Fld>
        <Fld label="Job title"><Inp value={f.title} onChange={v => set('title', v)} /></Fld>
        <Fld label="Company" req err={err.companyId}><CoSel value={f.companyId} onChange={v => set('companyId', v)} /></Fld>
        <Fld label="Work email" err={err.email}><Inp value={f.email} onChange={v => set('email', v)} type="email" /></Fld>
        <Fld label="Work phone"><Inp value={f.phone} onChange={v => set('phone', v)} /></Fld>
        <Fld label="Mobile"><Inp value={f.mobile} onChange={v => set('mobile', v)} /></Fld>
        <Fld label="LinkedIn URL" err={err.linkedin}><Inp value={f.linkedin} onChange={v => set('linkedin', v)} placeholder="linkedin.com/in/…" /></Fld>
        <Fld label="Seniority"><Sel value={f.seniority} onChange={v => set('seniority', v)} options={SENIORITY} /></Fld>
        <Fld label="Buying role"><Sel value={f.buyingRole} onChange={v => set('buyingRole', v)} options={BUYING_ROLES} /></Fld>
        <Fld label="Business"><BizSel value={f.businessId} onChange={v => set({ businessId: v as BusinessId, ownerId: Q.me().id })} /></Fld>
        <Fld label="Owner"><OwnerSel b={f.businessId} value={f.ownerId} onChange={v => set('ownerId', v)} /></Fld>
        <Fld label="Outreach permission basis" hint="Required before sequence outreach" style={{ gridColumn: '1/-1' }}>
          <Sel value={f.permission} onChange={v => set('permission', v)} placeholder="Not recorded" options={PERM} />
        </Fld>
      </div>
    </Modal>
  )
}
