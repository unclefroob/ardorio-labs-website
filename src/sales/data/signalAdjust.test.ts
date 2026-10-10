import { describe, expect, it } from 'vitest'
import type { CompanySignal, TechItem } from '../api/contract'
import { adjustSummary, ageDays, applySignalAdjust, computeSignalAdjust, mergeTech, openerUsable, sameClosure, scoringSignal, signalTime, urlKey } from './signalAdjust'
import type { Intel } from './types'

const NOW = Date.parse('2026-10-10T00:00:00Z')

const sig = (s: Partial<CompanySignal> & Pick<CompanySignal, 'kind'>): CompanySignal => ({ headline: 'h', sourceUrl: 'https://a.test/x', date: '2026-09-20', ...s })
const rec = (kind: Intel['kind'], items: Intel['items'], ts = '2026-10-01T00:00:00Z'): Intel => ({
  id: 'i', businessId: 'ros', companyId: 'co1', kind, ts, by: 'u', provider: 'xai', model: null, items, sources: [], disclaimer: '',
})
const tool = (name: string, competitor?: boolean): TechItem => ({ name, category: 'rostering', evidence: 'e', sourceUrl: 'https://a.test/t', ...(competitor ? { competitor } : {}) })

describe('computeSignalAdjust', () => {
  it('is zero with nothing saved', () => {
    expect(computeSignalAdjust([], NOW)).toEqual({ delta: 0, parts: [], pending: [] })
  })

  it('scores hr/ops hiring, expansion, funding and a competitor tool', () => {
    const a = computeSignalAdjust([
      rec('signals', [sig({ kind: 'hiring', hrOps: true }), sig({ kind: 'expansion' }), sig({ kind: 'funding' })]),
      rec('tech', [tool('Deputy', true)]),
    ], NOW)
    expect(a.parts.map(p => p.points)).toEqual([8, 8, 8, 10])
    expect(a.parts[0]).toMatchObject({ sourceUrl: 'https://a.test/x', date: '2026-09-20' })
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

  it('never uses the day the lookup ran: an undated signal is display-only', () => {
    const undated = sig({ kind: 'expansion', date: undefined })
    expect(computeSignalAdjust([rec('signals', [undated], '2026-10-09T00:00:00Z')], NOW).delta).toBe(0)
    expect(computeSignalAdjust([rec('signals', [sig({ kind: 'expansion', date: 'last spring' })], '2026-10-09T00:00:00Z')], NOW).delta).toBe(0)
    expect(computeSignalAdjust([rec('signals', [sig({ kind: 'funding', date: '2026-02-30' })], '2026-10-09T00:00:00Z')], NOW).delta).toBe(0)
  })

  it('needs a usable source address as well as a date', () => {
    for (const sourceUrl of ['', 'not a url', 'javascript:alert(1)', 'ftp://a.test/x']) {
      expect(computeSignalAdjust([rec('signals', [sig({ kind: 'expansion', sourceUrl })])], NOW).delta).toBe(0)
    }
  })

  it('a reported closure nobody has confirmed moves nothing and is listed as pending', () => {
    const a = computeSignalAdjust([rec('signals', [sig({ kind: 'closure', headline: 'Acme to close' }), sig({ kind: 'expansion' })])], NOW)
    expect(a.parts.map(p => p.points)).toEqual([8])
    expect(a.delta).toBe(8)
    expect(a.pending).toEqual([{ headline: 'Acme to close', sourceUrl: 'https://a.test/x', date: '2026-09-20' }])
  })

  it('a confirmed closure takes 30 off and the total never goes below -30', () => {
    const closure = sig({ kind: 'closure', review: 'confirmed' })
    const a = computeSignalAdjust([rec('signals', [closure, sig({ kind: 'expansion' })])], NOW)
    expect(a.parts.map(p => p.points).sort((x, y) => x - y)).toEqual([-30, 8])
    expect(a.delta).toBe(-22)
    expect(a.pending).toEqual([])
    expect(computeSignalAdjust([rec('signals', [closure])], NOW).delta).toBe(-30)
  })

  it('a dismissed closure moves nothing and is not pending', () => {
    const a = computeSignalAdjust([rec('signals', [sig({ kind: 'closure', review: 'dismissed' })])], NOW)
    expect(a).toEqual({ delta: 0, parts: [], pending: [] })
  })

  it('an undated or stale closure is neither scored nor pending, even if confirmed', () => {
    const a = computeSignalAdjust([rec('signals', [sig({ kind: 'closure', date: undefined, review: 'confirmed' }), sig({ kind: 'closure', date: '2025-01-01', review: 'confirmed' })])], NOW)
    expect(a).toEqual({ delta: 0, parts: [], pending: [] })
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
    expect(adjustSummary({ delta: 16, parts: [{ label: 'HR/ops hiring', points: 8 }, { label: 'expansion', points: 8 }], pending: [] })).toBe('Signals +16: HR/ops hiring, expansion')
    expect(adjustSummary({ delta: -30, parts: [{ label: 'closure confirmed', points: -30 }], pending: [] })).toBe('Signals −30: closure confirmed')
    expect(adjustSummary({ delta: 0, parts: [], pending: [] })).toBe('')
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

describe('signalTime and scoringSignal', () => {
  it('reads only a real own date', () => {
    expect(signalTime({ date: '2026-09-20' })).toBe(Date.parse('2026-09-20T00:00:00Z'))
    for (const date of [undefined, '', '20 Sep 2026', '2026-13-01', '2026-02-30']) expect(Number.isNaN(signalTime({ date }))).toBe(true)
  })
  it('needs an address and a date inside 180 days', () => {
    expect(scoringSignal(sig({ kind: 'news' }), NOW)).toBe(true)
    expect(scoringSignal(sig({ kind: 'news', date: undefined }), NOW)).toBe(false)
    expect(scoringSignal(sig({ kind: 'news', date: '2026-04-01' }), NOW)).toBe(false)
    expect(scoringSignal(sig({ kind: 'news', sourceUrl: 'x' }), NOW)).toBe(false)
  })
})

describe('openerUsable (mirrors the server)', () => {
  it('accepts a dated, sourced, non-closure signal', () => {
    expect(openerUsable(sig({ kind: 'expansion' }), NOW)).toBe(true)
  })
  it('rejects closures, undated, stale, unsourced and blank-headline signals', () => {
    expect(openerUsable(sig({ kind: 'closure', review: 'confirmed' }), NOW)).toBe(false)
    expect(openerUsable(sig({ kind: 'expansion', date: undefined }), NOW)).toBe(false)
    expect(openerUsable(sig({ kind: 'expansion', date: '2026-01-01' }), NOW)).toBe(false)
    expect(openerUsable(sig({ kind: 'expansion', sourceUrl: 'nope' }), NOW)).toBe(false)
    expect(openerUsable(sig({ kind: 'expansion', headline: '  ' }), NOW)).toBe(false)
  })
})

describe('sameClosure', () => {
  it('matches the same page spelled differently, or the same headline in another case', () => {
    expect(urlKey('https://www.A.test/news/?x=1#top')).toBe('a.test/news?x=1')
    expect(sameClosure({ headline: 'a', sourceUrl: 'https://www.a.test/n/' }, { headline: 'b', sourceUrl: 'http://a.test/n' })).toBe(true)
    expect(sameClosure({ headline: 'Acme CLOSES', sourceUrl: 'https://a.test/1' }, { headline: 'acme closes', sourceUrl: 'https://b.test/2' })).toBe(true)
    expect(sameClosure({ headline: 'Acme closes', sourceUrl: 'https://a.test/1' }, { headline: 'Acme opens', sourceUrl: 'https://b.test/2' })).toBe(false)
  })
})
