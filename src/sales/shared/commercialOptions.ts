import { describePricing, priceTotals, PRICE_UNITS, type PriceUnit } from './dealPricing'

// Ways to structure one deal before the client picks: an outright purchase, SaaS the client hosts, SaaS Ardorio hosts. They sit in the
// deal's `fields.options` (the API stores `fields` per key), so there is one deal in the CRM however many options are on the table. Each
// option is priced as a rate, a term and a one-off fee like a deal is (dealPricing), plus what it is expected to cost Ardorio to deliver.
// The accepted option sets the deal's value and price; the others stay saved.

export type OptionStatus = 'draft' | 'proposed' | 'accepted'
export type Party = '' | 'client' | 'ardorio'

export interface CommercialOption {
  id: string
  name: string
  unit: PriceUnit
  amount: number
  oneOff: number
  /** The term in months: recurring revenue runs over it, and so do the yearly costs. */
  months: number
  hosting: Party
  aiUsage: Party
  support: string
  customDev: string
  notes: string
  /** What it costs Ardorio, ex GST. Hosting and AI costs count only when Ardorio is the party responsible for them. */
  costOneOff: number
  costHostingYear: number
  costAiYear: number
  costSupportYear: number
  status: OptionStatus
}

export const MAX_OPTIONS = 20
export const PARTY_LABEL: Record<Exclude<Party, ''>, string> = { client: 'Client', ardorio: 'Ardorio' }
export const STATUS_LABEL: Record<OptionStatus, string> = { draft: 'Draft', proposed: 'Proposed', accepted: 'Accepted' }

const isRec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const money = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1e9) : 0
}
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
const cents = (n: number): number => Math.round(n * 100) / 100

export function newOption(id: string, n: number): CommercialOption {
  return {
    id, name: `Option ${n}`, unit: 'year', amount: 0, oneOff: 0, months: 36, hosting: '', aiUsage: '', support: '', customDev: '', notes: '',
    costOneOff: 0, costHostingYear: 0, costAiYear: 0, costSupportYear: 0, status: 'draft',
  }
}

/** The options saved on a deal's fields, narrowed from the loose JSON they round-trip through. Unusable entries are dropped. */
export function optionsOf(fields: Record<string, unknown> | undefined): CommercialOption[] {
  const raw = fields?.options
  if (!Array.isArray(raw)) return []
  const out: CommercialOption[] = []
  let accepted = false
  for (const o of raw.slice(0, MAX_OPTIONS)) {
    if (!isRec(o) || typeof o.id !== 'string' || !o.id) continue
    const unit = PRICE_UNITS.find(u => u === o.unit) ?? 'year'
    const hosting = o.hosting === 'client' || o.hosting === 'ardorio' ? o.hosting : ''
    const aiUsage = o.aiUsage === 'client' || o.aiUsage === 'ardorio' ? o.aiUsage : ''
    let status: OptionStatus = o.status === 'accepted' || o.status === 'proposed' ? o.status : 'draft'
    if (status === 'accepted') { if (accepted) status = 'proposed'; accepted = true }
    out.push({
      id: o.id, name: text(o.name, 120) || 'Untitled option', unit, amount: money(o.amount), oneOff: money(o.oneOff),
      months: Math.min(600, Math.floor(money(o.months))), hosting, aiUsage, support: text(o.support, 2000), customDev: text(o.customDev, 2000), notes: text(o.notes, 2000),
      costOneOff: money(o.costOneOff), costHostingYear: money(o.costHostingYear), costAiYear: money(o.costAiYear), costSupportYear: money(o.costSupportYear), status,
    })
  }
  return out
}

export interface OptionFigures {
  /** The total contract: what the client pays over the term, ex GST. */
  revenue: number
  annual: number | null
  /** Estimated cost to Ardorio over the same term. */
  cost: number
  margin: number
  /** Margin as a share of revenue, or null when there is no revenue to take it from. */
  marginPct: number | null
}

export function figuresOf(o: CommercialOption): OptionFigures {
  const t = priceTotals({ unit: o.unit, amount: o.amount, oneOff: o.oneOff }, o.months)
  const years = o.months / 12
  const yearly = (o.hosting === 'ardorio' ? o.costHostingYear : 0) + (o.aiUsage === 'ardorio' ? o.costAiYear : 0) + o.costSupportYear
  const cost = cents(o.costOneOff + yearly * years)
  const margin = cents(t.total - cost)
  return { revenue: t.total, annual: t.annual, cost, margin, marginPct: t.total > 0 ? Math.round((margin / t.total) * 1000) / 10 : null }
}

/** "A$50,000 a year × 3 years", the working shown on an option. */
export const describeOption = (o: CommercialOption, fmt: (n: number) => string): string =>
  o.amount > 0 || o.oneOff > 0 ? describePricing({ unit: o.unit, amount: o.amount, oneOff: o.oneOff }, o.months, fmt) : 'No price yet'

/** What the deal looks like once this option is accepted: its value (the total contract), term and price, and the options with this one marked. */
export function acceptPatch(options: readonly CommercialOption[], id: string): { value: number; contractMonths: number; fields: Record<string, unknown> } | null {
  const o = options.find(x => x.id === id)
  if (!o) return null
  const f = figuresOf(o)
  return {
    value: f.revenue,
    contractMonths: o.unit === 'once' ? 0 : o.months,
    fields: {
      options: options.map(x => ({ ...x, status: x.id === id ? 'accepted' : x.status === 'accepted' ? 'proposed' : x.status })),
      priceUnit: o.unit, priceAmount: o.amount, priceOneOff: o.oneOff,
    },
  }
}

/** The accepted option, if the client has chosen one. */
export const acceptedOf = (options: readonly CommercialOption[]): CommercialOption | undefined => options.find(o => o.status === 'accepted')

/** Mark exactly these options as proposed (draft ones not listed stay draft; an accepted option is left alone). */
export const withProposed = (options: readonly CommercialOption[], ids: ReadonlySet<string>): CommercialOption[] =>
  options.map(o => (o.status === 'accepted' ? o : { ...o, status: ids.has(o.id) ? 'proposed' : 'draft' }))
