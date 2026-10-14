/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BillingMilestone, BillingTerm } from '../api/contract'
import { addMonths, dayBefore, roundDiv, scheduleTotal, termEndDate, termSchedule, termYears, yearlyFees } from './termSchedule'

interface Case {
  name: string
  term: Omit<BillingTerm, 'exit' | 'breakNoticeDays' | 'autoDraft' | 'draftFrom'>
  expect: { count: number; total: number; fees: number[]; amounts: number[]; rows: Array<{ index: number } & Partial<BillingMilestone>> }
}

const FIXTURES = 'src/sales/shared/termSchedule.fixtures.json'
const table = JSON.parse(readFileSync(join(process.cwd(), FIXTURES), 'utf8')) as { cases: Case[] }

describe('termSchedule: the shared fixture table', () => {
  it('has cases', () => { expect(table.cases.length).toBeGreaterThanOrEqual(10) })
  for (const c of table.cases) {
    it(c.name, () => {
      const list = termSchedule(c.term)
      expect(list).toHaveLength(c.expect.count)
      expect(list.map(m => m.amountCents)).toEqual(c.expect.amounts)
      expect(scheduleTotal(list)).toBe(c.expect.total)
      expect(yearlyFees(c.term)).toEqual(c.expect.fees)
      for (const { index, ...want } of c.expect.rows) expect(list[index]).toMatchObject(want)
      // Every instalment is a dated instalment of its year, and the periods tile the term with no gap or overlap.
      list.forEach((m, i) => {
        expect(m.kind).toBe('instalment')
        expect(m.plannedDate).toBe(c.term.timing === 'advance' ? m.periodStart : m.periodEnd)
        if (i > 0) expect(m.periodStart).toBe(nextDay(list[i - 1].periodEnd!))
      })
      expect(list[0].periodStart).toBe(c.term.startDate)
      expect(nextDay(list[list.length - 1].periodEnd!)).toBe(termEndDate(c.term))
      // A full year's instalments sum exactly to that year's fee.
      for (let y = 1; y <= termYears(c.term); y++) {
        const inYear = list.filter(m => m.termYear === y)
        const months = Math.min(12, c.term.termMonths - (y - 1) * 12)
        if (months === 12) expect(scheduleTotal(inYear)).toBe(c.expect.fees[y - 1])
      }
    })
  }

  // Set ARDORIO_API_DIR to an API checkout to check the API runs the same table.
  const apiDir = process.env.ARDORIO_API_DIR
  const apiFixtures = apiDir ? join(apiDir, 'src/services/sales/billing/termSchedule.fixtures.json') : ''
  it.skipIf(!apiFixtures || !existsSync(apiFixtures))('is the same table as the API', () => {
    expect(JSON.parse(readFileSync(apiFixtures, 'utf8'))).toEqual(table)
  })
})

function nextDay(day: string): string {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + 1))
  return d.toISOString().slice(0, 10)
}

describe('termSchedule helpers', () => {
  it('addMonths keeps the day, clamped to the month end, never chaining the clamp', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
    expect(addMonths('2026-07-01', 120)).toBe('2036-07-01')
  })
  it('dayBefore crosses months and years', () => {
    expect(dayBefore('2027-01-01')).toBe('2026-12-31')
    expect(dayBefore('2028-03-01')).toBe('2028-02-29')
  })
  it('roundDiv rounds half away from zero', () => {
    expect(roundDiv(1, 2)).toBe(1)
    expect(roundDiv(3, 2)).toBe(2)
    expect(roundDiv(-1, 2)).toBe(-1)
    expect(roundDiv(-3, 2)).toBe(-2)
    expect(roundDiv(5, 12)).toBe(0)
    expect(roundDiv(6, 12)).toBe(1)
  })
  it('a 10-year monthly agreement has 120 instalments ending the day before the term end', () => {
    const list = termSchedule({ startDate: '2026-07-01', termMonths: 120, annualCents: 100000000, frequency: 'monthly', timing: 'advance', escalation: 'fixed', escalationBp: 2000 })
    expect(list).toHaveLength(120)
    expect(list[119]).toMatchObject({ id: 'inst_10_12', label: 'Year 10 of 10, month 12', periodEnd: '2036-06-30' })
    expect(Number.isSafeInteger(scheduleTotal(list))).toBe(true)
  })
})
