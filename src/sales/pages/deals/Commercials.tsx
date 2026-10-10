import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import type { Deal } from '../../data/types'
import { Btn, Card, Chip, Fld, Inp, Sel } from '../../kit'
import { RosCalc, useF } from '../../shared/forms'
import { UI } from '../../ui/store'

interface CommercialForm {
  value: string
  contractMonths: string
  forecast: string
  probability: string
  close: string
  type: string
  fields: Record<string, unknown>
}

const text = (v: unknown): string => (v == null ? '' : String(v))
const toNum = (v: unknown): number => (typeof v === 'number' ? v : parseFloat(text(v)))

export function Commercials({ d }: { d: Deal }) {
  const can = Q.canEdit(d.businessId)
  const [f, set] = useF<CommercialForm>({
    value: text(d.value), contractMonths: text(d.contractMonths), forecast: d.forecast, probability: text(d.probability),
    close: d.close, type: d.type, fields: { ...d.fields },
  })
  const setF2 = (k: string, v: unknown): void => set('fields', { ...f.fields, [k]: v })
  const pl = Q.pipeline(d.businessId)
  const eligible = toNum(f.fields.eligible)
  const price = toNum(f.fields.price)
  const pthV = d.businessId === 'pth' && eligible > 0 && price > 0 ? Math.round(eligible * price) : null
  const valueNum = pthV ?? toNum(f.value)

  const save = (): void => {
    const months = toNum(f.contractMonths)
    const prob = toNum(f.probability)
    if (d.businessId !== 'ros' && !(valueNum >= 0)) return void UI.toast('Enter a valid deal value', 'bad')
    if (!(months >= 0)) return void UI.toast('Enter a valid contract term', 'bad')
    if (!(prob >= 0 && prob <= 100)) return void UI.toast('Probability must be between 0 and 100', 'bad')
    const p: Partial<Deal> = { contractMonths: months, forecast: f.forecast, probability: prob, close: f.close, type: f.type, fields: f.fields }
    if (d.businessId !== 'ros') p.value = valueNum
    Act.updateDeal(d.id, p)
    UI.toast('Commercials updated · pipeline totals recalculated')
  }

  return (
    <div className="split">
      <Card title="Commercial terms" right={can && <Btn size="sm" kind="pri" onClick={save}>Save</Btn>}>
        <div className="col gap12">
          {d.businessId === 'ros' ? (
            <RosCalc f={f.fields} set={setF2} />
          ) : (
            <div className="grid g2">
              {d.businessId === 'pth' && (
                <>
                  <Fld label="Eligible students"><Inp value={text(f.fields.eligible)} onChange={v => setF2('eligible', +v || '')} disabled={!can} inputMode="numeric" /></Fld>
                  <Fld label="Price per student / yr (A$)"><Inp value={text(f.fields.price)} onChange={v => setF2('price', +v || '')} disabled={!can} inputMode="decimal" /></Fld>
                </>
              )}
              <Fld
                label={d.businessId === 'ard' ? 'Estimated project value' : 'Annual contract value'}
                hint={pthV ? 'Calculated: ' + F.num(eligible) + ' × ' + F.money(price) + ' = ' + F.money(pthV) : undefined}
              >
                <Inp value={pthV != null ? String(pthV) : f.value} onChange={v => set('value', v.replace(/[^0-9.]/g, ''))} disabled={!can || pthV != null} inputMode="decimal" />
              </Fld>
              {d.businessId === 'adv' && (
                <Fld label="Per employee / month" hint="Derived">
                  <div className="sm num">{toNum(f.fields.employees) > 0 ? F.money(valueNum / 12 / toNum(f.fields.employees)) : '—'}</div>
                </Fld>
              )}
              {d.businessId === 'ard' && (
                <>
                  <Fld label="Implementation budget"><Inp value={text(f.fields.implBudget)} onChange={v => setF2('implBudget', +v || '')} disabled={!can} inputMode="decimal" /></Fld>
                  <Fld label="Recurring support (annual)"><Inp value={text(f.fields.supportValue)} onChange={v => setF2('supportValue', +v || '')} disabled={!can} inputMode="decimal" /></Fld>
                </>
              )}
            </div>
          )}
          <div className="grid g3">
            <Fld label="Contract term (months)"><Inp value={f.contractMonths} onChange={v => set('contractMonths', v)} disabled={!can} inputMode="numeric" /></Fld>
            <Fld label="Probability %" hint={'Stage default ' + (Q.stage(d)?.prob ?? 0) + '%'}><Inp value={f.probability} onChange={v => set('probability', v)} disabled={!can} inputMode="numeric" /></Fld>
            <Fld label="Forecast category"><Sel value={f.forecast} onChange={v => set('forecast', v)} options={pl.forecast} disabled={!can} /></Fld>
            <Fld label="Expected close"><Inp type="date" value={f.close} onChange={v => set('close', v)} disabled={!can} /></Fld>
            <Fld label="Deal type"><Sel value={f.type} onChange={v => set('type', v)} options={['New business', 'Expansion', 'Renewal', 'Pilot']} disabled={!can} /></Fld>
          </div>
        </div>
      </Card>
      <Card title="Summary">
        <dl className="dl" style={{ gridTemplateColumns: '120px 1fr' }}>
          <dt>Value</dt><dd className="num">{F.money(d.value)}</dd>
          {d.mrr != null && (
            <>
              <dt>MRR</dt><dd className="num">{F.money(d.mrr)}</dd>
              <dt>ARR</dt><dd className="num">{F.money(d.mrr * 12)}</dd>
            </>
          )}
          <dt>Weighted</dt><dd className="num">{F.money(Q.weighted(d))}</dd>
          <dt>Total contract</dt><dd className="num">{F.money(d.recurring ? (d.value / 12) * d.contractMonths : d.value)}</dd>
          <dt>Recurring</dt><dd>{d.recurring ? 'Yes' : 'No (project)'}</dd>
          {!!d.fields.override && (
            <>
              <dt>Pricing</dt><dd><Chip tone="warn">Custom arrangement</Chip></dd>
            </>
          )}
        </dl>
      </Card>
    </div>
  )
}
