import { describe, expect, it } from 'vitest'
import { formatGoalValue, fyDays, GOAL_METRIC_LABEL, GOAL_PERIODS, goalCents, goalDays, isMoneyMetric, isReportMetric, prevGoalDays, quarterDays, realDay, targetFromCents, targetToInput, wonAt } from './goalMetrics'

describe('goal metrics', () => {
  it('labels the money metrics and keeps the activity labels as they were', () => {
    expect(GOAL_METRIC_LABEL).toEqual({
      calls: 'Calls', emails: 'Emails sent', meetings: 'Meetings booked', meetings_held: 'Meetings completed',
      won_value: 'Won value', invoiced_cents: 'Invoiced', collected_cents: 'Collected',
    })
    expect(isReportMetric('invoiced_cents') && isReportMetric('collected_cents')).toBe(true)
    expect(isReportMetric('won_value')).toBe(false)
    expect(isMoneyMetric('won_value')).toBe(true)
    expect(isMoneyMetric('calls')).toBe(false)
  })

  it('reads won value as dollars and the report metrics as cents, and counts as counts', () => {
    expect(goalCents('won_value', 12400.5)).toBe(1240050)
    expect(goalCents('invoiced_cents', 1240050)).toBe(1240050)
    expect(goalCents('calls', 20)).toBeNull()
    expect(formatGoalValue('won_value', 600000)).toBe('$600,000')
    expect(formatGoalValue('collected_cents', 2210050)).toBe('$22,100.50')
    expect(formatGoalValue('calls', 20)).toBe('20')
  })

  it('edits a target in dollars and stores it in the metric’s own unit', () => {
    expect(targetToInput('won_value', 12400.5)).toBe('12400.50')
    expect(targetToInput('invoiced_cents', 2000000)).toBe('20000.00')
    expect(targetToInput('calls', 20)).toBe('20')
    expect(targetFromCents('won_value', 1240050)).toBe(12400.5)
    expect(targetFromCents('collected_cents', 1240050)).toBe(1240050)
  })

  it('measures the goal range up to today, on real days', () => {
    expect(realDay('2026-09-31')).toBe('2026-09-30')
    expect(realDay('2028-02-31')).toBe('2028-02-29')
    expect(realDay('2026-10-31')).toBe('2026-10-31')
    expect(goalDays(['2026-10-01T00:00', '2026-10-31T23:59'], '2026-10-09T14:00')).toEqual({ from: '2026-10-01', to: '2026-10-09' })
    expect(goalDays(['2026-10-05T00:00', '2026-10-12T00:00'], '2026-10-09T14:00')).toEqual({ from: '2026-10-05', to: '2026-10-09' })
    // A range already over is measured whole, with its month end made real.
    expect(goalDays(['2026-09-01T00:00', '2026-09-31T23:59'], '2026-10-09T14:00')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('compares with the whole period before', () => {
    expect(prevGoalDays('day', '2026-10-01')).toEqual({ from: '2026-09-30', to: '2026-09-30' })
    expect(prevGoalDays('week', '2026-10-05')).toEqual({ from: '2026-09-28', to: '2026-10-04' })
    expect(prevGoalDays('month', '2026-10-01')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(prevGoalDays('month', '2026-01-01')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(prevGoalDays('month', '2028-03-01')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(prevGoalDays('quarter', '2026-10-01')).toEqual({ from: '2026-07-01', to: '2026-09-30' })
    expect(prevGoalDays('quarter', '2026-01-01')).toEqual({ from: '2025-10-01', to: '2025-12-31' })
    expect(prevGoalDays('year', '2026-07-01')).toEqual({ from: '2025-07-01', to: '2026-06-30' })
  })

  it('offers quarter and financial year goals, as board 6 does', () => {
    expect(GOAL_PERIODS.map(p => p[0])).toEqual(['day', 'week', 'month', 'quarter', 'year'])
    expect(GOAL_PERIODS.find(p => p[0] === 'year')?.[1]).toBe('Financial year')
  })

  it('finds the calendar quarter and the July to June financial year of a day', () => {
    expect(quarterDays('2026-10-09')).toEqual({ from: '2026-10-01', to: '2026-12-31' })
    expect(quarterDays('2026-02-28')).toEqual({ from: '2026-01-01', to: '2026-03-31' })
    expect(quarterDays('2026-06-30')).toEqual({ from: '2026-04-01', to: '2026-06-30' })
    expect(fyDays('2026-10-09')).toEqual({ from: '2026-07-01', to: '2027-06-30' })
    expect(fyDays('2026-06-30')).toEqual({ from: '2025-07-01', to: '2026-06-30' })
    expect(fyDays('2026-07-01')).toEqual({ from: '2026-07-01', to: '2027-06-30' })
  })

  it('takes a deal as won at closedAt, else at the start of its close date', () => {
    expect(wonAt({ closedAt: '2026-10-05T09:00:00', close: '2026-12-01' })).toBe('2026-10-05T09:00')
    expect(wonAt({ closedAt: null, close: '2026-10-07' })).toBe('2026-10-07T00:00')
    expect(wonAt({ closedAt: null, close: '' })).toBe('')
  })
})
