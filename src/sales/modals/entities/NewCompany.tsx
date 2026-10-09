import { useState } from 'react'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId, Company } from '../../data/types'
import { Banner, BizDot, Btn, Chip, Ck, Fld, Inp, Sel, TA } from '../../kit/basic'
import { Icon } from '../../kit/Icon'
import { Modal } from '../../kit/overlay'
import { INDUSTRIES, STATES, domOf, norm } from '../../shared/constants'
import { BizSel, OwnerSel, useF } from '../../shared/forms'
import { normaliseUrl } from '../../shared/url'
import { UI } from '../../ui/store'
import { NoEditModal } from './guards'

interface CompanyDraft {
  name: string
  website: string
  linkedin: string
  industry: string
  city: string
  state: string
  employees: string
  locations: string
  businessId: BusinessId
  ownerId: string
  tags: string
  notes: string
}

type Errors = Partial<Record<'name' | 'website' | 'linkedin' | 'employees', string>>

export interface NewCompanyProps {
  businessId?: BusinessId
  prefill?: Partial<Omit<CompanyDraft, 'businessId' | 'ownerId'>>
}

const stripTld = (d: string): string => d.replace(/\.(com|com\.au)$/, '')

function findDuplicate(name: string, website: string): Company | undefined {
  const n = norm(name)
  const d = domOf(website)
  return S.companies.find(c => !c.archived && (norm(c.name) === n || (!!d && !!c.domain && (c.domain === d || stripTld(c.domain) === stripTld(d)))))
}

export function NewCompany({ businessId, prefill }: NewCompanyProps) {
  const b0 = businessId && Q.canEdit(businessId) ? businessId : Q.defaultBiz()
  if (!b0) return <NoEditModal title="New company" what="add companies" />
  return <NewCompanyForm b0={b0} prefill={prefill} />
}

function NewCompanyForm({ b0, prefill }: { b0: BusinessId; prefill?: NewCompanyProps['prefill'] }) {
  const [f, set] = useF<CompanyDraft>({
    name: '', website: '', linkedin: '', industry: '', city: '', state: 'VIC', employees: '', locations: '',
    businessId: b0, ownerId: Q.me().id, tags: '', notes: '', ...prefill,
  })
  const [err, setErr] = useState<Errors>({})
  const [dup, setDup] = useState<Company | null>(null)
  const [force, setForce] = useState(false)

  const create = (): void => {
    if (!UI.guard(f.businessId, 'Creating companies')) return
    const web = normaliseUrl(f.website)
    const li = normaliseUrl(f.linkedin)
    const c = Act.createCompany({ ...f, website: web.ok ? web.value : '', linkedin: li.ok ? li.value : '', tags: f.tags ? f.tags.split(',').map(s => s.trim()).filter(Boolean) : [] })
    UI.close()
    UI.toast('Company created')
    UI.nav('company', { id: c.id })
  }

  const save = (): void => {
    const e: Errors = {}
    if (!f.name.trim()) e.name = 'Company name is required'
    const web = normaliseUrl(f.website, 'website address')
    if (!web.ok) e.website = web.error
    else if (web.value && !/\./.test(new URL(web.value).hostname)) e.website = 'Enter a valid website or domain'
    const li = normaliseUrl(f.linkedin, 'LinkedIn company URL')
    if (!li.ok) e.linkedin = li.error
    if (f.employees && isNaN(+f.employees)) e.employees = 'Must be a number'
    setErr(e)
    if (Object.keys(e).length) return
    const m = findDuplicate(f.name, web.ok ? web.value : f.website)
    if (m) {
      setDup(m)
      return
    }
    create()
  }

  const link = (target: Company): void => {
    if (!UI.guard(f.businessId, 'Linking a company')) return
    Act.linkCompany(target.id, f.businessId, f.ownerId)
    UI.close()
    UI.toast(`${Q.biz(f.businessId)?.name ?? 'Business'} relationship linked to existing ${target.name}`)
    UI.nav('company', { id: target.id })
  }

  if (dup) {
    const rels = Q.relsOf(dup.id)
    const already = rels.some(r => r.businessId === f.businessId)
    const bizName = Q.biz(f.businessId)?.name ?? f.businessId
    return (
      <Modal
        title="New company"
        icon="building"
        width={620}
        footer={
          <>
            <Btn onClick={() => setDup(null)}>Back</Btn>
            {already ? (
              <Btn kind="pri" onClick={() => { UI.close(); UI.nav('company', { id: dup.id }) }}>Open existing record</Btn>
            ) : (
              <Btn kind="pri" onClick={() => link(dup)}>Link to existing company</Btn>
            )}
          </>
        }
      >
        <div className="col gap12">
          <Banner tone="warn">
            <b>Possible duplicate found.</b> “{f.name}” matches an existing master company record. To keep one shared relationship database, link a new business relationship instead of creating a copy.
          </Banner>
          <div className="card card-b">
            <div className="row"><Icon n="building" /><b>{dup.name}</b><span className="faint">· {dup.domain} · {dup.hq}</span></div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              {rels.map(r => Q.member(r.businessId)
                ? <Chip key={r.id}><BizDot b={r.businessId} />{Q.biz(r.businessId)?.name} · {r.status} · {Q.user(r.ownerId)?.name ?? 'Unassigned'}</Chip>
                : <Chip key={r.id} icon="lock"><BizDot b={r.businessId} />{Q.biz(r.businessId)?.name} · active elsewhere</Chip>)}
            </div>
          </div>
          {already
            ? <Banner tone="info">This company already has a {bizName} relationship. Open the existing record.</Banner>
            : <div className="muted sm">Linking adds a <b>{bizName}</b> relationship owned by {Q.user(f.ownerId)?.name ?? 'the selected owner'}, reusing the existing company and its contacts.</div>}
          <Ck checked={force} onChange={setForce}>This is a genuinely different organisation. Create a separate record.</Ck>
          {force && <Btn size="sm" onClick={create}>Create separate company</Btn>}
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title="New company"
      icon="building"
      width={620}
      footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" onClick={save}>Create company</Btn></>}
    >
      <div className="grid g2">
        <Fld label="Company name" req err={err.name} style={{ gridColumn: '1/-1' }}><Inp value={f.name} onChange={v => set('name', v)} autoFocus placeholder="e.g. Harbour Retail Group" /></Fld>
        <Fld label="Website" err={err.website}><Inp value={f.website} onChange={v => set('website', v)} placeholder="company.com.au" /></Fld>
        <Fld label="LinkedIn company URL" err={err.linkedin}><Inp value={f.linkedin} onChange={v => set('linkedin', v)} placeholder="linkedin.com/company/…" /></Fld>
        <Fld label="Industry"><Sel value={f.industry} onChange={v => set('industry', v)} placeholder="Select…" options={INDUSTRIES} /></Fld>
        <div className="row" style={{ gap: 8 }}>
          <Fld label="City" style={{ flex: 1 }}><Inp value={f.city} onChange={v => set('city', v)} /></Fld>
          <Fld label="State" style={{ width: 90 }}><Sel value={f.state} onChange={v => set('state', v)} options={STATES} /></Fld>
        </div>
        <Fld label="Estimated employees" err={err.employees}><Inp value={f.employees} onChange={v => set('employees', v)} inputMode="numeric" /></Fld>
        <Fld label="Locations"><Inp value={f.locations} onChange={v => set('locations', v)} inputMode="numeric" /></Fld>
        <Fld label="Associated business"><BizSel value={f.businessId} onChange={v => set({ businessId: v as BusinessId, ownerId: Q.me().id })} /></Fld>
        <Fld label="Account owner"><OwnerSel b={f.businessId} value={f.ownerId} onChange={v => set('ownerId', v)} /></Fld>
        <Fld label="Tags" hint="Comma separated" style={{ gridColumn: '1/-1' }}><Inp value={f.tags} onChange={v => set('tags', v)} placeholder="Multi-site, Priority" /></Fld>
        <Fld label="Initial notes" style={{ gridColumn: '1/-1' }}><TA value={f.notes} onChange={v => set('notes', v)} rows={3} /></Fld>
      </div>
    </Modal>
  )
}
