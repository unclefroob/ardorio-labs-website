export function parseCSV(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input   // an Excel or Wiza export starts with a byte order mark
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  const flush = (): void => {
    row.push(cur)
    if (row.some(x => x.trim())) rows.push(row)
    row = []
    cur = ''
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(cur)
      cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      flush()
    } else cur += c
  }
  flush()
  return rows
}

export type MapKey =
  | 'firstName' | 'lastName' | 'fullName' | 'title' | 'email' | 'emailStatus' | 'mobile' | 'phone' | 'linkedin' | 'location'
  | 'company' | 'website' | 'industry' | 'subindustry' | 'employees' | 'description' | 'companyLinkedin' | 'companyType' | 'address' | 'city' | 'state' | 'country'

export type MapGroup = 'contact' | 'company'

/** The fields a column can fill, in the order the mapping step lists them. The regex is the guess for a CSV that is not a known export. */
export const MAPF: ReadonlyArray<readonly [MapKey, string, RegExp, MapGroup]> = [
  ['firstName', 'First name', /^first([ _-]?name)?$|^given/i, 'contact'],
  ['lastName', 'Last name', /^last([ _-]?name)?$|^surname$|^family[ _-]?name$/i, 'contact'],
  ['fullName', 'Full name', /^(full[ _-]?)?name$|^contact[ _-]?name$/i, 'contact'],
  ['title', 'Job title', /^(job[ _-]?)?title$|^position$|^role$/i, 'contact'],
  ['email', 'Email', /^(work[ _-]?|business[ _-]?)?e-?mail([ _-]?address)?$/i, 'contact'],
  ['emailStatus', 'Email verification', /^e-?mail[ _-]?(status|verification)$/i, 'contact'],
  ['mobile', 'Mobile', /mobile|^cell/i, 'contact'],
  ['phone', 'Phone', /^(work[ _-]?|direct[ _-]?|office[ _-]?)?(phone|tel)/i, 'contact'],
  ['linkedin', 'LinkedIn URL', /^((person|contact)[ _-]?)?linkedin([ _-]?(url|profile([ _-]?url)?))?$/i, 'contact'],
  ['location', 'Location', /^(person[ _-]?)?location$/i, 'contact'],
  ['company', 'Company name', /^(company|organi[sz]ation|account)([ _-]?name)?$/i, 'company'],
  ['website', 'Website', /website|^(company[ _-]?)?(domain|url)$/i, 'company'],
  ['industry', 'Industry', /^(company[ _-]?)?industry$|^sector$/i, 'company'],
  ['subindustry', 'Sub-industry', /^(company[ _-]?)?sub[ _-]?industry$/i, 'company'],
  ['employees', 'Employees', /^(company[ _-]?)?(size|employees|headcount)$|employee[ _-]?count|number of employees/i, 'company'],
  ['description', 'Description', /^(company[ _-]?)?description$/i, 'company'],
  ['companyLinkedin', 'Company LinkedIn', /^company[ _-]?linkedin/i, 'company'],
  ['companyType', 'Company type', /^company[ _-]?type$/i, 'company'],
  ['address', 'Address', /^(company[ _-]?)?(street|address)$/i, 'company'],
  ['city', 'City', /^(company[ _-]?)?(locality|city|suburb)$/i, 'company'],
  ['state', 'State', /^(company[ _-]?)?(region|state)$/i, 'company'],
  ['country', 'Country', /^(company[ _-]?)?country$/i, 'company'],
]

export const mapLabel = (k: string): string => MAPF.find(m => m[0] === k)?.[1] ?? k

export const isMapKey = (v: string): v is MapKey => MAPF.some(m => m[0] === v)

export const TEMPLATE_HEADER = 'First name,Last name,Company,Job title,Email,Mobile,Phone,LinkedIn URL,Company website,Location,Industry'

// A Wiza export names its columns the same every time, so they are matched by exact name. Its person-level `locality`, `region`
// and `country` columns are not the company's, which is why the company ones are listed by their company_ names and nothing else.
const WIZA_MAP: Readonly<Record<string, MapKey>> = {
  first_name: 'firstName', last_name: 'lastName', title: 'title', email: 'email', email_status: 'emailStatus', linkedin: 'linkedin', location: 'location',
  company: 'company', company_domain: 'website', company_industry: 'industry', company_subindustry: 'subindustry', company_size: 'employees',
  company_description: 'description', company_linkedin: 'companyLinkedin', company_type: 'companyType', company_street: 'address',
  company_locality: 'city', company_region: 'state', company_country: 'country',
}
const WIZA_MARKERS = ['email_status', 'company_domain', 'first_name', 'last_name', 'company_industry']

export const isWizaHeader = (headers: readonly string[]): boolean => WIZA_MARKERS.every(m => headers.includes(m))

export interface AutoMap { map: Record<number, MapKey | ''>; wiza: boolean }

/** The first guess for every column: exact for a Wiza export, by name pattern otherwise. A key is used by one column only. */
export function autoMap(headers: readonly string[], rows: readonly string[][] = []): AutoMap {
  const map: Record<number, MapKey | ''> = {}
  const used = new Set<MapKey>()
  const wiza = isWizaHeader(headers)
  const claim = (i: number, k: MapKey): void => { map[i] = k; used.add(k) }
  headers.forEach((_, i) => { map[i] = '' })
  if (wiza) {
    headers.forEach((h, i) => {
      const k = WIZA_MAP[h]
      if (k && !used.has(k)) claim(i, k)
    })
  }
  headers.forEach((h, i) => {
    if (map[i]) return
    if (wiza && h in WIZA_MAP) return
    const hit = MAPF.find(([k, , rx]) => !used.has(k) && rx.test(h.trim()))
    if (hit && !(wiza && /^(locality|region|country)/i.test(h))) claim(i, hit[0])
  })
  // Text that is the same on every row is filler (a vendor's demo text), so it is not mapped unless the person chooses to.
  for (const [i, k] of Object.entries(map)) {
    if (k === 'description' && isFiller(rows.map(r => (r[Number(i)] ?? '').trim()).filter(Boolean))) map[Number(i)] = ''
  }
  return { map, wiza }
}

/** True when there are enough values to judge and they are all one string. */
export const isFiller = (values: readonly string[], min = 3): boolean => values.length >= min && values.every(v => v === values[0])

/** Columns with a value on at least one row, and how many rows have one. */
export const filledCount = (rows: readonly string[][], col: number): number => rows.reduce((n, r) => n + ((r[col] ?? '').trim() ? 1 : 0), 0)
