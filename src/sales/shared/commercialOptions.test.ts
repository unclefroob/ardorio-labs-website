import { describe, expect, it } from 'vitest'
import { acceptPatch, acceptedOf, describeOption, figuresOf, newOption, optionsOf, withProposed } from './commercialOptions'

const opt = (over: Record<string, unknown>) => ({ ...newOption('o1', 1), ...over }) as ReturnType<typeof newOption>
const money = (n: number): string => `A$${n.toLocaleString('en-AU')}`

describe('figuresOf: the Ozdare example', () => {
  it('outright purchase: A$150k up front, client hosts and pays for AI, no cost to Ardorio', () => {
    const f = figuresOf(opt({ unit: 'once', amount: 150000, months: 0, hosting: 'client', aiUsage: 'client', costHostingYear: 9000, costAiYear: 12000 }))
    expect(f).toEqual({ revenue: 150000, annual: null, cost: 0, margin: 150000, marginPct: 100 })
  })

  it('SaaS client hosted: A$50k a year for 3 years is A$150k', () => {
    const f = figuresOf(opt({ unit: 'year', amount: 50000, months: 36, hosting: 'client', aiUsage: 'client', costSupportYear: 4000 }))
    expect(f).toMatchObject({ revenue: 150000, annual: 50000, cost: 12000, margin: 138000, marginPct: 92 })
  })

  it('SaaS Ardorio hosted: hosting and AI costs count and bring the margin down', () => {
    const f = figuresOf(opt({ unit: 'year', amount: 50000, months: 36, hosting: 'ardorio', aiUsage: 'ardorio', costHostingYear: 6000, costAiYear: 8000, costSupportYear: 4000, costOneOff: 10000 }))
    expect(f.cost).toBe(64000)
    expect(f.margin).toBe(86000)
    expect(f.marginPct).toBe(57.3)
  })

  it('has no margin percentage when there is no price', () => {
    expect(figuresOf(opt({}))).toMatchObject({ revenue: 0, margin: 0, marginPct: null })
    expect(figuresOf(opt({ costOneOff: 500 }))).toMatchObject({ margin: -500, marginPct: null })
  })

  it('adds a one-off fee to the recurring price', () => {
    expect(figuresOf(opt({ unit: 'month', amount: 4000, months: 12, oneOff: 20000 })).revenue).toBe(68000)
  })
})

describe('optionsOf', () => {
  it('reads the saved list and ignores anything that is not an option', () => {
    const out = optionsOf({ options: [{ id: 'a', name: 'One', unit: 'month', amount: '4,000', months: 24 }, 'x', null, { name: 'no id' }, { id: '' }] })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'a', name: 'One', unit: 'month', amount: 4000, months: 24, status: 'draft', hosting: '' })
  })

  it('returns nothing for a deal with no options or a malformed value', () => {
    expect(optionsOf(undefined)).toEqual([])
    expect(optionsOf({ options: 'nope' })).toEqual([])
  })

  it('keeps at most one accepted option', () => {
    const out = optionsOf({ options: [{ id: 'a', status: 'accepted' }, { id: 'b', status: 'accepted' }] })
    expect(out.map(o => o.status)).toEqual(['accepted', 'proposed'])
  })

  it('clamps unusable numbers and an unknown unit', () => {
    const [o] = optionsOf({ options: [{ id: 'a', unit: 'week', amount: -5, months: 99999, costOneOff: 'abc' }] })
    expect(o).toMatchObject({ unit: 'year', amount: 0, months: 600, costOneOff: 0 })
  })
})

describe('acceptPatch', () => {
  const options = [opt({ id: 'a', unit: 'once', amount: 150000, months: 0 }), opt({ id: 'b', unit: 'year', amount: 50000, months: 36, status: 'proposed' }), opt({ id: 'c', status: 'accepted' })]

  it('sets the deal to the accepted option: total contract, term and price', () => {
    const p = acceptPatch(options, 'b')
    expect(p).toMatchObject({ value: 150000, contractMonths: 36 })
    expect(p?.fields).toMatchObject({ priceUnit: 'year', priceAmount: 50000, priceOneOff: 0 })
  })

  it('marks the chosen option accepted, demotes a previously accepted one, and keeps every option', () => {
    const next = (acceptPatch(options, 'a')?.fields.options as Array<{ id: string; status: string }>)
    expect(next.map(o => [o.id, o.status])).toEqual([['a', 'accepted'], ['b', 'proposed'], ['c', 'proposed']])
  })

  it('a one-off option has no term', () => {
    expect(acceptPatch(options, 'a')?.contractMonths).toBe(0)
  })

  it('returns null for an unknown option', () => expect(acceptPatch(options, 'zzz')).toBeNull())
})

describe('withProposed and acceptedOf', () => {
  const options = [opt({ id: 'a' }), opt({ id: 'b', status: 'proposed' }), opt({ id: 'c', status: 'accepted' })]
  it('marks the chosen ones proposed, resets the rest to draft, and leaves an accepted option alone', () => {
    expect(withProposed(options, new Set(['a'])).map(o => o.status)).toEqual(['proposed', 'draft', 'accepted'])
  })
  it('finds the accepted option', () => {
    expect(acceptedOf(options)?.id).toBe('c')
    expect(acceptedOf([opt({})])).toBeUndefined()
  })
})

describe('describeOption', () => {
  it('shows the working, or says there is no price yet', () => {
    expect(describeOption(opt({ unit: 'year', amount: 50000, months: 36 }), money)).toBe('A$50,000 a year × 3 years')
    expect(describeOption(opt({}), money)).toBe('No price yet')
  })
})
