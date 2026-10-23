import type { CompanyProfileField, CompanyProfileItem, ResearchProfile } from '../api/contract'
import type { Company } from '../data/types'

// Reading research suggestions against the company record: what the CRM holds now for each field, which suggestions fill a gap, which
// differ from what is there, and which are the same. Only gaps start ticked in the review dialog; nothing differing is ticked for the person.

export const PROFILE_LABEL: Record<CompanyProfileField, string> = {
  description: 'Description', industry: 'Industry', subindustry: 'Sub-industry', hq: 'Head office', state: 'State', country: 'Country',
  employees: 'Employees', locations: 'Locations', type: 'Company type',
}
export const PROFILE_ORDER: readonly CompanyProfileField[] = ['description', 'industry', 'subindustry', 'hq', 'state', 'country', 'employees', 'locations', 'type']

export const currentOf = (c: Company, f: CompanyProfileField): string | number | null => {
  const v = c[f]
  return typeof v === 'string' ? (v.trim() === '' ? null : v) : typeof v === 'number' ? v : null
}

/** A description many companies share word for word is a vendor's filler, not something about this company. */
export const isFillerDescription = (text: string, companies: readonly Company[]): boolean => text.trim() !== '' && companies.filter(c => c.description === text).length >= 3

export type Standing = 'gap' | 'filler' | 'same' | 'differs'

export function standing(c: Company, item: CompanyProfileItem, companies: readonly Company[]): Standing {
  const cur = currentOf(c, item.field)
  if (cur === null) return 'gap'
  if (item.field === 'description' && typeof cur === 'string' && isFillerDescription(cur, companies)) return 'filler'
  const same = typeof item.value === 'number' ? cur === item.value : String(cur).trim().toLowerCase() === String(item.value).trim().toLowerCase()
  return same ? 'same' : 'differs'
}

export type Preset = 'gaps' | 'all' | 'none'

/** The fields a preset ticks. "Fill empty fields" is gaps and filler; "All" is everything that is not already the same. */
export function pick(preset: Preset, c: Company, items: readonly CompanyProfileItem[], companies: readonly Company[]): Set<CompanyProfileField> {
  if (preset === 'none') return new Set()
  return new Set(items.filter(i => {
    const s = standing(c, i, companies)
    return preset === 'all' ? s !== 'same' : s === 'gap' || s === 'filler'
  }).map(i => i.field))
}

/** Which preset the current ticks equal, or null when the person has ticked their own mix. */
export function presetOf(c: Company, items: readonly CompanyProfileItem[], companies: readonly Company[], ticked: ReadonlySet<CompanyProfileField>): Preset | null {
  for (const p of ['gaps', 'all', 'none'] as const) {
    const want = pick(p, c, items, companies)
    if (want.size === ticked.size && [...want].every(f => ticked.has(f))) return p
  }
  return null
}

export const showValue = (v: string | number | null): string => (v === null ? '' : typeof v === 'number' ? v.toLocaleString('en-AU') : v)

const isRec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** The head office and headcount on a research record, narrowed from the loose JSON it round-trips through. */
export function researchProfileOf(v: unknown): ResearchProfile | null {
  if (!isRec(v)) return null
  const out: ResearchProfile = {}
  if (typeof v.headOffice === 'string' && v.headOffice.trim()) out.headOffice = v.headOffice.trim()
  const e = v.employees
  if (isRec(e) && typeof e.count === 'number' && Number.isInteger(e.count) && e.count > 0) {
    out.employees = { count: e.count, basis: e.basis === 'stated' ? 'stated' : 'estimated', note: typeof e.note === 'string' ? e.note : '' }
  }
  return out.headOffice || out.employees ? out : null
}

/** "Sydney, NSW, Australia" into the company's city, state and country. Two parts are city and country; one part is the city. */
export function splitHeadOffice(s: string): { hq: string; state: string; country: string } {
  const parts = s.split(',').map(x => x.trim()).filter(Boolean)
  if (parts.length >= 3) return { hq: parts[0], state: parts[1], country: parts[parts.length - 1] }
  if (parts.length === 2) return { hq: parts[0], state: '', country: parts[1] }
  return { hq: parts[0] ?? '', state: '', country: '' }
}

/** The employee figure as shown: "about 850" for an estimate, "850" for a stated one. */
export const employeesText = (e: NonNullable<ResearchProfile['employees']>): string =>
  (e.basis === 'estimated' ? 'about ' : '') + e.count.toLocaleString('en-AU')
