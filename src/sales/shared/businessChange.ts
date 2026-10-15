import type { BusinessId, CompanyRel, Contact, ContactRel, Deal, Enrolment } from '../data/types'

// Changing which businesses a company (and its contacts) belong to after an import. A business is a relationship record per company and per
// contact, so adding is creating them and removing is deleting them; the company and contact records, their notes and their history stay.
// Contacts always follow their company when a business is removed (a contact cannot be in a business its company is not in); adding to
// the contacts is the person's choice. A removal is refused where the business still has work on the company.

export interface BizChangeInput { companyIds: readonly string[]; add: readonly BusinessId[]; remove: readonly BusinessId[]; withContacts: boolean }
export interface BizBlock { companyId: string; businessId: BusinessId; reason: string }
export interface BizChangePlan {
  addCo: Array<{ companyId: string; businessId: BusinessId }>
  addCt: Array<{ contactId: string; businessId: BusinessId }>
  removeCo: Array<{ relId: string; companyId: string; businessId: BusinessId }>
  removeCt: Array<{ relId: string; contactId: string; businessId: BusinessId }>
  blocked: BizBlock[]
}
export interface BizData {
  companyRels: readonly CompanyRel[]
  contactRels: readonly ContactRel[]
  contacts: readonly Contact[]
  deals: readonly Deal[]
  enrolments: readonly Enrolment[]
  canEdit: (b: BusinessId) => boolean
}

const LIVE = ['active', 'awaiting_approval', 'awaiting_task', 'scheduled', 'paused']

export function planBusinessChange(i: BizChangeInput, d: BizData): BizChangePlan {
  const plan: BizChangePlan = { addCo: [], addCt: [], removeCo: [], removeCt: [], blocked: [] }
  const cos = [...new Set(i.companyIds)]
  for (const cid of cos) {
    const people = d.contacts.filter(c => c.companyId === cid && !c.archived)
    for (const b of i.add) {
      if (!d.canEdit(b)) { plan.blocked.push({ companyId: cid, businessId: b, reason: 'No edit access' }); continue }
      if (!d.companyRels.some(r => r.companyId === cid && r.businessId === b)) plan.addCo.push({ companyId: cid, businessId: b })
      if (i.withContacts) for (const c of people) if (!d.contactRels.some(r => r.contactId === c.id && r.businessId === b)) plan.addCt.push({ contactId: c.id, businessId: b })
    }
    for (const b of i.remove) {
      const rel = d.companyRels.find(r => r.companyId === cid && r.businessId === b)
      if (!rel) continue
      if (!d.canEdit(b)) { plan.blocked.push({ companyId: cid, businessId: b, reason: 'No edit access' }); continue }
      if (d.deals.some(x => x.companyId === cid && x.businessId === b && x.status === 'open' && x.archived !== true)) {
        plan.blocked.push({ companyId: cid, businessId: b, reason: 'Open deal' }); continue
      }
      const inSeq = people.some(c => d.enrolments.some(x => x.contactId === c.id && x.businessId === b && LIVE.includes(x.status)))
      if (inSeq) { plan.blocked.push({ companyId: cid, businessId: b, reason: 'Contact in a sequence' }); continue }
      plan.removeCo.push({ relId: rel.id, companyId: cid, businessId: b })
      for (const c of people) {
        const cr = d.contactRels.find(r => r.contactId === c.id && r.businessId === b)
        if (cr) plan.removeCt.push({ relId: cr.id, contactId: c.id, businessId: b })
      }
    }
  }
  return plan
}

/** For each business: how many of the selected companies are in it. The dialog shows on-all, on-some, or none from this. */
export function businessCounts(companyIds: readonly string[], rels: readonly CompanyRel[], businesses: readonly BusinessId[]): Array<{ businessId: BusinessId; on: number; total: number }> {
  const ids = new Set(companyIds)
  return businesses.map(b => ({ businessId: b, on: new Set(rels.filter(r => r.businessId === b && ids.has(r.companyId)).map(r => r.companyId)).size, total: ids.size }))
}
