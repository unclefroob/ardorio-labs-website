import { F } from '../../data/F'
import { Fld, Inp, Seg } from '../../kit'
import { describePricing, PRICE_UNITS, priceTotals, pricingOf, TERM_PICKS, UNIT_LABEL, type PriceUnit } from '../../shared/dealPricing'

// An Ardorio deal's price: either a total typed in, or a rate and a term the total is worked out from. The parent keeps `value`
// (the total contract), `months` and `fields`; every change here hands back all three, so saving stays as it was.

export interface PricingState { value: string; months: string; fields: Record<string, unknown> }

const digits = (v: string): string => v.replace(/[^0-9.]/g, '')

export function PricingFields({ state, onChange, disabled }: { state: PricingState; onChange: (s: PricingState) => void; disabled?: boolean }) {
  const p = pricingOf(state.fields)
  const months = parseInt(state.months, 10) || 0

  const apply = (fields: Record<string, unknown>, m: string): void => {
    const next = pricingOf(fields)
    if (!next) return onChange({ ...state, months: m, fields })
    onChange({ value: String(priceTotals(next, parseInt(m, 10) || 0).total), months: m, fields })
  }
  const setField = (k: string, v: unknown): void => apply({ ...state.fields, [k]: v }, state.months)
  const setMode = (calc: boolean): void => {
    if (!calc) return onChange({ ...state, fields: { ...state.fields, priceUnit: '' } })
    const seeded = parseFloat(state.value) > 0 && !p ? String(parseFloat(state.value) / Math.max(months / 12, 1)) : ''
    apply({ ...state.fields, priceUnit: 'year', priceAmount: state.fields.priceAmount ?? seeded, priceOneOff: state.fields.priceOneOff ?? '' }, state.months || '12')
  }
  const t = p ? priceTotals(p, months) : null

  return (
    <div className="col gap12" style={{ gridColumn: '1/-1' }}>
      <div className="fld">
        <span className="lbl">Pricing</span>
        <Seg label="Pricing" value={p ? 'calc' : 'total'} onChange={v => !disabled && setMode(v === 'calc')} opts={[['calc', 'Price × term'], ['total', 'Enter total']]} />
      </div>
      {!p ? (
        <Fld label="Estimated project value (A$)">
          <Inp value={state.value} onChange={v => onChange({ ...state, value: digits(v) })} disabled={disabled} inputMode="decimal" />
        </Fld>
      ) : (
        <>
          <div className="grid g3">
            <Fld label="Price (A$, ex GST)">
              <Inp className="mono" value={String(state.fields.priceAmount ?? '')} onChange={v => setField('priceAmount', digits(v))} disabled={disabled} inputMode="decimal" />
            </Fld>
            <div className="fld">
              <span className="lbl">Charged</span>
              <Seg label="Charged" value={p.unit} onChange={v => !disabled && setField('priceUnit', v as PriceUnit)} opts={PRICE_UNITS.map(u => [u, UNIT_LABEL[u]] as const)} />
            </div>
            <Fld label="One-off fee (A$, optional)" hint="Build or setup, charged once">
              <Inp className="mono" value={String(state.fields.priceOneOff ?? '')} onChange={v => setField('priceOneOff', digits(v))} disabled={disabled} inputMode="decimal" />
            </Fld>
          </div>
          {p.unit !== 'once' && (
            <div className="fld">
              <span className="lbl">Term</span>
              <div className="row wrap" style={{ gap: 8 }}>
                <Seg label="Term" value={String(months)} onChange={v => !disabled && apply(state.fields, v)} opts={TERM_PICKS.map(m => [String(m), m % 12 === 0 ? `${m / 12} yr` : `${m} mo`] as const)} />
                <Inp aria-label="Term in months" className="mono" inputMode="numeric" style={{ width: 64, textAlign: 'right' }} value={state.months} onChange={v => apply(state.fields, v.replace(/\D/g, ''))} disabled={disabled} />
                <span className="sm muted">months</span>
              </div>
            </div>
          )}
          <div className="sm" aria-live="polite">
            {t && (p.amount > 0 || p.oneOff > 0) ? (
              <>
                <span className="muted">{describePricing(p, months, F.money)} = </span>
                <strong className="num">{F.money(t.total)} total contract</strong>
                {t.annual != null && <span className="muted"> ({F.money(t.annual)} a year)</span>}
              </>
            ) : <span className="muted">Enter a price to work out the total contract.</span>}
          </div>
        </>
      )}
    </div>
  )
}
