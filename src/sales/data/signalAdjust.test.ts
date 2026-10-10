import { describe, expect, it } from 'vitest'
import type { CompanySignal, TechItem } from '../api/contract'
import { adjustSummary, ageDays, applySignalAdjust, computeSignalAdjust, mergeTech } from './signalAdjust'
import type { Intel } from './types'

const NOW = Date.parse('2026-10-10T00:00:00Z')

const sig = (s: Partial<CompanySignal> & Pick<CompanySignal, 'kind'>): CompanySignal => ({ headline: 'h', sourceUrl: 'https://a.test/x', date: '2026-09-20', ...s })
const rec = (kind: Intel['kind'], items: Intel['items'], ts = '2026-10-01T00:00:00Z'): Intel => ({
  id: 'i', businessId: 'ros', companyId: 'co1', kind, ts, by: 'u', provider: 'xai', model: null, items, sources: [], disclaimer: '',
})
const tool = (name: string, competitor?: boolean): TechItem => ({ name, category: 'rostering', evidence: 'e', sourceUrl: 'https://a.test/t', ...(competitor ? { competitor } : {}) })

describe('computeSignalAdjust', () => {
  it('is zero with nothing saved', () => {
    expect(computeSignalAdjust([], NOW)).toEqual({ delta: 0, parts: [] })
  })

  it('scores hr/ops hiring, expansion, funding and a competitor tool', () => {
    const a = computeSignalAdjust([
      rec('signals', [sig({ kind: 'hiring', hrOps: true }), sig({ kind: 'expansion' }), sig({ kind: 'funding' })]),
      rec('tech', [tool('Deputy', true)]),
    ], NOW)
    expect(a.parts.map(p => p.points)).toEqual([8, 8, 8, 10])
    expect(a.delta).toBe(30)
  })

  it('does not count hiring that is not an HR/ops role', () => {
    expect(computeSignalAdjust([rec('signals', [sig({ kind: 'hiring' }), sig({ kind: 'hiring', hrOps: false })])], NOW).delta).toBe(0)
  })

  it('counts each kind once however many signals repeat it', () => {
    const a = computeSignalAdjust([rec('signals', [sig({ kind: 'expansion' }), sig({ kind: 'expansion', headline: 'again' })])], NOW)
    expect(a.delta).toBe(8)
    expect(a.parts).toHaveLength(1)
  })

  it('counts a competitor once when several are in use', () => {
    expect(computeSignalAdjust([rec('tech', [tool('Deputy', true), tool('Tanda', true), tool('Xero')])], NOW).delta).toBe(10)
  })

  it('ignores signals older than 180 days and keeps ones just inside', () => {
    const old = sig({ kind: 'expansion', date: '2026-04-01' })
    const edge = sig({ kind: 'funding', date: '2026-04-20' })
    expect(computeSignalAdjust([rec('signals', [old])], NOW).delta).toBe(0)
    expect(computeSignalAdjust([rec('signals', [edge])], NOW).delta).toBe(8)
  })

  it('falls back to the day the lookup ran when a signal has no usable date', () => {
    const undated = sig({ kind: 'expansion', date: undefined })
    expect(computeSignalAdjust([rec('signals', [undated], '2026-10-01T00:00:00Z')], NOW).delta).toBe(8)
    expect(computeSignalAdjust([rec('signals', [undated], '2025-10-01T00:00:00Z')], NOW).delta).toBe(0)
    expect(computeSignalAdjust([rec('signals', [sig({ kind: 'expansion', date: 'last spring' })], '2025-10-01T00:00:00Z')], NOW).delta).toBe(0)
  })

  it('a reported closure takes 30 off and the total never goes below -30', () => {
    const a = computeSignalAdjust([rec('signals', [sig({ kind: 'closure' }), sig({ kind: 'expansion' })])], NOW)
    expect(a.parts.map(p => p.points).sort((x, y) => x - y)).toEqual([-30, 8])
    expect(a.delta).toBe(-22)
    expect(computeSignalAdjust([rec('signals', [sig({ kind: 'closure' })])], NOW).delta).toBe(-30)
  })

  it('clamps the total to +30', () => {
    const a = computeSignalAdjust([
      rec('signals', [sig({ kind: 'hiring', hrOps: true }), sig({ kind: 'expansion' }), sig({ kind: 'funding' })]),
      rec('tech', [tool('Deputy', true)]),
    ], NOW)
    expect(a.parts.reduce((n, p) => n + p.points, 0)).toBe(34)
    expect(a.delta).toBe(30)
  })

  it('ignores news, awards, leadership and malformed items', () => {
    const junk = [sig({ kind: 'news' }), sig({ kind: 'award' }), sig({ kind: 'leadership' }), null, 'x', {}] as unknown as Intel['items']
    expect(computeSignalAdjust([rec('signals', junk)], NOW).delta).toBe(0)
  })

  it('does not read tech findings from a signals record or the reverse', () => {
    expect(computeSignalAdjust([rec('signals', [tool('Deputy', true)])], NOW).delta).toBe(0)
    expect(computeSignalAdjust([rec('tech', [sig({ kind: 'expansion' })])], NOW).delta).toBe(0)
  })
})

describe('applySignalAdjust', () => {
  it('leaves the score alone when nothing moved it', () => {
    expect(applySignalAdjust(98, 0)).toBe(98)
  })
  it('caps a rise at 96', () => {
    expect(applySignalAdjust(80, 30)).toBe(96)
    expect(applySignalAdjust(60, 16)).toBe(76)
  })
  it('does not pull a base above 96 down when it rises', () => {
    expect(applySignalAdjust(98, 8)).toBe(98)
  })
  it('floors a fall at 0', () => {
    expect(applySignalAdjust(12, -30)).toBe(0)
    expect(applySignalAdjust(70, -30)).toBe(40)
  })
})

describe('adjustSummary', () => {
  it('names the movement and its reasons', () => {
    expect(adjustSummary({ delta: 16, parts: [{ label: 'HR/ops hiring', points: 8 }, { label: 'expansion', points: 8 }] })).toBe('Signals +16: HR/ops hiring, expansion')
    expect(adjustSummary({ delta: -30, parts: [{ label: 'closure reported', points: -30 }] })).toBe('Signals −30: closure reported')
    expect(adjustSummary({ delta: 0, parts: [] })).toBe('')
  })
})

describe('ageDays', () => {
  it('counts whole days and treats a bad date as stale', () => {
    expect(ageDays('2026-10-07T12:00:00Z', NOW)).toBe(2)
    expect(ageDays('2026-10-11T00:00:00Z', NOW)).toBe(0)
    expect(ageDays(undefined, NOW)).toBe(Infinity)
    expect(ageDays('nope', NOW)).toBe(Infinity)
  })
})

describe('mergeTech', () => {
  it('adds new names, skips duplicates ignoring case and blanks', () => {
    expect(mergeTech(['Xero'], ['xero', 'Deputy', ' deputy ', '', 'Tanda'])).toEqual(['Xero', 'Deputy', 'Tanda'])
  })
})
