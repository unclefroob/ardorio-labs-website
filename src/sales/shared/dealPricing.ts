// An Ardorio deal can be priced as a rate and a term instead of a typed total: A$50,000 a year for 24 months, or A$4,000 a month
// for 36, plus an optional one-off fee. The deal's value stays the total contract, worked out from these, so the board, forecast,
// goals and reports read the same number as before. The rate, unit and fee live in the deal's `fields`, which the API stores per key.

export type PriceUnit = 'month' | 'year' | 'once'
export const PRICE_UNITS: readonly PriceUnit[] = ['month', 'year', 'once']
export const UNIT_LABEL: Record<PriceUnit, string> = { month: 'Per month', year: 'Per year', once: 'One-off' }
export const TERM_PICKS = [12, 24, 36, 60] as const

export interface Pricing { unit: PriceUnit; amount: number; oneOff: number }
export interface PricingTotals { total: number; annual: number | null; periods: number }

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : 0
}
const cents = (n: number): number => Math.round(n * 100) / 100

/** The pricing saved on a deal's fields, or null when the deal's value was typed in. */
export function pricingOf(fields: Record<string, unknown> | undefined): Pricing | null {
  const unit = fields?.priceUnit
  if (unit !== 'month' && unit !== 'year' && unit !== 'once') return null
  return { unit, amount: num(fields?.priceAmount), oneOff: num(fields?.priceOneOff) }
}

/** The total contract and the annual figure for a price over `months`. A one-off price ignores the term. */
export function priceTotals(p: Pricing, months: number): PricingTotals {
  const m = Number.isFinite(months) && months > 0 ? Math.floor(months) : 0
  if (p.unit === 'once') return { total: cents(p.amount + p.oneOff), annual: null, periods: 1 }
  const recurring = p.unit === 'month' ? p.amount * m : (p.amount * m) / 12
  return { total: cents(recurring + p.oneOff), annual: cents(p.unit === 'month' ? p.amount * 12 : p.amount), periods: m }
}

/** "A$50,000 a year × 2 years + A$20,000 one-off", the working shown beside the total. */
export function describePricing(p: Pricing, months: number, money: (n: number) => string): string {
  const parts: string[] = []
  if (p.unit === 'once') parts.push(`${money(p.amount)} one-off`)
  else {
    const per = p.unit === 'month' ? 'a month' : 'a year'
    const yrs = months % 12 === 0 ? `${months / 12} year${months === 12 ? '' : 's'}` : `${months} months`
    parts.push(`${money(p.amount)} ${per} × ${p.unit === 'month' ? `${months} months` : yrs}`)
  }
  if (p.oneOff > 0) parts.push(`${money(p.oneOff)} one-off`)
  return parts.join(' + ')
}
