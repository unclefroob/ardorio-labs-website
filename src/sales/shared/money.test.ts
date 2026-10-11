import { describe, expect, it } from 'vitest'
import {
  centsToInput, computeTotals, formatCents, formatCentsTile, lineAmountCents, parseCents, parsePercentBp, parseQtyMilli, rateToPercentText,
} from './money'

describe('parseCents', () => {
  it.each([
    ['480', 48000], ['480.00', 48000], ['14,400.00', 1440000], ['$1,234.5', 123450], ['0.05', 5], ['.5', 50], ['19.99', 1999], ['  12 ', 1200],
  ])('reads %s as %i cents', (text, cents) => {
    expect(parseCents(text)).toBe(cents)
  })

  it('does not drift the way float arithmetic does', () => {
    // 1.15 * 100 === 114.99999999999999 and 0.29 * 100 === 28.999999999999996 in floating point.
    expect(parseCents('1.15')).toBe(115)
    expect(parseCents('0.29')).toBe(29)
    expect(parseCents('4.35')).toBe(435)
    expect(parseCents('8.2')).toBe(820)
  })

  it.each(['', '  ', 'abc', '1.234', '-5', '1e3', '1.2.3', '$', '.', '100000001'])('rejects %j', text => {
    expect(parseCents(text)).toBeNull()
  })
})

describe('parseQtyMilli', () => {
  it('keeps fractional hours exact', () => {
    expect(parseQtyMilli('7.5')).toBe(7500)
    expect(parseQtyMilli('1')).toBe(1000)
    expect(parseQtyMilli('0.125')).toBe(125)
    expect(parseQtyMilli('.5')).toBe(500)
  })
  it('rejects zero, negatives, junk and too many decimals', () => {
    for (const bad of ['0', '0.000', '-1', '', 'x', '1.2345']) expect(parseQtyMilli(bad)).toBeNull()
  })
})

describe('lineAmountCents', () => {
  it('multiplies in integers and rounds half up', () => {
    expect(lineAmountCents('7.5', '480.00')).toBe(360000)
    expect(lineAmountCents('1', '14400')).toBe(1440000)
    expect(lineAmountCents('0.333', '10.00')).toBe(333)
    expect(lineAmountCents('0.5', '0.01')).toBe(1) // 0.5 cent rounds up
    expect(lineAmountCents('3', '19.99')).toBe(5997)
  })
  it('is null until both parts are valid', () => {
    expect(lineAmountCents('', '10')).toBeNull()
    expect(lineAmountCents('1', 'ten')).toBeNull()
  })
})

describe('percent and rate', () => {
  it('parses GST as basis points', () => {
    expect(parsePercentBp('10')).toBe(1000)
    expect(parsePercentBp('7.5')).toBe(750)
    expect(parsePercentBp('0')).toBe(0)
    expect(parsePercentBp('100')).toBe(10000)
    expect(parsePercentBp('10%')).toBe(1000)
  })
  it.each(['', '101', '-1', '1.234', 'ten'])('rejects %j', t => expect(parsePercentBp(t)).toBeNull())
  it('writes a stored rate back as text', () => {
    expect(rateToPercentText(0.1)).toBe('10')
    expect(rateToPercentText(0)).toBe('0')
    expect(rateToPercentText(0.075)).toBe('7.5')
    expect(rateToPercentText(0.0725)).toBe('7.25')
  })
})

describe('computeTotals', () => {
  it('matches the design example: 14,400.00 + 7.5 h at 480.00, plus 10% GST', () => {
    const t = computeTotals([{ qty: '1', unitPrice: '14,400.00' }, { qty: '7.5', unitPrice: '480.00' }], 1000)
    expect(t.lineAmounts).toEqual([1440000, 360000])
    expect(t.subtotalCents).toBe(1800000)
    expect(t.gstCents).toBe(180000)
    expect(t.totalCents).toBe(1980000)
  })
  it('rounds GST once, on the sum', () => {
    const t = computeTotals([{ qty: '1', unitPrice: '0.05' }, { qty: '1', unitPrice: '0.05' }], 1000)
    expect(t.subtotalCents).toBe(10)
    expect(t.gstCents).toBe(1)
  })
  it('zero-rated work has no GST', () => {
    expect(computeTotals([{ qty: '2', unitPrice: '50' }], 0)).toMatchObject({ subtotalCents: 10000, gstCents: 0, totalCents: 10000 })
  })
  it('counts an unfinished line as zero instead of NaN', () => {
    expect(computeTotals([{ qty: '', unitPrice: '5' }], 1000).totalCents).toBe(0)
  })
})

describe('formatting', () => {
  it('formats cents as AUD', () => {
    expect(formatCents(1980000)).toBe('$19,800.00')
    expect(formatCents(5)).toBe('$0.05')
  })
  it('shows whole dollars on tiles, cents when there are some', () => {
    expect(formatCentsTile(2250000)).toBe('$22,500')
    expect(formatCentsTile(2250050)).toBe('$22,500.50')
  })
  it('turns cents into input text without a float', () => {
    expect(centsToInput(1440000)).toBe('14400.00')
    expect(centsToInput(5)).toBe('0.05')
    expect(centsToInput(1999)).toBe('19.99')
  })
  it('round trips what a person types', () => {
    for (const t of ['0.07', '1.15', '19.99', '1234.50']) expect(centsToInput(parseCents(t) as number)).toBe(Number(t).toFixed(2))
  })
})
