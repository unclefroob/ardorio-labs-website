import type { BillingMilestone, TermEscalation, TermExit, TermFrequency, TermTiming } from '../../api/contract'
import { uid } from '../../data/ids'
import { Btn, Ck, Chip, Fld, Inp, Seg } from '../../kit'
import { validateMilestones } from '../../shared/billing'
import { fmtDay } from '../../shared/invoices'
import { formatCents, parseCents } from '../../shared/money'
import {
  ESCALATION_LABEL, EXIT_LABEL, FREQUENCY_LABEL, MAX_NOTICE_DAYS, MAX_TERM_MONTHS, pctToBp, TERM_FREQUENCIES, termLastDay, TIMING_LABEL, validateTerm, type TermInput,
} from '../../shared/term'
import { scheduleTotal, termSchedule, termYears } from '../../shared/termSchedule'

// The term of a term agreement as a person sets it, in the Won dialog's Contract step and in Set contract on a won deal:
// the fields, the optional build fee (one-off milestones beside the instalments), and a live preview of the schedule the
// server will store, with the baseline it needs. Ardorio admins only, like the rest of billing.

export interface BuildRow { key: string; label: string; amount: string; date: string }
export interface TermDraft {
  start: string; years: string; months: string; annual: string
  frequency: TermFrequency; timing: TermTiming; escalation: TermEscalation; rise: string
  exit: TermExit; notice: string; autoDraft: boolean; build: BuildRow[]
}
export type TermErrField = 'start' | 'length' | 'annual' | 'rise' | 'notice' | 'build' | 'term'
export type TermErrs = Partial<Record<TermErrField, string>>

export const newBuildRow = (): BuildRow => ({ key: uid('br'), label: '', amount: '', date: '' })

/** A new draft: starting on `start`, 5 years, billed annually in advance, no rise, committed, drafting on. */
export const newTermDraft = (start: string): TermDraft => ({
  start, years: '5', months: '0', annual: '', frequency: 'annual', timing: 'advance', escalation: 'none', rise: '', exit: 'committed', notice: '90', autoDraft: true, build: [],
})

const whole = (s: string): number | null => (/^\d{1,4}$/.test(s.trim()) ? +s.trim() : null)
const blank = (r: BuildRow): boolean => !r.label.trim() && !r.amount.trim() && !r.date

export type TermCheck =
  | { ok: true; term: TermInput; buildFee: BillingMilestone[]; schedule: BillingMilestone[] }
  | { ok: false; errs: TermErrs }

/** Read a draft into a term and its build fee, or say what to fix, field by field. */
export function checkTermDraft(d: TermDraft): TermCheck {
  const errs: TermErrs = {}
  const y = whole(d.years || '0'), mo = whole(d.months || '0')
  const termMonths = y === null || mo === null || mo > 11 ? null : y * 12 + mo
  if (termMonths === null || termMonths < 1 || termMonths > MAX_TERM_MONTHS) errs.length = `The term is 1 month to ${MAX_TERM_MONTHS / 12} years: whole years, and 0 to 11 months`
  const annual = parseCents(d.annual)
  if (annual === null || annual < 1 || annual > 100_000_000) errs.annual = 'Enter the year-1 fee in dollars and cents, like 24000.00'
  const bp = d.escalation === 'none' ? 0 : pctToBp(d.rise)
  if (bp === null || bp < 0 || bp > 2000) errs.rise = 'The yearly rise is 0% to 20%, to two decimal places'
  const notice = d.exit === 'break' ? whole(d.notice) : 0
  if (notice === null || notice > MAX_NOTICE_DAYS) errs.notice = `The notice is 0 to ${MAX_NOTICE_DAYS} days`
  const buildFee: BillingMilestone[] = []
  const rows = d.build.filter(r => !blank(r))
  for (let i = 0; i < rows.length && !errs.build; i++) {
    const c = parseCents(rows[i].amount)
    if (c === null) errs.build = `Build fee ${i + 1}: the amount is dollars and cents, like 40000.00`
    else buildFee.push({ id: uid('ms'), label: rows[i].label, amountCents: c, ...(rows[i].date ? { plannedDate: rows[i].date } : {}) })
  }
  if (!errs.build) {
    const bad = validateMilestones(buildFee)
    if (bad) errs.build = bad.replace(/^Milestone/, 'Build fee')
  }
  if (Object.keys(errs).length || termMonths === null || annual === null || bp === null || notice === null) return { ok: false, errs }
  const term: TermInput = {
    startDate: d.start, termMonths, annualCents: annual, frequency: d.frequency, timing: d.timing, escalation: d.escalation, escalationBp: bp,
    exit: d.exit, breakNoticeDays: d.exit === 'break' ? notice : 0, autoDraft: d.autoDraft,
  }
  const bad = validateTerm(term)
  if (bad) return { ok: false, errs: /starts/.test(bad) ? { start: bad } : { term: bad } }
  return { ok: true, term, buildFee, schedule: termSchedule(term) }
}

/**
 * The term fields, the build fee and the live schedule. `existingCents` is the one-off milestones the deal already has:
 * they stay, and count in the baseline with the build fee and the schedule.
 */
export function TermFields({ draft, onChange, errs, existingCents = 0 }: { draft: TermDraft; onChange: (d: TermDraft) => void; errs: TermErrs; existingCents?: number }) {
  const set = <K extends keyof TermDraft>(k: K, v: TermDraft[K]): void => onChange({ ...draft, [k]: v })
  const setRow = (key: string, patch: Partial<BuildRow>): void => set('build', draft.build.map(r => (r.key === key ? { ...r, ...patch } : r)))
  const check = checkTermDraft(draft)
  const buildCents = draft.build.reduce((a, r) => a + (parseCents(r.amount) ?? 0), 0)

  return (
    <div className="col" style={{ gap: 14 }}>
      {errs.term && <div className="err" role="alert">{errs.term}</div>}
      <div className="grid g3">
        <Fld label="Start date" req err={errs.start} hint="The first day of the term">
          <Inp type="date" value={draft.start} onChange={v => set('start', v)} aria-invalid={errs.start ? true : undefined} />
        </Fld>
        <div className="fld">
          <span className="lbl" id="term-length-h">Term <span style={{ color: 'var(--bad2)' }}>*</span></span>
          <div className="row" style={{ gap: 6 }} role="group" aria-labelledby="term-length-h">
            <Inp aria-label="Term years" className="mono" inputMode="numeric" style={{ width: 64, textAlign: 'right' }} value={draft.years} onChange={v => set('years', v.replace(/\D/g, ''))} aria-invalid={errs.length ? true : undefined} />
            <span className="sm muted">years</span>
            <Inp aria-label="Term months" className="mono" inputMode="numeric" style={{ width: 56, textAlign: 'right' }} value={draft.months} onChange={v => set('months', v.replace(/\D/g, ''))} aria-invalid={errs.length ? true : undefined} />
            <span className="sm muted">months</span>
          </div>
          {errs.length ? <div className="err" role="alert">{errs.length}</div> : <div className="hint">Up to 10 years</div>}
        </div>
        <Fld label="Annual fee (A$, ex GST)" req err={errs.annual} hint="The year-1 fee">
          <Inp className="mono" inputMode="decimal" value={draft.annual} onChange={v => set('annual', v)} aria-invalid={errs.annual ? true : undefined} />
        </Fld>
      </div>

      <div className="grid g2">
        <div className="fld">
          <span className="lbl">Billed</span>
          <Seg label="Billed" value={draft.frequency} onChange={v => set('frequency', v as TermFrequency)} opts={TERM_FREQUENCIES.map(f => [f, FREQUENCY_LABEL[f]] as const)} />
        </div>
        <div className="fld">
          <span className="lbl">Invoice</span>
          <Seg label="Invoice timing" value={draft.timing} onChange={v => set('timing', v as TermTiming)} opts={(['advance', 'arrears'] as const).map(t => [t, TIMING_LABEL[t]] as const)} />
          <div className="hint">{draft.timing === 'advance' ? 'Each instalment is invoiced on the first day of its period.' : 'Each instalment is invoiced on the last day of its period.'}</div>
        </div>
      </div>

      <div className="grid g2">
        <div className="fld">
          <span className="lbl">Yearly rise</span>
          <div className="row wrap" style={{ gap: 8 }}>
            <Seg label="Yearly rise" value={draft.escalation} onChange={v => set('escalation', v as TermEscalation)} opts={(['none', 'fixed', 'cpi'] as const).map(e => [e, ESCALATION_LABEL[e]] as const)} />
            {draft.escalation !== 'none' && (
              <span className="row" style={{ gap: 4 }}>
                <Inp aria-label={draft.escalation === 'cpi' ? 'Assumed CPI (%)' : 'Yearly rise (%)'} className="mono" inputMode="decimal" style={{ width: 72, textAlign: 'right' }} value={draft.rise} onChange={v => set('rise', v)} aria-invalid={errs.rise ? true : undefined} />
                <span className="sm muted">%</span>
              </span>
            )}
          </div>
          {errs.rise ? <div className="err" role="alert">{errs.rise}</div> : (
            <div className="hint">
              {draft.escalation === 'none' ? 'The same fee every year.' : draft.escalation === 'fixed' ? 'The fee rises by this much at each anniversary.' : 'Assumed until the real CPI is confirmed each year; the difference is recorded as a variation.'}
            </div>
          )}
        </div>
        <div className="fld">
          <span className="lbl">Exit</span>
          <div className="row wrap" style={{ gap: 8 }}>
            <Seg label="Exit" value={draft.exit} onChange={v => set('exit', v as TermExit)} opts={(['committed', 'break'] as const).map(e => [e, EXIT_LABEL[e]] as const)} />
            {draft.exit === 'break' && (
              <span className="row" style={{ gap: 4 }}>
                <Inp aria-label="Notice (days)" className="mono" inputMode="numeric" style={{ width: 64, textAlign: 'right' }} value={draft.notice} onChange={v => set('notice', v.replace(/\D/g, ''))} aria-invalid={errs.notice ? true : undefined} />
                <span className="sm muted">days notice</span>
              </span>
            )}
          </div>
          {errs.notice ? <div className="err" role="alert">{errs.notice}</div> : (
            <div className="hint">{draft.exit === 'break' ? 'The client may end it at any anniversary, giving this much notice before it.' : 'The client is committed for the whole term.'}</div>
          )}
        </div>
      </div>

      <div className="fld">
        <span className="lbl" id="term-build-h" style={{ fontSize: 12, fontWeight: 600 }}>Build fee (optional one-off milestones beside the instalments)</span>
        {draft.build.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" aria-labelledby="term-build-h" style={{ minWidth: 520 }}>
              <thead><tr><th>Milestone</th><th style={{ textAlign: 'right' }}>Amount ex GST</th><th>Planned</th><th /></tr></thead>
              <tbody>
                {draft.build.map((r, i) => (
                  <tr key={r.key}>
                    <td><Inp aria-label={`Build fee ${i + 1} label`} value={r.label} onChange={v => setRow(r.key, { label: v })} /></td>
                    <td><Inp aria-label={`Build fee ${i + 1} amount`} className="mono" inputMode="decimal" style={{ textAlign: 'right' }} value={r.amount} onChange={v => setRow(r.key, { amount: v })} /></td>
                    <td><Inp aria-label={`Build fee ${i + 1} planned date`} type="date" value={r.date} onChange={v => setRow(r.key, { date: v })} /></td>
                    <td><Btn size="xs" kind="ghost" aria-label={`Remove build fee ${i + 1}`} onClick={() => set('build', draft.build.filter(x => x.key !== r.key))}>Remove</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {errs.build && <div className="err" role="alert">{errs.build}</div>}
        <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
          <Btn size="sm" onClick={() => set('build', [...draft.build, { ...newBuildRow(), label: draft.build.length ? '' : 'Build fee' }])}>+ Add build fee milestone</Btn>
        </div>
      </div>

      <Ck checked={draft.autoDraft} onChange={v => set('autoDraft', v)}>
        <span>Draft each instalment's invoice automatically on its invoice date <span className="faint">· drafts only, never sent; you review and issue each one</span></span>
      </Ck>

      {check.ok
        ? <SchedulePreview schedule={check.schedule} buildCents={buildCents} existingCents={existingCents} lastDay={termLastDay(check.term)} years={termYears(check.term)} />
        : <div className="faint sm" role="status" aria-label="Schedule preview">Enter the start date, term and annual fee to see the schedule.</div>}
    </div>
  )
}

/** The schedule grouped by year, with yearly totals, the grand total, and the baseline it makes with the one-off milestones. */
export function SchedulePreview({ schedule, buildCents, existingCents, lastDay, years }: { schedule: readonly BillingMilestone[]; buildCents: number; existingCents: number; lastDay: string; years: number }) {
  const total = scheduleTotal(schedule)
  const baseline = total + buildCents + existingCents
  const byYear: BillingMilestone[][] = []
  for (const m of schedule) (byYear[(m.termYear ?? 1) - 1] ??= []).push(m)
  return (
    <div className="fld">
      <span className="lbl" id="term-preview-h" style={{ fontSize: 12, fontWeight: 600 }}>Schedule preview · {schedule.length} instalment{schedule.length === 1 ? '' : 's'} over {years} year{years === 1 ? '' : 's'}, to {fmtDay(lastDay)}</span>
      <div style={{ overflow: 'auto', maxHeight: 320 }}>
        <table className="tbl" aria-labelledby="term-preview-h" style={{ minWidth: 520 }}>
          <thead><tr><th>Year</th><th>Period</th><th>Invoice date</th><th style={{ textAlign: 'right' }}>Amount ex GST</th></tr></thead>
          {byYear.map((list, i) => (
            <tbody key={i}>
              {list.map(m => (
                <tr key={m.id}>
                  <td>{m.label}</td>
                  <td className="sm">{fmtDay(m.periodStart)} to {fmtDay(m.periodEnd)}</td>
                  <td>{fmtDay(m.plannedDate)}</td>
                  <td className="money" style={{ textAlign: 'right' }}>{formatCents(m.amountCents)}</td>
                </tr>
              ))}
              <tr className="b">
                <td colSpan={3}>Year {i + 1} total</td>
                <td className="money" style={{ textAlign: 'right' }}>{formatCents(scheduleTotal(list))}</td>
              </tr>
            </tbody>
          ))}
          <tfoot>
            <tr><td colSpan={3}>Schedule total</td><td className="money" style={{ textAlign: 'right' }}>{formatCents(total)}</td></tr>
            {existingCents > 0 && <tr><td colSpan={3}>Milestones already planned</td><td className="money" style={{ textAlign: 'right' }}>{formatCents(existingCents)}</td></tr>}
            {buildCents > 0 && <tr><td colSpan={3}>Build fee</td><td className="money" style={{ textAlign: 'right' }}>{formatCents(buildCents)}</td></tr>}
          </tfoot>
        </table>
      </div>
      <div className="row wrap" style={{ gap: 8, marginTop: 6 }} role="status" aria-label="Contract baseline">
        <Chip tone="ok" icon="check">Contract {formatCents(baseline)} ex GST</Chip>
        <span className="sm muted">{[existingCents > 0 ? 'milestones already planned' : '', buildCents > 0 ? 'build fee' : '', 'schedule total'].filter(Boolean).join(' + ')}. Frozen when you save; later changes go through variations.</span>
      </div>
    </div>
  )
}
