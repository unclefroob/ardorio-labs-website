import { describe, expect, it } from 'vitest'
import { describePricing, priceTotals, pricingOf } from './dealPricing'

const money = (n: number): string => 'A$' + n.toLocaleString('en-AU')

describe('deal pricing', () => {
  it('multiplies a yearly price by the years in the term', () => {
    expect(priceTotals({ unit: 'year', amount: 50000, oneOff: 0 }, 24)).toEqual({ total: 100000, annual: 50000, periods: 24 })
  })
  it('multiplies a monthly price by the months and annualises it', () => {
    expect(priceTotals({ unit: 'month', amount: 4000, oneOff: 0 }, 36)).toEqual({ total: 144000, annual: 48000, periods: 36 })
  })
  it('adds the one-off fee once, however long the term', () => {
    expect(priceTotals({ unit: 'year', amount: 50000, oneOff: 20000 }, 24).total).toBe(120000)
  })
  it('pro-rates a yearly price over a part-year term, to the cent', () => {
    expect(priceTotals({ unit: 'year', amount: 10000, oneOff: 0 }, 18).total).toBe(15000)
    expect(priceTotals({ unit: 'year', amount: 1000, oneOff: 0 }, 7).total).toBe(583.33)
  })
  it('ignores the term for a one-off price', () => {
    expect(priceTotals({ unit: 'once', amount: 80000, oneOff: 0 }, 36)).toEqual({ total: 80000, annual: null, periods: 1 })
  })
  it('totals only the one-off fee when the term is empty or invalid', () => {
    expect(priceTotals({ unit: 'year', amount: 50000, oneOff: 5000 }, 0).total).toBe(5000)
    expect(priceTotals({ unit: 'month', amount: 100, oneOff: 0 }, NaN).total).toBe(0)
  })
  it('reads pricing from fields only when a unit was saved', () => {
    expect(pricingOf({})).toBeNull()
    expect(pricingOf({ priceUnit: 'weekly' })).toBeNull()
    expect(pricingOf({ priceUnit: 'year', priceAmount: '50,000', priceOneOff: 0 })).toEqual({ unit: 'year', amount: 50000, oneOff: 0 })
  })
  it('describes the working', () => {
    expect(describePricing({ unit: 'year', amount: 50000, oneOff: 20000 }, 24, money)).toBe('A$50,000 a year × 2 years + A$20,000 one-off')
    expect(describePricing({ unit: 'month', amount: 4000, oneOff: 0 }, 36, money)).toBe('A$4,000 a month × 36 months')
  })
})
