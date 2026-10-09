import { F } from '../F'
import { uid } from '../ids'
import { act, audit, ensureRels, notify } from '../internals'
import { Q } from '../Q'
import { cleanLinkPatch, urlOrEmpty } from '../../shared/url'
import { commit } from '../commit'
import { idx, reindex, removeRow, S } from '../store'
import type {
  BusinessId, Company, CompanyRel, Contact, ContactRel, Deal, ListRec, Note, Suppression, Template,
} from '../types'

export interface CompanyForm {
  name: string
  businessId: BusinessId
  ownerId?: string
  website?: string
  industry?: string
  city?: string
  state?: string
  employees?: number | string
  locations?: number | string
  type?: string
  description?: string
  linkedin?: string
  tags?: string[]
  source?: string
  notes?: string
}

function newCompanyRel(companyId: string, businessId: BusinessId, ownerId: string, source: string): CompanyRel {
  return {
    id: uid('cr'), companyId, businessId, ownerId, status: 'Prospecting', prospectStatus: 'Open', source,
    priority: 'Medium', tags: [], qualification: '', notes: '', createdAt: F.nowIso(),
  }
}

function newContactRel(ct: Contact, businessId: BusinessId, ownerId: string): ContactRel {
  return {
    id: uid('xr'), contactId: ct.id, businessId, ownerId, leadStatus: 'New', qualification: 'Unqualified',
    influence: ct.buyingRole, priority: 'Medium', lastActivity: null, eligible: true, tags: [],
  }
}

export function createCompany(f: CompanyForm): Company {
  const now = F.nowIso()
  const dom = (f.website || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase()
  const name = f.name.trim()
  const c: Company = {
    id: uid('co'), name, tradingName: name,
    website: urlOrEmpty(f.website),
    domain: dom, industry: f.industry || '', subindustry: '', hq: f.city || '', state: f.state || '', country: 'Australia',
    employees: +(f.employees ?? 0) || null, locations: +(f.locations ?? 0) || null, type: f.type || 'Private company',
    description: f.description || '', linkedin: urlOrEmpty(f.linkedin), tech: [], tags: f.tags || [], researchStatus: 'Not researched',
    source: f.source || 'Manual', updatedAt: now, createdAt: now, notes: [],
  }
  S.companies.push(c)
  S.companyRels.push(newCompanyRel(c.id, f.businessId, f.ownerId || S.session.userId, c.source))
  if (f.notes) c.notes = [{ id: uid('nt'), body: f.notes, by: S.session.userId, ts: now, businessId: f.businessId, visibility: 'business' }]
  act({ type: 'note', businessId: f.businessId, companyId: c.id, subject: 'Company created', desc: `Added to ${Q.biz(f.businessId)?.name ?? f.businessId}` })
  audit('Record created', `Company: ${c.name}`)
  commit()
  return c
}

export function updateCompany(id: string, p: Partial<Company>): void {
  const c = idx.companies.get(id)
  if (!c) return
  Object.assign(c, cleanLinkPatch(p), { updatedAt: F.nowIso() })
  audit('Record edited', `Company: ${c.name}`)
  commit()
}

export function linkCompany(cid: string, b: BusinessId, ownerId?: string): void {
  if (Q.rel(cid, b)) return
  const owner = ownerId || S.session.userId
  S.companyRels.push(newCompanyRel(cid, b, owner, 'Cross-business'))
  for (const c of S.contacts.filter(x => x.companyId === cid)) {
    if (!Q.crel(c.id, b)) S.contactRels.push(newContactRel(c, b, owner))
  }
  act({ type: 'note', businessId: b, companyId: cid, subject: 'Business relationship created', desc: `${Q.biz(b)?.name ?? b} relationship linked to existing master record` })
  audit('Relationship created', `${Q.company(cid)?.name ?? cid} ↔ ${Q.biz(b)?.name ?? b}`)
  commit()
}

export function updateRel(id: string, p: Partial<CompanyRel>): void {
  const r = S.companyRels.find(x => x.id === id)
  if (!r) return
  const prev = r.ownerId
  Object.assign(r, p)
  if (p.ownerId && p.ownerId !== prev) {
    const co = Q.company(r.companyId)
    audit('Ownership changed', `${co?.name ?? r.companyId} (${Q.biz(r.businessId)?.name ?? r.businessId}) → ${Q.user(p.ownerId)?.name ?? p.ownerId}`)
    notify([p.ownerId], { type: 'Deal assigned', title: `You now own ${co?.name ?? 'a company'}`, body: `${Q.biz(r.businessId)?.name ?? r.businessId} relationship`, link: { page: 'company', id: r.companyId } })
  }
  commit()
}

export function bulkCompanies(ids: string[], op: 'tag' | 'owner' | 'biz', val: string): void {
  for (const id of ids) {
    const c = idx.companies.get(id)
    if (!c) continue
    if (op === 'tag' && !c.tags.includes(val)) c.tags.push(val)
    if (op === 'owner') {
      for (const b of Q.scope()) {
        const r = Q.rel(id, b)
        if (r && Q.canEdit(b)) r.ownerId = val
      }
    }
    if (op === 'biz' && !Q.rel(id, val)) {
      const b = val as BusinessId
      const rel = newCompanyRel(id, b, S.session.userId, 'Bulk assignment')
      delete rel.qualification
      delete rel.notes
      S.companyRels.push(rel)
    }
  }
  audit(`Bulk update (${op})`, `${ids.length} companies`)
  commit()
}

export function archiveCompany(id: string): void {
  const c = idx.companies.get(id)
  if (!c) return
  c.archived = true
  audit('Record archived', `Company: ${c.name}`)
  commit()
}

// ── notes ───────────────────────────────────────────────────────────────────────────────────
export type NoteKind = 'company' | 'contact' | 'deal'
type NoteHolder = Company | Contact | Deal

function holder(kind: NoteKind, id: string): NoteHolder | undefined {
  return kind === 'company' ? idx.companies.get(id) : kind === 'contact' ? idx.contacts.get(id) : idx.deals.get(id)
}

export function addNote(kind: NoteKind, id: string, body: string, b: BusinessId, vis?: 'business' | 'private'): void {
  const r = holder(kind, id)
  if (!r) return
  const n: Note = { id: uid('nt'), body, by: S.session.userId, ts: F.nowIso(), businessId: b, visibility: vis || 'business' }
  r.notes = r.notes || []
  r.notes.unshift(n)
  act({
    type: 'note', businessId: b, companyId: kind === 'company' ? id : (r as Contact | Deal).companyId,
    contactId: kind === 'contact' ? id : null, dealId: kind === 'deal' ? id : null, subject: 'Note added',
    desc: body.slice(0, 140), visibility: vis === 'private' ? 'private' : 'business', ownerId: S.session.userId,
  })
  commit()
}

export function editNote(kind: NoteKind, id: string, nid: string, body: string): void {
  const n = holder(kind, id)?.notes.find(x => x.id === nid)
  if (!n) return
  n.body = body
  n.edited = F.nowIso()
  commit()
}

export function deleteNote(kind: NoteKind, id: string, nid: string): void {
  const r = holder(kind, id)
  if (!r) return
  r.notes = (r.notes || []).filter(x => x.id !== nid)
  commit()
}

// ── contacts ────────────────────────────────────────────────────────────────────────────────
export interface ContactForm {
  firstName: string
  lastName: string
  companyId: string
  businessId: BusinessId
  ownerId?: string
  title?: string
  department?: string
  email?: string
  phone?: string
  mobile?: string
  linkedin?: string
  location?: string
  seniority?: string
  buyingRole?: string
  permission?: string | null
  source?: string
}

export function createContact(f: ContactForm): Contact {
  const now = F.nowIso()
  const c: Contact = {
    id: uid('ct'), firstName: f.firstName.trim(), lastName: f.lastName.trim(), name: `${f.firstName} ${f.lastName}`.trim(),
    title: f.title || '', department: f.department || '', companyId: f.companyId, email: (f.email || '').trim().toLowerCase(),
    email2: '', phone: f.phone || '', mobile: f.mobile || '', linkedin: urlOrEmpty(f.linkedin), location: f.location || '',
    seniority: f.seniority || 'Manager', buyingRole: f.buyingRole || 'Influencer', verification: 'Unverified', deliverability: 'Unknown',
    permission: f.permission || null, permissionSource: f.permission ? 'Recorded at creation' : '', permissionDate: f.permission ? now : null,
    source: f.source || 'Manual', lastEnriched: null, createdAt: now, notes: [],
  }
  S.contacts.push(c)
  reindex()
  ensureRels(c.id, f.businessId, f.ownerId)
  act({ type: 'note', businessId: f.businessId, contactId: c.id, companyId: c.companyId, subject: 'Contact created' })
  audit('Record created', `Contact: ${c.name}`)
  commit()
  return c
}

export function updateContact(id: string, p: Partial<Contact>): void {
  const c = idx.contacts.get(id)
  if (!c) return
  Object.assign(c, cleanLinkPatch(p))
  if (p.firstName || p.lastName) c.name = `${c.firstName} ${c.lastName}`
  audit('Record edited', `Contact: ${c.name}`)
  commit()
}

export function updateCrel(id: string, p: Partial<ContactRel>): void {
  const r = S.contactRels.find(x => x.id === id)
  if (!r) return
  Object.assign(r, p)
  if (p.ownerId) audit('Ownership changed', `${Q.contact(r.contactId)?.name ?? r.contactId} → ${Q.user(p.ownerId)?.name ?? p.ownerId}`)
  commit()
}

export function setPermission(ctid: string, basis: string): void {
  const c = idx.contacts.get(ctid)
  if (!c) return
  c.permission = basis
  c.permissionSource = `Recorded by ${Q.me().name}`
  c.permissionDate = F.nowIso()
  audit('Outreach eligibility updated', `${c.name}: ${basis}`)
  commit()
}

export function logLinkedIn(ctid: string, b: BusinessId, kind: 'linkedin_conn' | 'linkedin_msg' | 'linkedin_reply', text?: string): void {
  const c = idx.contacts.get(ctid)
  if (!c) return
  const L = { linkedin_conn: 'LinkedIn connection request sent', linkedin_msg: 'LinkedIn message sent', linkedin_reply: 'LinkedIn response received' }
  act({ type: kind, businessId: b, contactId: ctid, companyId: c.companyId, subject: L[kind], desc: text || '' })
  commit()
}

export function archiveContact(id: string): void {
  const c = idx.contacts.get(id)
  if (!c) return
  c.archived = true
  for (const e of S.enrolments) {
    if (e.contactId === id && ['active', 'awaiting_approval', 'awaiting_task'].includes(e.status)) {
      e.status = 'removed'
      e.reason = 'Contact archived'
    }
  }
  audit('Record archived', `Contact: ${c.name}`)
  commit()
}

export function assignContacts(ids: string[], b: BusinessId, owner: string): void {
  for (const i of ids) {
    const r = Q.crel(i, b)
    if (r) r.ownerId = owner
  }
  audit('Ownership changed', `${ids.length} contacts → ${Q.user(owner)?.name ?? owner}`)
  commit()
}

/** Give an existing contact (and their company) a relationship with business `b`, without creating a copy. */
export function linkContact(ctid: string, b: BusinessId, ownerId?: string): void {
  const ct = idx.contacts.get(ctid)
  if (!ct) return
  ensureRels(ctid, b, ownerId)
  act({ type: 'note', businessId: b, companyId: ct.companyId, contactId: ctid, subject: 'Business relationship created', desc: `${Q.biz(b)?.name ?? b} relationship linked to existing contact` })
  audit('Relationship created', `${ct.name} ↔ ${Q.biz(b)?.name ?? b}`)
  commit()
}

// ── suppressions ────────────────────────────────────────────────────────────────────────────
export interface SuppressionForm {
  contactId: string
  scope: 'global' | 'business'
  businessId: BusinessId | null
  reason: string
  email?: string
}

export function addSuppression(f: SuppressionForm): void {
  const s: Suppression = { id: uid('sp'), date: F.nowIso(), by: S.session.userId, source: 'Manual', ...f }
  S.suppressions.push(s)
  for (const e of S.enrolments) {
    if (e.contactId === f.contactId && (f.scope === 'global' || e.businessId === f.businessId) && ['active', 'awaiting_approval', 'awaiting_task', 'paused'].includes(e.status)) {
      e.status = 'removed'
      e.reason = 'Suppressed'
      e.nextDue = null
    }
  }
  audit('Contact suppression updated', `${Q.contact(f.contactId)?.name} — ${f.reason} (${f.scope})`)
  commit()
}

export function removeSuppression(id: string): void {
  const s = S.suppressions.find(x => x.id === id)
  if (!s) return
  s.removed = F.nowIso()
  audit('Contact suppression removed', Q.contact(s.contactId)?.name || s.email || s.contactId)
  commit()
}

// ── lists ───────────────────────────────────────────────────────────────────────────────────
export type ListInput = Partial<ListRec> & Pick<ListRec, 'name' | 'businessId'>

export function saveList(l: ListInput): ListRec {
  const found = l.id ? idx.lists.get(l.id) : undefined
  let x: ListRec
  if (found) {
    x = found
    Object.assign(x, l)
  } else {
    x = { id: uid('ls'), ownerId: S.session.userId, contactIds: [], createdAt: F.nowIso(), type: 'static', ...l }
    S.lists.push(x)
  }
  commit()
  return x
}

export function listAdd(id: string, ids: string[]): void {
  const l = idx.lists.get(id)
  if (!l) return
  for (const i of ids) if (!l.contactIds.includes(i)) l.contactIds.push(i)
  commit()
}

export function listRemove(id: string, ids: string[]): void {
  const l = idx.lists.get(id)
  if (!l) return
  l.contactIds = l.contactIds.filter(i => !ids.includes(i))
  commit()
}

export function deleteList(id: string): void {
  removeRow('lists', id)
  commit()
}

// ── templates ───────────────────────────────────────────────────────────────────────────────
export type TemplateInput = Partial<Template> & Pick<Template, 'name' | 'businessId'>

export function saveTemplate(t: TemplateInput): Template {
  const now = F.nowIso()
  const found = t.id ? idx.templates.get(t.id) : undefined
  let x: Template
  if (found) {
    x = found
    Object.assign(x, t)
  } else {
    x = { id: uid('tp'), ownerId: S.session.userId, createdAt: now, shared: true, category: '', subject: '', body: '', ...t }
    S.templates.push(x)
  }
  x.updatedAt = now
  audit('Template saved', x.name)
  commit()
  return x
}

export function deleteTemplate(id: string): void {
  removeRow('templates', id)
  audit('Record deleted', 'Template')
  commit()
}

// ── CSV import ──────────────────────────────────────────────────────────────────────────────
export interface ImportRow {
  company: string
  firstName: string
  lastName: string
  title?: string
  email?: string
  phone?: string
  linkedin?: string
  location?: string
  website?: string
  industry?: string
  _invalid?: boolean
  _dup?: string
  [k: string]: unknown
}
export interface ImportOptions {
  businessId: BusinessId
  ownerId: string
  behaviour?: 'skip' | 'update' | 'link'
  listId?: string
  fileName: string
}
export interface ImportResult {
  created: number
  updated: number
  linked: number
  skipped: number
  rejected: ImportRow[]
  ids: string[]
}

export function importRows(rows: ImportRow[], o: ImportOptions): ImportResult {
  const res: ImportResult = { created: 0, updated: 0, linked: 0, skipped: 0, rejected: [], ids: [] }
  const now = F.nowIso()
  for (const r of rows) {
    if (r._invalid) {
      res.rejected.push(r)
      continue
    }
    let co = S.companies.find(c => c.name.toLowerCase() === r.company.toLowerCase() || (r.website && c.domain && r.website.includes(c.domain.replace('.example', ''))))
    if (!co) {
      co = {
        id: uid('co'), name: r.company, tradingName: r.company, website: urlOrEmpty(r.website), domain: urlOrEmpty(r.website).replace(/^https?:\/\/(www\.)?/, ''),
        industry: r.industry || '', subindustry: '', hq: (r.location || '').split(',')[0], state: '', country: 'Australia', employees: null,
        locations: null, type: 'Private company', description: '', linkedin: '', tech: [], tags: ['Imported'], researchStatus: 'Not researched',
        source: 'CSV import', createdAt: now, updatedAt: now, notes: [],
      }
      S.companies.push(co)
      reindex()
    }
    if (!Q.rel(co.id, o.businessId)) {
      const rel = newCompanyRel(co.id, o.businessId, o.ownerId, 'CSV import')
      delete rel.qualification
      delete rel.notes
      S.companyRels.push(rel)
    }
    const ex = r._dup ? idx.contacts.get(r._dup) : undefined
    if (ex) {
      if (o.behaviour === 'skip') {
        res.skipped++
      } else if (o.behaviour === 'update') {
        for (const k of ['title', 'phone', 'linkedin'] as const) {
          const v = k === 'linkedin' ? urlOrEmpty(r[k]) : r[k]
          if (v && !(k === 'title' && ex.verification === 'Verified' && ex.title)) ex[k] = v
        }
        if (r.email && !ex.email) ex.email = r.email
        res.updated++
      } else res.linked++
      ensureRels(ex.id, o.businessId, o.ownerId)
      res.ids.push(ex.id)
      continue
    }
    const title = r.title || ''
    const c: Contact = {
      id: uid('ct'), firstName: r.firstName, lastName: r.lastName, name: `${r.firstName} ${r.lastName}`, title, department: '', companyId: co.id,
      email: (r.email || '').toLowerCase(), email2: '', phone: r.phone || '', mobile: '', linkedin: urlOrEmpty(r.linkedin), location: r.location || '',
      seniority: /Chief|CEO|Owner|Principal/.test(title) ? 'C-Level' : /Director/.test(title) ? 'Director' : /Head/.test(title) ? 'Head' : 'Manager',
      buyingRole: 'Influencer', verification: 'Unverified', deliverability: 'Unknown', permission: null, source: 'CSV import (Wiza export)',
      lastEnriched: null, createdAt: now, notes: [],
    }
    S.contacts.push(c)
    reindex()
    ensureRels(c.id, o.businessId, o.ownerId)
    res.created++
    res.ids.push(c.id)
  }
  if (o.listId) {
    const l = idx.lists.get(o.listId)
    if (l) for (const i of res.ids) if (!l.contactIds.includes(i)) l.contactIds.push(i)
  }
  S.importJobs.unshift({
    id: uid('ij'), name: o.fileName, businessId: o.businessId, by: S.session.userId, ts: now, total: rows.length, created: res.created,
    updated: res.updated + res.linked, skipped: res.skipped + res.rejected.length, status: 'Completed',
  })
  audit('CSV import', `${o.fileName}: ${res.created} created, ${res.updated + res.linked} updated/linked`)
  commit()
  return res
}
