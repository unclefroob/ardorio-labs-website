export function parseCSV(text: string): string[][] {
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

export type MapKey = 'firstName' | 'lastName' | 'fullName' | 'company' | 'title' | 'email' | 'phone' | 'linkedin' | 'website' | 'location' | 'industry'

export const MAPF: ReadonlyArray<readonly [MapKey, string, RegExp]> = [
  ['firstName', 'First name', /^first|given/i],
  ['lastName', 'Last name', /^last|surname|family/i],
  ['fullName', 'Full name', /^(full ?)?name$|contact name/i],
  ['company', 'Company', /company|organi[sz]ation|account/i],
  ['title', 'Job title', /title|position|role/i],
  ['email', 'Email', /e-?mail/i],
  ['phone', 'Phone', /phone|mobile|tel/i],
  ['linkedin', 'LinkedIn URL', /linkedin/i],
  ['website', 'Company website', /website|domain|url/i],
  ['location', 'Location', /location|city|state/i],
  ['industry', 'Industry', /industry|sector/i],
]

export const mapLabel = (k: string): string => MAPF.find(m => m[0] === k)?.[1] ?? k

export const isMapKey = (v: string): v is MapKey => MAPF.some(m => m[0] === v)

export const TEMPLATE_HEADER = 'First name,Last name,Company,Job title,Email,Phone,LinkedIn URL,Company website,Location,Industry'
