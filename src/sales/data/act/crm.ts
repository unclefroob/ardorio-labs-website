import { STOPPED_BY_ARCHIVE } from '../archive'
import { F } from '../F'
import { uid } from '../ids'
import { act, audit, ensureRels, notify } from '../internals'
import { Q } from '../Q'
import { cleanLinkPatch, urlOrEmpty } from '../../shared/url'
import type { CompanyProfileField } from '../../api/contract'
import type { BizChangePlan } from '../../shared/businessChange'
import { targetOf, type Choices, type CompanyGroup, type ImportPlan, type ImportRow } from '../../shared/importPlan'
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

/** The company and its relationship with `f.businessId`, written without an activity, audit entry or commit. */
export function addCompanyRows(f: CompanyForm): Company {
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
  return c
}

/** The activity and audit entry that say a company was created. */
export function companyCreatedLog(c: Company, b: BusinessId): void {
  act({ type: 'note', businessId: b, companyId: c.id, subject: 'Company created', desc: `Added to ${Q.biz(b)?.name ?? b}` })
  audit('Record created', `Company: ${c.name}`)
}

export function createCompany(f: CompanyForm): Company {
  const c = addCompanyRows(f)
  companyCreatedLog(c, f.businessId)
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

/** Link an existing company (and its contacts) to business `b`, without an activity, audit entry or commit. */
export function linkCompanyRows(cid: string, b: BusinessId, ownerId?: string): void {
  if (Q.rel(cid, b)) return
  const owner = ownerId || S.session.userId
  S.companyRels.push(newCompanyRel(cid, b, owner, 'Cross-business'))
  for (const c of S.contacts.filter(x => x.companyId === cid)) {
    if (!Q.crel(c.id, b)) S.contactRels.push(newContactRel(c, b, owner))
  }
}

/** The activity and audit entry that say a company was linked to business `b`. */
export function companyLinkedLog(cid: string, b: BusinessId): void {
  act({ type: 'note', businessId: b, companyId: cid, subject: 'Business relationship created', desc: `${Q.biz(b)?.name ?? b} relationship linked to existing master record` })
  audit('Relationship created', `${Q.company(cid)?.name ?? cid} ↔ ${Q.biz(b)?.name ?? b}`)
}

export function linkCompany(cid: string, b: BusinessId, ownerId?: string): void {
  if (Q.rel(cid, b)) return
  linkCompanyRows(cid, b, ownerId)
  companyLinkedLog(cid, b)
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

export interface BizChangeUndo { added: Array<{ coll: 'companyRels' | 'contactRels'; id: string }>; removed: Array<{ coll: 'companyRels'; rel: CompanyRel } | { coll: 'contactRels'; rel: ContactRel }> }

/** Carry out a business change the planner approved. The caller shows what was blocked; nothing blocked is touched. */
export function applyBusinessChange(plan: BizChangePlan, ownerId?: string): BizChangeUndo {
  const owner = ownerId || S.session.userId
  const undo: BizChangeUndo = { added: [], removed: [] }
  for (const a of plan.addCo) {
    const rel = newCompanyRel(a.companyId, a.businessId, owner, 'Business change')
    delete rel.qualification
    delete rel.notes
    S.companyRels.push(rel)
    undo.added.push({ coll: 'companyRels', id: rel.id })
  }
  reindex()
  for (const a of plan.addCt) {
    const ct = idx.contacts.get(a.contactId)
    if (!ct) continue
    const rel = newContactRel(ct, a.businessId, owner)
    S.contactRels.push(rel)
    undo.added.push({ coll: 'contactRels', id: rel.id })
  }
  for (const r of plan.removeCo) {
    const rel = S.companyRels.find(x => x.id === r.relId)
    if (!rel) continue
    undo.removed.push({ coll: 'companyRels', rel: { ...rel } })
    removeRow('companyRels', rel.id)
  }
  for (const r of plan.removeCt) {
    const rel = S.contactRels.find(x => x.id === r.relId)
    if (!rel) continue
    undo.removed.push({ coll: 'contactRels', rel: { ...rel } })
    removeRow('contactRels', rel.id)
  }
  reindex()
  const n = new Set([...plan.addCo, ...plan.removeCo].map(x => x.companyId)).size
  audit('Businesses changed', `${n} companies: +${plan.addCo.length} / -${plan.removeCo.length} company relationships, +${plan.addCt.length} / -${plan.removeCt.length} contact relationships`)
  commit()
  return undo
}

/** Put a change back: what it added is deleted, what it removed is created again (as new records of the same kind). */
export function undoBusinessChange(u: BizChangeUndo): void {
  for (const a of u.added) removeRow(a.coll, a.id)
  for (const r of u.removed) {
    if (r.coll === 'contactRels') S.contactRels.push({ ...r.rel, id: uid('xr') })
    else S.companyRels.push({ ...r.rel, id: uid('cr') })
  }
  reindex()
  audit('Businesses change undone', `${u.added.length} added and ${u.removed.length} removed relationships reversed`)
  commit()
}

/** Apply the research suggestions a person ticked. Each field remembers the page it came from; the rest of the company is left alone. */
export function applyCompanyProfile(id: string, picks: ReadonlyArray<{ field: CompanyProfileField; value: string | number; sourceUrl: string }>): number {
  const c = idx.companies.get(id)
  if (!c || !picks.length) return 0
  const now = F.nowIso()
  const from: Record<string, { url: string; at: string }> = { ...(typeof c.researchSources === 'object' && c.researchSources ? c.researchSources as Record<string, { url: string; at: string }> : {}) }
  for (const p of picks) {
    if (typeof p.value === 'number') c[p.field] = p.value as never
    else c[p.field] = p.value as never
    from[p.field] = { url: p.sourceUrl, at: now }
  }
  c.researchSources = from
  c.researchStatus = 'Researched'
  c.lastResearched = now
  c.updatedAt = now
  audit('Research applied', `Company: ${c.name} (${picks.map(p => p.field).join(', ')})`)
  commit()
  return picks.length
}

export function archiveCompany(id: string): void {
  const c = idx.companies.get(id)
  if (!c) return
  c.archived = true
  audit('Record archived', `Company: ${c.name}`)
  commit()
}

export function restoreCompany(id: string): void {
  const c = idx.companies.get(id)
  if (!c || !c.archived) return
  c.archived = false
  audit('Record restored', `Company: ${c.name}`)
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
  /** Per-field provenance, when the contact is created from a cited lookup (Find people). */
  enrichment?: Contact['enrichment']
}

/** The contact and its relationships with `f.businessId`, written without an activity, audit entry or commit. */
export function addContactRows(f: ContactForm): Contact {
  const now = F.nowIso()
  const c: Contact = {
    id: uid('ct'), firstName: f.firstName.trim(), lastName: f.lastName.trim(), name: `${f.firstName} ${f.lastName}`.trim(),
    title: f.title || '', department: f.department || '', companyId: f.companyId, email: (f.email || '').trim().toLowerCase(),
    email2: '', phone: f.phone || '', mobile: f.mobile || '', linkedin: urlOrEmpty(f.linkedin), location: f.location || '',
    seniority: f.seniority || 'Manager', buyingRole: f.buyingRole || 'Influencer', verification: 'Unverified', deliverability: 'Unknown',
    permission: f.permission || null, permissionSource: f.permission ? 'Recorded at creation' : '', permissionDate: f.permission ? now : null,
    source: f.source || 'Manual', lastEnriched: null, createdAt: now, notes: [],
    ...(f.enrichment ? { enrichment: f.enrichment } : {}),
  }
  S.contacts.push(c)
  reindex()
  ensureRels(c.id, f.businessId, f.ownerId)
  return c
}

/** The activity and audit entry that say a contact was created. */
export function contactCreatedLog(c: Contact, b: BusinessId): void {
  act({ type: 'note', businessId: b, contactId: c.id, companyId: c.companyId, subject: 'Contact created' })
  audit('Record created', `Contact: ${c.name}`)
}

export function createContact(f: ContactForm): Contact {
  const c = addContactRows(f)
  contactCreatedLog(c, f.businessId)
  commit()
  return c
}

/** Fields whose Grok provenance (Contact.enrichment) is dropped as soon as a person changes the value by hand. */
const ENRICHED_FIELDS = ['email', 'email2', 'phone', 'mobile', 'title', 'linkedin'] as const

export function updateContact(id: string, p: Partial<Contact>): void {
  const c = idx.contacts.get(id)
  if (!c) return
  const wasVerified = c.verification === 'Verified'
  const patch = cleanLinkPatch(p)
  // A hand-typed value must not keep showing "found by Grok" provenance (or a verification stamp) from the old one.
  const changed = ENRICHED_FIELDS.filter(f => f in patch && String(patch[f] ?? '') !== String(c[f] ?? ''))
  Object.assign(c, patch)
  if (p.firstName || p.lastName) c.name = `${c.firstName} ${c.lastName}`
  if (c.enrichment && changed.length) {
    const rest = { ...c.enrichment }
    for (const f of changed) delete rest[f]
    if (Object.keys(rest).length) c.enrichment = rest
    else delete c.enrichment
  }
  const emailChanged = changed.includes('email')
  if (emailChanged) {
    delete c.verifiedBy
    delete c.verifiedAt
    if (p.verification === undefined) c.verification = 'Unverified'
  }
  if (p.verification === 'Verified' && (!wasVerified || emailChanged)) {
    c.verifiedBy = S.session.userId
    c.verifiedAt = F.nowIso()
  } else if (p.verification && p.verification !== 'Verified' && wasVerified) {
    delete c.verifiedBy
    delete c.verifiedAt
  }
  audit('Record edited', `Contact: ${c.name}`)
  commit()
}

/** Someone has confirmed the email is real: records who and when, and lifts the Inferred send block. */
export function markVerified(ctid: string): void {
  const c = idx.contacts.get(ctid)
  if (!c) return
  const was = c.verification
  c.verification = 'Verified'
  c.verifiedBy = S.session.userId
  c.verifiedAt = F.nowIso()
  const biz = Q.primaryBiz(c)
  if (biz) act({ type: 'verified', businessId: biz, contactId: ctid, companyId: c.companyId, subject: 'Email marked verified', desc: `${c.email} (was ${was})` })
  const pattern = c.enrichment?.email?.pattern
  if (pattern) audit('Inferred email verified', `${c.name} — ${c.email} (pattern ${pattern})`)
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
    if (e.contactId === id && STOPPED_BY_ARCHIVE.includes(e.status)) {
      e.status = 'removed'
      e.reason = 'Contact archived'
    }
  }
  audit('Record archived', `Contact: ${c.name}`)
  commit()
}

/** Restoring brings the contact back only: enrolments that archiving stopped stay stopped. */
export function restoreContact(id: string): void {
  const c = idx.contacts.get(id)
  if (!c || !c.archived) return
  c.archived = false
  audit('Record restored', `Contact: ${c.name}`)
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
export type { ImportRow } from '../../shared/importPlan'
export interface ImportOptions {
  /** One or more businesses the leads are for. Each gets its own relationship with every company and contact; the records are shared. */
  businessIds: BusinessId[]
  /** The owner of the relationships in each business; a business left out is owned by the person importing. */
  owners: Partial<Record<BusinessId, string>>
  behaviour?: 'skip' | 'update' | 'link'
  listId?: string
  fileName: string
  /** The batch's tag, put on every company and contact it creates or reuses, so one import can be found again. */
  tag: string
  /** A permission basis for every contact this import creates ('' for none). */
  permission?: string
}
export interface ImportResult {
  companiesCreated: number
  companiesReused: number
  created: number
  updated: number
  linked: number
  skipped: number
  rejected: ImportRow[]
  ids: string[]
  companyIds: string[]
}

const typeOf = (s: string | undefined): string =>
  /public/i.test(s ?? '') ? 'Public company' : /gov/i.test(s ?? '') ? 'Government' : /non[- ]?profit|charity/i.test(s ?? '') ? 'Non-profit' : 'Private company'

const firstOf = <K extends keyof ImportRow>(rows: readonly ImportRow[], k: K): ImportRow[K] | undefined => rows.find(r => r[k] !== undefined && r[k] !== '')?.[k]

/** The company a group becomes: its details are the first the file gives for each field. */
function createImportedCompany(g: CompanyGroup, tag: string, now: string): Company {
  const site = urlOrEmpty(firstOf(g.rows, 'website'))
  return {
    id: uid('co'), name: g.name, tradingName: g.name, website: site, domain: site.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
    industry: firstOf(g.rows, 'industry') ?? '', subindustry: firstOf(g.rows, 'subindustry') ?? '', hq: firstOf(g.rows, 'city') ?? '', state: firstOf(g.rows, 'state') ?? '',
    country: firstOf(g.rows, 'country') ?? 'Australia', employees: firstOf(g.rows, 'employees') ?? null, locations: null, type: typeOf(firstOf(g.rows, 'companyType')),
    description: firstOf(g.rows, 'description') ?? '', linkedin: urlOrEmpty(firstOf(g.rows, 'companyLinkedin')), tech: [], tags: ['Imported', tag], researchStatus: 'Not researched',
    source: 'CSV import', createdAt: now, updatedAt: now, notes: [],
    ...(firstOf(g.rows, 'address') ? { address: firstOf(g.rows, 'address') } : {}),
  }
}

/** An existing company keeps what it has: the file only fills the blanks. */
function fillImportedCompany(c: Company, g: CompanyGroup, tag: string): void {
  const site = urlOrEmpty(firstOf(g.rows, 'website'))
  if (!c.website && site) { c.website = site; c.domain = site.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] }
  if (!c.industry) c.industry = firstOf(g.rows, 'industry') ?? ''
  if (!c.subindustry) c.subindustry = firstOf(g.rows, 'subindustry') ?? ''
  if (!c.hq) c.hq = firstOf(g.rows, 'city') ?? ''
  if (!c.state) c.state = firstOf(g.rows, 'state') ?? ''
  if (!c.country) c.country = firstOf(g.rows, 'country') ?? ''
  if (c.employees == null) c.employees = firstOf(g.rows, 'employees') ?? null
  if (!c.description) c.description = firstOf(g.rows, 'description') ?? ''
  if (!c.linkedin) c.linkedin = urlOrEmpty(firstOf(g.rows, 'companyLinkedin'))
  if (!c.address && firstOf(g.rows, 'address')) c.address = firstOf(g.rows, 'address')
  if (!c.tags.includes(tag)) c.tags.push(tag)
  c.updatedAt = F.nowIso()
}

export function importLeads(plan: ImportPlan, choices: Choices, o: ImportOptions): ImportResult {
  const res: ImportResult = { companiesCreated: 0, companiesReused: 0, created: 0, updated: 0, linked: 0, skipped: 0, rejected: [...plan.invalid], ids: [], companyIds: [] }
  const now = F.nowIso()
  const ownerOf = (b: BusinessId): string => o.owners[b] || S.session.userId
  for (const g of plan.groups) {
    const target = targetOf(g, choices)
    if (target === 'unresolved') { res.skipped += g.rows.length; continue }
    let co = target.companyId ? idx.companies.get(target.companyId) : undefined
    if (co) {
      fillImportedCompany(co, g, o.tag)
      res.companiesReused++
    } else {
      co = createImportedCompany(g, o.tag, now)
      S.companies.push(co)
      reindex()
      res.companiesCreated++
    }
    res.companyIds.push(co.id)
    for (const b of o.businessIds) {
      if (Q.rel(co.id, b)) continue
      const rel = newCompanyRel(co.id, b, ownerOf(b), 'CSV import')
      delete rel.qualification
      delete rel.notes
      S.companyRels.push(rel)
    }
    for (const r of g.rows) {
      if (r._dupInFile) { res.skipped++; continue }
      const ex = r._dup ? idx.contacts.get(r._dup) : undefined
      if (ex) {
        if (o.behaviour === 'skip') res.skipped++
        else if (o.behaviour === 'link') res.linked++
        else {
          for (const k of ['title', 'phone', 'mobile', 'linkedin'] as const) {
            const v = k === 'linkedin' ? urlOrEmpty(r[k]) : r[k]
            if (v && !(k === 'title' && ex.verification === 'Verified' && ex.title) && !(k !== 'title' && ex[k])) ex[k] = v
          }
          if (r.email && !ex.email) ex.email = r.email
          res.updated++
        }
        for (const b of o.businessIds) ensureRels(ex.id, b, ownerOf(b))
        res.ids.push(ex.id)
        continue
      }
      const title = r.title || ''
      const status = r.emailStatus ?? ''
      const c: Contact = {
        id: uid('ct'), firstName: r.firstName, lastName: r.lastName, name: `${r.firstName} ${r.lastName}`, title, department: '', companyId: co.id,
        email: (r.email || '').toLowerCase(), email2: '', phone: r.phone || '', mobile: r.mobile || '', linkedin: urlOrEmpty(r.linkedin), location: r.location || '',
        seniority: /Chief|CEO|Owner|Principal/.test(title) ? 'C-Level' : /Director/.test(title) ? 'Director' : /Head/.test(title) ? 'Head' : 'Manager',
        buyingRole: 'Influencer', verification: status === 'invalid' ? 'Invalid' : 'Unverified', deliverability: status === 'valid' ? 'Valid (Wiza)' : 'Unknown',
        permission: o.permission || null, permissionSource: o.permission ? 'Recorded at import' : '', permissionDate: o.permission ? now : null,
        source: 'CSV import (Wiza export)', lastEnriched: null, createdAt: now, notes: [],
      }
      S.contacts.push(c)
      reindex()
      for (const b of o.businessIds) ensureRels(c.id, b, ownerOf(b))
      res.created++
      res.ids.push(c.id)
    }
  }
  if (o.listId) {
    const l = idx.lists.get(o.listId)
    if (l) for (const i of res.ids) if (!l.contactIds.includes(i)) l.contactIds.push(i)
  }
  S.importJobs.unshift({
    id: uid('ij'), name: o.fileName, businessId: o.businessIds[0], businessIds: o.businessIds, by: S.session.userId, ts: now,
    total: plan.rows + plan.invalid.length, created: res.created, updated: res.updated + res.linked, skipped: res.skipped + res.rejected.length, status: 'Completed',
  })
  audit('CSV import', `${o.fileName}: ${res.companiesCreated} companies created, ${res.companiesReused} reused, ${res.created} contacts created, ${res.updated + res.linked} updated/linked`)
  commit()
  return res
}
