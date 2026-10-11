/**
 * Money for invoicing. Amounts are integer cents everywhere; text a person types is parsed as a decimal
 * STRING straight to cents, never through a float, so 19.99 * 100 style drift cannot happen.
 */

const MAX_CENTS = 100_000_000_00 // A$100 million, well inside Number.MAX_SAFE_INTEGER

/** Commas are accepted only as well-formed thousands groups ("1,234,567.8"). "12,50" or "7,5" is a typo or a decimal comma: reject, never rescale. */
const stripGroups = (t: string): string | null => {
  if (!t.includes(',')) return t
  return /^\d{1,3}(,\d{3})+(\.\d*)?$/.test(t) ? t.replace(/,/g, '') : null
}

/** "1,234.5", "$12", "0.05" -> cents. Returns null for blanks, negatives, more than 2 decimals or junk. */
export function parseCents(input: string): number | null {
  const t = stripGroups(input.replace(/[$\s]/g, ''))
  if (t === null) return null
  const m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(t)
  if (!m || (m[1] === '' && !m[2])) return null
  const whole = m[1] === '' ? 0 : Number(m[1])
  const frac = (m[2] ?? '').padEnd(2, '0')
  const cents = whole * 100 + Number(frac || '0')
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null
}

/** Quantity text -> thousandths (so 7.5 is 7500). Up to 3 decimals; zero and negatives are not quantities. */
export function parseQtyMilli(input: string): number | null {
  const t = stripGroups(input.replace(/\s/g, ''))
  if (t === null) return null
  const m = /^(\d+)(?:\.(\d{1,3}))?$|^\.(\d{1,3})$/.exec(t)
  if (!m) return null
  const whole = m[1] !== undefined ? Number(m[1]) : 0
  const frac = (m[2] ?? m[3] ?? '').padEnd(3, '0')
  const milli = whole * 1000 + Number(frac || '0')
  return milli > 0 && Number.isSafeInteger(milli) && milli <= 1_000_000_000 ? milli : null
}

/** The quantity as the number the API stores (7.5). Only used after `parseQtyMilli` accepted the text. */
export const milliToQty = (milli: number): number => milli / 1000

/** qty x unit price in cents, rounded half up, in integer arithmetic. */
export function lineAmountCents(qtyText: string, unitText: string): number | null {
  const q = parseQtyMilli(qtyText)
  const u = parseCents(unitText)
  if (q === null || u === null) return null
  return Math.floor((q * u + 500) / 1000)
}

/** Percent text ("10", "7.5") -> basis points (1000, 750). 0..100 with up to 2 decimals. */
export function parsePercentBp(input: string): number | null {
  const t = input.replace(/[%\s]/g, '')
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(t)
  if (!m) return null
  const bp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0')
  return bp <= 10000 ? bp : null
}

/** 0.1 -> "10", 0.075 -> "7.5". */
export function rateToPercentText(rate: number): string {
  const bp = Math.round(rate * 10000)
  const whole = Math.floor(bp / 100)
  const frac = bp % 100
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`
}

export interface Totals { lineAmounts: number[]; subtotalCents: number; gstCents: number; totalCents: number }

/** Mirrors the server: each line rounded (they are printed), summed exactly, GST rounded once. Display only: the server's figures are canonical. */
export function computeTotals(lines: ReadonlyArray<{ qty: string; unitPrice: string }>, gstBp: number): Totals {
  const lineAmounts = lines.map(l => lineAmountCents(l.qty, l.unitPrice) ?? 0)
  const subtotalCents = lineAmounts.reduce((a, b) => a + b, 0)
  const gstCents = Math.floor((subtotalCents * gstBp + 5000) / 10000)
  return { lineAmounts, subtotalCents, gstCents, totalCents: subtotalCents + gstCents }
}

const AUD2 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
const AUD0 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 })

/** "$19,800.00". */
export const formatCents = (cents: number): string => AUD2.format(cents / 100)
/** "$22,500" for tiles, falling back to cents when the amount is not whole dollars. */
export const formatCentsTile = (cents: number): string => (cents % 100 === 0 ? AUD0.format(cents / 100) : AUD2.format(cents / 100))

/** Cents -> the text an input shows ("14400.00"), no float involved. */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const a = Math.abs(Math.round(cents))
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`
}

/** Quantity from the API -> the text an input shows. */
export const qtyToInput = (qty: number): string => String(qty)
