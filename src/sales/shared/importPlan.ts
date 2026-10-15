import type { Company, Contact } from '../data/types'
import type { MapKey } from '../pages/inbox/parts/csv'
import { domOf } from './constants'
import { similarCompanies } from './companyMatch'
import { normaliseUrl } from './url'

// What an import will do, worked out before anything is written: each row read into a contact and its company, rows grouped by company
// (the website first, then the name), each group matched to a company already in the CRM, and rows that are bad or repeated flagged.
// Pure: the importer shows this on the Review step and then hands the same plan to Act.importLeads.

export interface ImportRow {
  company: string
  firstName: string
  lastName: string
  title?: string
  email?: string
  emailStatus?: string
  mobile?: string
  phone?: string
  linkedin?: string
  location?: string
  website?: string
  industry?: string
  subindustry?: string
  employees?: number
  description?: string
  companyLinkedin?: string
  companyType?: string
  address?: string
  city?: string
  state?: string
  country?: string
  _row: number
  _invalid?: boolean
  _reason?: string
  /** The contact this row is, when the CRM already has them. */
  _dup?: string
  /** The row repeats an earlier row of the same file (same email or LinkedIn address), so it is not imported twice. */
  _dupInFile?: boolean
}

export type GroupMatch =
  | { kind: 'new' }
  | { kind: 'existing'; companyId: string; by: 'website' | 'name' }
  | { kind: 'possible'; candidates: Array<{ id: string; name: string; domain: string }> }

export interface CompanyGroup {
  key: string
  name: string
  domain: string
  rows: ImportRow[]
  match: GroupMatch
}

export interface ImportPlan {
  groups: CompanyGroup[]
  invalid: ImportRow[]
  /** Rows that will import (valid and not repeated within the file). */
  rows: number
  contacts: { new: number; existing: number; repeated: number }
}

/** The company's decision for a group that was a possible match: an existing company's id, or 'new'. Others need none. */
export type Choices = Readonly<Record<string, string>>

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const NOISE = new Set(['pty', 'ltd', 'limited', 'inc', 'co', 'company', 'the', 'and'])

export const nameKey = (s: string): string =>
  s.toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(w => w && !NOISE.has(w)).join(' ')

/** "United states" and "united kingdom" read as place names: each word capitalised. */
export const placeName = (s: string): string => s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')

/** "262" and "1,200" are whole numbers; "201 to 500" is a range and is not stored. */
export function headcount(s: string | undefined): number | undefined {
  const t = (s ?? '').trim()
  if (!/^\d{1,3}(,\d{3})*$|^\d+$/.test(t)) return undefined
  const n = Number(t.replace(/,/g, ''))
  return n >= 1 && n <= 5_000_000 ? n : undefined
}

const cell = (v: string | undefined): string => (v ?? '').trim()

/** Read the CSV's rows through the column map. Errors are per row; a row with one is invalid and is not imported. */
export function parseImportRows(raw: readonly string[][], map: Readonly<Record<number, MapKey | ''>>): ImportRow[] {
  return raw.slice(1).map((r, ri) => {
    const g: Partial<Record<MapKey, string>> = {}
    for (const [i, k] of Object.entries(map)) if (k) g[k] = cell(r[Number(i)])
    let first = g.firstName ?? ''
    let last = g.lastName ?? ''
    if (g.fullName && !first) {
      const p = g.fullName.split(/\s+/)
      first = p[0] ?? ''
      last = p.slice(1).join(' ')
    }
    const errs: string[] = []
    const li = normaliseUrl(g.linkedin)
    if (!li.ok) errs.push('Invalid LinkedIn URL')
    const cli = normaliseUrl(g.companyLinkedin)
    if (!cli.ok) errs.push('Invalid company LinkedIn URL')
    const web = normaliseUrl(g.website)
    if (!web.ok) errs.push('Invalid website')
    const email = g.email ? g.email.toLowerCase() : undefined
    if (!first || !last) errs.push('Missing name')
    if (!g.company) errs.push('Missing company')
    if (email && !EMAIL.test(email)) errs.push('Invalid email')
    const out: ImportRow = {
      _row: ri + 2, company: g.company ?? '', firstName: first, lastName: last,
      title: g.title || undefined, email, emailStatus: g.emailStatus?.toLowerCase() || undefined, mobile: g.mobile || undefined, phone: g.phone || undefined,
      linkedin: li.ok ? li.value || undefined : undefined, location: g.location || undefined, website: web.ok ? web.value || undefined : undefined,
      industry: g.industry || undefined, subindustry: g.subindustry || undefined, employees: headcount(g.employees), description: g.description || undefined,
      companyLinkedin: cli.ok ? cli.value || undefined : undefined, companyType: g.companyType || undefined, address: g.address || undefined,
      city: g.city || undefined, state: g.state || undefined, country: g.country ? placeName(g.country) : undefined,
    }
    if (errs.length) { out._invalid = true; out._reason = errs.join(', ') }
    return out
  })
}

const companyDomain = (c: Company): string => c.domain.toLowerCase() || domOf(c.website)

/**
 * Group the valid rows by company and match each group to the CRM. A group whose website or exact name is already a company is that
 * company; one that only looks like one is "possible" and the person chooses; anything else is new. Contacts already in the CRM are
 * found by email, LinkedIn address, or name at the same company.
 */
export function planImport(rows: readonly ImportRow[], companies: readonly Company[], contacts: readonly Contact[]): ImportPlan {
  const live = companies.filter(c => !c.archived)
  const byDomain = new Map<string, Company>()
  const byName = new Map<string, Company>()
  for (const c of live) {
    const d = companyDomain(c)
    if (d && !byDomain.has(d)) byDomain.set(d, c)
    const k = nameKey(c.name)
    if (k && !byName.has(k)) byName.set(k, c)
  }
  const byEmail = new Map<string, string>()
  const byLi = new Map<string, string>()
  const byNameCo = new Map<string, string>()
  const coName = new Map(companies.map(c => [c.id, nameKey(c.name)] as const))
  for (const c of contacts) {
    if (c.email) byEmail.set(c.email.toLowerCase(), c.id)
    if (c.linkedin) byLi.set(c.linkedin.toLowerCase(), c.id)
    byNameCo.set(`${nameKey(c.name)}|${coName.get(c.companyId) ?? ''}`, c.id)
  }

  const invalid: ImportRow[] = []
  const groups = new Map<string, CompanyGroup>()
  const seenEmail = new Set<string>()
  const seenLi = new Set<string>()
  const stats = { new: 0, existing: 0, repeated: 0 }
  let imported = 0

  for (const src of rows) {
    const r: ImportRow = { ...src }
    delete r._dup
    delete r._dupInFile
    if (r._invalid) { invalid.push(r); continue }
    const email = r.email?.toLowerCase()
    const li = r.linkedin?.toLowerCase()
    if ((email && seenEmail.has(email)) || (li && seenLi.has(li))) { r._dupInFile = true; stats.repeated++ }
    else {
      if (email) seenEmail.add(email)
      if (li) seenLi.add(li)
      const dup = (email && byEmail.get(email)) || (li && byLi.get(li)) || byNameCo.get(`${nameKey(`${r.firstName} ${r.lastName}`)}|${nameKey(r.company)}`)
      if (dup) { r._dup = dup; stats.existing++ } else stats.new++
      imported++
    }
    const domain = domOf(r.website)
    const key = domain ? `d:${domain}` : `n:${nameKey(r.company)}`
    let g = groups.get(key)
    if (!g) {
      g = { key, name: r.company, domain, rows: [], match: { kind: 'new' } }
      groups.set(key, g)
    }
    g.rows.push(r)
  }

  for (const g of groups.values()) {
    const byWeb = g.domain ? byDomain.get(g.domain) : undefined
    const byNm = byName.get(nameKey(g.name))
    if (byWeb) g.match = { kind: 'existing', companyId: byWeb.id, by: 'website' }
    else if (byNm) g.match = { kind: 'existing', companyId: byNm.id, by: 'name' }
    else {
      const similar = similarCompanies(g.name, g.domain, live, 2)
      if (similar.length) g.match = { kind: 'possible', candidates: similar.map(c => ({ id: c.id, name: c.name, domain: companyDomain(c) })) }
    }
  }
  return { groups: [...groups.values()], invalid, rows: imported, contacts: stats }
}

/** The company a group's contacts go to: an existing company's id, or null to create one. A possible match with no choice yet is unresolved. */
export function targetOf(g: CompanyGroup, choices: Choices): { companyId: string | null } | 'unresolved' {
  if (g.match.kind === 'existing') return { companyId: g.match.companyId }
  if (g.match.kind === 'new') return { companyId: null }
  const c = choices[g.key]
  if (!c) return 'unresolved'
  return { companyId: c === 'new' ? null : c }
}

export const unresolved = (plan: ImportPlan, choices: Choices): CompanyGroup[] => plan.groups.filter(g => targetOf(g, choices) === 'unresolved')
