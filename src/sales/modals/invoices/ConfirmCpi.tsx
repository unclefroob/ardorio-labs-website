import { useState } from 'react'
import type { BillingTerm } from '../../api/contract'
import { invoiceError, listInvoices } from '../../api/invoices'
import { Act } from '../../data/Act'
import { useLoad } from '../../data/invoicing'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import { Banner, Btn, Fld, Inp, Modal, Sel } from '../../kit'
import { signedCents } from '../../shared/billing'
import { formatCents } from '../../shared/money'
import { bpText, cpiEffect, cpiProblem, pctToBp, unconfirmedCpiYears } from '../../shared/term'
import { termYears } from '../../shared/termSchedule'
import { UI } from '../../ui/store'
import { MissingModal } from '../entities/guards'

/**
 * Confirm the CPI rise of one year of a term agreement: the rate, and what it does to the remaining instalments and
 * the contract before anything is saved. Instalments already invoiced keep their amounts. The deal's invoices are
 * loaded here, when the dialog opens, so the preview is never worked out from a stale or missing list; until they are
 * loaded nothing can be confirmed. Admins of Ardorio only.
 */
export function ConfirmCpi({ dealId, year: first }: { dealId: string; year?: number }) {
  useStore()
  const inv = useLoad(s => listInvoices({ dealId }, s).then(r => r.invoices), `cpi:${dealId}`)
  const deal = Q.deal(dealId)
  const plan = Q.billingPlan(dealId)
  const years = plan?.term ? unconfirmedCpiYears(plan.term) : []
  const [year, setYear] = useState<number>(first && years.includes(first) ? first : years[0] ?? 2)
  const [rate, setRate] = useState('')
  const [err, setErr] = useState('')
  if (!deal || !plan?.term || !years.length) return <MissingModal title="Confirm CPI" what="CPI year to confirm" />
  const term: BillingTerm = plan.term

  const invoices = inv.data
  const loadErr = inv.error ? invoiceError(inv.error, 'load').message : ''
  const bp = pctToBp(rate)
  const eff = invoices && bp !== null && !cpiProblem(term, year, bp) ? cpiEffect({ ...plan, term }, year, bp, invoices) : null

  const save = (): void => {
    if (!invoices) return setErr("The deal's invoices are not loaded, so what confirming does cannot be shown yet")
    const bad = cpiProblem(term, year, bp)
    if (bad || bp === null) return setErr(bad ?? 'Enter the CPI rate')
    const e = cpiEffect({ ...plan, term }, year, bp, invoices)
    const r = Act.confirmCpi(dealId, year, bp)
    if (!r.ok) return setErr(r.error)
    UI.close()
    UI.toast(`CPI for year ${year} confirmed at ${bpText(bp)}%.${e.differenceCents ? ` ${signedCents(e.differenceCents, formatCents)} is added to the contract as an approved variation.` : ' The schedule does not change.'}`)
  }

  return (
    <Modal
      title={`Confirm CPI for year ${year}`}
      sub={deal.name}
      width={600}
      footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" disabled={!invoices} onClick={save}>Confirm CPI</Btn></>}
    >
      <div className="col" style={{ gap: 14 }}>
        {err && <Banner tone="bad">{err}</Banner>}
        {loadErr && <Banner tone="bad" action={<Btn size="sm" onClick={inv.reload}>Try again</Btn>}>{loadErr} The deal's invoices did not load, so CPI cannot be confirmed until they do.</Banner>}
        <div className="grid g2">
          <Fld label="Year">
            <Sel value={String(year)} onChange={v => setYear(+v)} options={years.map(y => [String(y), `Year ${y}`] as const)} />
          </Fld>
          <Fld label="CPI rate (%)" req hint={`Assumed ${bpText(term.escalationBp)}% until now. From -10% to 20%, to two decimal places.`}>
            <Inp className="mono" inputMode="decimal" value={rate} onChange={setRate} />
          </Fld>
        </div>
        <div className="card" style={{ boxShadow: 'none', background: 'var(--surf2)' }}>
          <div className="card-b col" style={{ gap: 6 }} role="status" aria-label="What confirming does">
            <div className="b sm">What confirming does</div>
            {eff ? (
              <>
                <div className="sm">The year {year} fee changes from <b className="money">{formatCents(eff.feeFrom)}</b> to <b className="money">{formatCents(eff.feeTo)}</b>{year < termYears(term) ? ', and the years after it rise from the new fee' : ''}.</div>
                {eff.changes.length > 0
                  ? <div className="sm">{eff.changes.length} instalment{eff.changes.length === 1 ? '' : 's'} not yet invoiced {eff.changes.length === 1 ? 'is' : 'are'} re-priced: {eff.changes.map(c => `${c.label} ${formatCents(c.from)} to ${formatCents(c.to)}`).join('; ')}.</div>
                  : <div className="sm">No instalment not yet invoiced changes.</div>}
                {eff.kept.length > 0 && <div className="sm">Already invoiced, kept as they are: {eff.kept.map(m => m.label).join(', ')}.</div>}
                <div className="sm">
                  {eff.differenceCents
                    ? <>An approved variation of <b className="money">{signedCents(eff.differenceCents, formatCents)}</b> is added: {eff.label}.</>
                    : 'No variation is added: the contract does not change.'}
                </div>
              </>
            ) : <div className="sm muted">{invoices ? 'Enter the CPI rate to see how the remaining instalments change.' : loadErr ? "Waiting for the deal's invoices." : "Loading the deal's invoices to see which instalments are already invoiced…"}</div>}
            <div className="sm muted">The confirmation is recorded with your name, {Q.me().name}, and today's date. It can't be changed later.</div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
