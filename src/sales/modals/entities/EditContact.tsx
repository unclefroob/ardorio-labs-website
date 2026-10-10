import { useState } from 'react'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import type { Contact } from '../../data/types'
import { Btn, Fld, Inp, Sel } from '../../kit/basic'
import { Modal } from '../../kit/overlay'
import { CoSel, useF } from '../../shared/forms'
import { normaliseUrl } from '../../shared/url'
import { UI } from '../../ui/store'
import { MissingModal } from './guards'
import { BUYING_ROLES, SENIORITY } from './options'

type ContactEdit = {
  firstName: string
  lastName: string
  title: string
  department: string
  companyId: string
  email: string
  email2: string
  phone: string
  mobile: string
  linkedin: string
  location: string
  seniority: string
  buyingRole: string
  verification: string
}

type TextKey = 'firstName' | 'lastName' | 'title' | 'department' | 'email' | 'email2' | 'phone' | 'mobile' | 'linkedin' | 'location'
const TEXT: ReadonlyArray<readonly [TextKey, string]> = [
  ['firstName', 'First name'], ['lastName', 'Last name'], ['title', 'Job title'], ['department', 'Department'], ['email', 'Work email'],
  ['email2', 'Secondary email'], ['phone', 'Work phone'], ['mobile', 'Mobile'], ['linkedin', 'LinkedIn URL'], ['location', 'Location'],
]

export function EditContact({ id }: { id: string }) {
  const c = Q.contact(id)
  if (!c) return <MissingModal title="Edit contact" what="Contact" />
  return <EditContactForm c={c} />
}

function EditContactForm({ c }: { c: Contact }) {
  const [linkedinErr, setLinkedinErr] = useState<string>()
  const [f, set] = useF<ContactEdit>({
    firstName: c.firstName, lastName: c.lastName, title: c.title, department: c.department, companyId: c.companyId, email: c.email, email2: c.email2,
    phone: c.phone, mobile: c.mobile, linkedin: c.linkedin, location: c.location, seniority: c.seniority, buyingRole: c.buyingRole, verification: c.verification,
  })
  const moving = f.companyId !== c.companyId
  const save = (): void => {
    if (moving && !Q.relsOf(f.companyId).length) return UI.toast('The new company has no business relationship', 'bad')
    const li = normaliseUrl(f.linkedin, 'LinkedIn URL')
    if (!li.ok) {
      setLinkedinErr(li.error)
      return
    }
    Act.updateContact(c.id, { ...f, linkedin: li.value })
    UI.close()
    UI.toast('Contact updated')
  }
  return (
    <Modal title={'Edit ' + c.name} width={620} footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" onClick={save}>Save</Btn></>}>
      <div className="grid g2">
        {TEXT.map(([k, l]) => <Fld key={k} label={l} err={k === 'linkedin' ? linkedinErr : undefined}><Inp value={f[k]} onChange={v => set(k, v)} /></Fld>)}
        <Fld label="Company" hint={moving ? 'Contact will move to this company; history stays linked.' : null}><CoSel value={f.companyId} onChange={v => set('companyId', v)} /></Fld>
        <Fld label="Verification"><Sel value={f.verification} onChange={v => set('verification', v)} options={['Verified', 'Unverified', ['Inferred', 'Guessed'], 'Invalid']} /></Fld>
        <Fld label="Seniority"><Sel value={f.seniority} onChange={v => set('seniority', v)} options={SENIORITY} /></Fld>
        <Fld label="Buying role"><Sel value={f.buyingRole} onChange={v => set('buyingRole', v)} options={BUYING_ROLES} /></Fld>
      </div>
    </Modal>
  )
}
