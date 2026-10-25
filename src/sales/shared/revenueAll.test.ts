import { describe, expect, it } from 'vitest'
import type { Deal } from '../data/types'
import { account } from '../testing/rosterioWorld'
import { emptyBucket, summarise, type FcEntry } from './forecast'
import { ardorioPlaceholder, ardorioRow, barsOf, dealsRow, pipelineOf, rosterioRow, totalsOf } from './revenueAll'

const MONTHS = ['2026-11', '2026-12', '2027-01', '2027-02']
const deal = (id: string, businessId: string, value: number, over: Partial<Deal> = {}) => ({ id, businessId, value, status: 'won', recurring: true, close: '', ...over }) as Deal
const PROB = (d: Deal): number => (d.stageId === 's50' ? 50 : 10)
const NO_TESTS: ReadonlySet<string> = new Set()
const priced = (id: string, monthlyCost?: number) => account({ id, name: id, ...(monthlyCost === undefined ? {} : { monthlyCost }) })

describe('pipelineOf', () => {
  it('weights open deals by stage probability and files each by close month: before the range in the first month, after it later, none in no date', () => {
    const deals = [
      deal('a', 'adv', 1000, { status: 'open', stageId: 's50', close: '2026-12-10' }),
      deal('b', 'adv', 2000, { status: 'open', stageId: 's50', close: '2026-01-05' }),
      deal('c', 'adv', 3000, { status: 'open', stageId: 's50', close: '2030-01-05' }),
      deal('d', 'adv', 4000, { status: 'open', stageId: 's50', close: '' }),
      deal('e', 'ros', 9000, { status: 'open', stageId: 's50', close: '2026-12-10' }),
      deal('f', 'adv', 9000, { status: 'open', stageId: 's50', close: '2026-12-10', archived: true }),
      deal('g', 'adv', 9000, { status: 'won', close: '2026-12-10' }),
    ]
    const p = pipelineOf(deals, 'adv', MONTHS, PROB)
    expect(p.pipeline).toEqual([100000, 50000, 0, 0])
    expect(p.pipelineLater).toBe(150000)
    expect(p.pipelineNoDate).toBe(200000)
  })
})

describe('dealsRow', () => {
  it('reads won subscription deal values as yearly, held flat, and notes a deal with no value', () => {
    const r = dealsRow({ id: 'adv', name: 'Advantage', accent: '#E8A33D', months: MONTHS, prob: PROB, deals: [deal('a', 'adv', 120000), deal('b', 'adv', 0), deal('c', 'adv', 5000, { recurring: false }), deal('d', 'pth', 99999)] })
    expect(r).toMatchObject({ state: 'ok', recurring: 12000000, isArr: true, contracted: [1000000, 1000000, 1000000, 1000000] })
    expect(r.notes).toEqual(['1 won deal has no value'])
    expect(r.basis).toContain('2 deals')
  })
})

describe('rosterioRow', () => {
  const base = { name: 'Rosterio', accent: '#0E8A7E', deals: [], months: MONTHS, prob: PROB, tests: NO_TESTS, isAdmin: true, failed: false, now: Date.parse('2026-10-25T00:00:00Z') }
  it('holds the paying accounts\' monthly cost flat, counts an unpriced one as 0 with a note, and leaves trials and test accounts out', () => {
    const r = rosterioRow({ ...base, tests: new Set(['t']), accounts: [priced('a', 1000), priced('b', 500), priced('c'), priced('t', 7777), account({ id: 'tr', isTrial: true, trialEndDate: '2026-11-01T00:00:00Z', monthlyCost: 9999 })] })
    expect(r).toMatchObject({ state: 'ok', recurring: 1800000, contracted: [150000, 150000, 150000, 150000], unpriced: 1, trialsEnding: 1 })
    expect(r.notes).toEqual(['1 without a price'])
  })
  it('is locked for someone who is not a Rosterio admin, and when no paying account has a price', () => {
    expect(rosterioRow({ ...base, isAdmin: false, accounts: [priced('a', 1000)] })).toMatchObject({ state: 'locked', recurring: 0 })
    expect(rosterioRow({ ...base, accounts: [priced('a')] })).toMatchObject({ state: 'locked', reason: 'Rosterio sent no prices for its paying accounts.' })
  })
  it('is loading until the accounts arrive and an error when they cannot be read', () => {
    expect(rosterioRow({ ...base, accounts: undefined })).toMatchObject({ state: 'loading' })
    expect(rosterioRow({ ...base, accounts: undefined, failed: true })).toMatchObject({ state: 'error' })
  })
  it('still reports its weighted pipeline when locked', () => {
    const r = rosterioRow({ ...base, isAdmin: false, accounts: undefined, deals: [deal('o', 'ros', 10000, { status: 'open', stageId: 's50', close: '2026-11-20' })] })
    expect(r.pipeline[0]).toBe(500000)
  })
})

describe('ardorioRow and ardorioPlaceholder', () => {
  const entry = (id: string, over: Partial<FcEntry>): FcEntry => ({ id, series: 'project', kind: 'milestone', dealId: 'd', dealName: 'D', companyId: 'c', label: id, cents: 100000, invoiceDay: '2026-11-10', collectDay: '2026-12-10', issued: false, flags: [], ...over })
  it('takes contracted money by month from the forecast, with the pipeline apart', () => {
    const s = summarise({ entries: [entry('m', { cents: 300000 }), entry('i', { kind: 'instalment', cents: 100000, invoiceDay: '2026-12-01' }), entry('p', { series: 'pipeline', kind: 'pipeline', cents: 40000, valueCents: 80000, prob: 50, invoiceDay: '2027-01-15' })] }, MONTHS)
    const r = ardorioRow({ name: 'Ardorio', accent: '#1E1B6B', s, runRate: 9300000, contracts: 2, deals: [], prob: PROB })
    expect(r).toMatchObject({ state: 'ok', recurring: 9300000, isArr: false, contracted: [300000, 100000, 0, 0], pipeline: [0, 0, 40000, 0] })
  })
  it('shows only the pipeline from deals when locked', () => {
    const r = ardorioPlaceholder({ name: 'Ardorio', accent: '#000', months: MONTHS, prob: PROB, state: 'locked', reason: 'x', deals: [deal('o', 'ard', 20000, { status: 'open', stageId: 's50', close: '2027-02-01' })] })
    expect(r).toMatchObject({ state: 'locked', contracted: [0, 0, 0, 0], pipeline: [0, 0, 0, 1000000] })
    expect(emptyBucket().pipeline).toBe(0)
  })
})

describe('barsOf and totalsOf', () => {
  const ok = dealsRow({ id: 'adv', name: 'Advantage', accent: '#E8A33D', months: MONTHS, prob: PROB, deals: [deal('a', 'adv', 12000)] })
  const locked = rosterioRow({ name: 'Rosterio', accent: '#0E8A7E', deals: [deal('o', 'ros', 10000, { status: 'open', stageId: 's50', close: '2026-11-20' })], months: MONTHS, prob: PROB, accounts: undefined, tests: NO_TESTS, isAdmin: false, failed: false })
  it('makes a bar a month with a part for each business that is ok, and the pipeline of all of them', () => {
    const bars = barsOf([ok, locked], MONTHS, 'm12', ym => ym)
    expect(bars).toHaveLength(4)
    expect(bars[0].parts.map(p => [p.id, p.cents])).toEqual([['adv', 100000], ['ros', 0]])
    expect(bars[0].pipeline).toBe(500000)
  })
  it('groups by financial year for the fy range', () => {
    const bars = barsOf([ok], ['2027-05', '2027-06', '2027-07'], 'fy', ym => ym)
    expect(bars.map(b => [b.label, b.parts[0].cents])).toEqual([['FY27', 200000], ['FY28', 100000]])
  })
  it('totals only what is shown, keeps the pipeline of every row, and says when it is not complete', () => {
    expect(totalsOf([ok, locked])).toEqual({ contracted: 400000, recurring: 1200000, arr: 1200000, ardorioRunRate: 0, pipeline: 500000, complete: false })
    expect(totalsOf([ok]).complete).toBe(true)
  })
})
