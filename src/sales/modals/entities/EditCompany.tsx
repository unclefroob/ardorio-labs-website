import { useState } from 'react'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import type { Company } from '../../data/types'
import { Btn, Fld, Inp, Sel, TA } from '../../kit/basic'
import { Modal } from '../../kit/overlay'
import { INDUSTRIES, STATES, domOf } from '../../shared/constants'
import { useF } from '../../shared/forms'
import { normaliseUrl } from '../../shared/url'
import { UI } from '../../ui/store'
import { MissingModal } from './guards'

interface EditDraft {
  name: string
  website: string
  linkedin: string
  industry: string
  subindustry: string
  hq: string
  state: string
  employees: string
  locations: string
  type: string
  description: string
  revenue: string
}

export function EditCompany({ id }: { id: string }) {
  const c = Q.company(id)
  if (!c) return <MissingModal title="Edit company" what="Company" />
  return <EditCompanyForm c={c} />
}

function EditCompanyForm({ c }: { c: Company }) {
  const [f, set] = useF<EditDraft>({
    name: c.name, website: c.website, linkedin: c.linkedin, industry: c.industry, subindustry: c.subindustry, hq: c.hq, state: c.state,
    employees: c.employees ? String(c.employees) : '', locations: c.locations ? String(c.locations) : '', type: c.type, description: c.description,
    revenue: typeof c.revenue === 'string' || typeof c.revenue === 'number' ? String(c.revenue) : '',
  })
  const [err, setErr] = useState<Partial<Record<'website' | 'linkedin', string>>>({})
  const save = (): void => {
    if (!f.name.trim()) return UI.toast('Name is required', 'bad')
    const web = normaliseUrl(f.website, 'website address')
    const li = normaliseUrl(f.linkedin, 'LinkedIn company URL')
    if (!web.ok || !li.ok) {
      setErr({ website: web.ok ? undefined : web.error, linkedin: li.ok ? undefined : li.error })
      return
    }
    Act.updateCompany(c.id, { ...f, website: web.value, linkedin: li.value, employees: +f.employees || null, locations: +f.locations || null, domain: domOf(web.value) })
    UI.close()
    UI.toast('Company updated everywhere it is referenced')
  }
  return (
    <Modal title={'Edit ' + c.name} width={620} footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" onClick={save}>Save changes</Btn></>}>
      <div className="grid g2">
        <Fld label="Company name" req style={{ gridColumn: '1/-1' }}><Inp value={f.name} onChange={v => set('name', v)} /></Fld>
        <Fld label="Website" err={err.website}><Inp value={f.website} onChange={v => set('website', v)} /></Fld>
        <Fld label="LinkedIn" err={err.linkedin}><Inp value={f.linkedin} onChange={v => set('linkedin', v)} /></Fld>
        <Fld label="Industry"><Sel value={f.industry} onChange={v => set('industry', v)} options={INDUSTRIES} placeholder="—" /></Fld>
        <Fld label="Sub-industry"><Inp value={f.subindustry} onChange={v => set('subindustry', v)} /></Fld>
        <Fld label="Headquarters"><Inp value={f.hq} onChange={v => set('hq', v)} /></Fld>
        <Fld label="State"><Sel value={f.state} onChange={v => set('state', v)} options={STATES} placeholder="—" /></Fld>
        <Fld label="Employees"><Inp value={f.employees} onChange={v => set('employees', v)} inputMode="numeric" /></Fld>
        <Fld label="Locations"><Inp value={f.locations} onChange={v => set('locations', v)} inputMode="numeric" /></Fld>
        <Fld label="Company type"><Inp value={f.type} onChange={v => set('type', v)} /></Fld>
        <Fld label="Annual revenue estimate"><Inp value={f.revenue} onChange={v => set('revenue', v)} /></Fld>
        <Fld label="Description" style={{ gridColumn: '1/-1' }}><TA value={f.description} onChange={v => set('description', v)} rows={3} /></Fld>
      </div>
    </Modal>
  )
}
