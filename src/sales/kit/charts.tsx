import { useEffect, useState, type KeyboardEvent } from 'react'
import { F } from '../data/F'

export interface BarDatum {
  l: string
  v: number | number[]
  c?: string
}

const PL = 40
const PR = 8
const TOP = 16
const CH = 6.6

function useWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [w, setW] = useState(400)
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!el) return
    const read = (): void => setW(Math.max(240, Math.round(el.getBoundingClientRect().width)))
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, w]
}

function labelStep(labels: readonly string[], slot: number): number {
  const widest = Math.max(1, ...labels.map(l => l.length)) * CH + 8
  return Math.max(1, Math.ceil(widest / Math.max(1, slot)))
}

function YAxis({ W, h, max, fmt, empty }: { W: number; h: number; max: number; fmt?: (v: number) => string; empty: boolean }) {
  const ph = h - TOP
  return (
    <>
      {[0, 0.5, 1].map(f => {
        const y = h - ph * f
        return (
          <g key={f}>
            <line x1={PL} x2={W - PR} y1={y} y2={y} stroke="var(--line)" />
            <text x={PL - 6} y={y + 4} textAnchor="end">
              {f === 0 ? '0' : empty ? '' : fmt ? fmt(max * f) : String(Math.round(max * f * 10) / 10)}
            </text>
          </g>
        )
      })}
    </>
  )
}

const sum = (v: number | number[]): number => (Array.isArray(v) ? v.reduce((s, x) => s + x, 0) : v)

export function Bars({ data, h = 180, fmt, stacked, onBar, colors, label = 'Bar chart' }: { data: readonly BarDatum[]; h?: number; fmt?: (v: number) => string; stacked?: boolean; onBar?: (d: BarDatum, i: number) => void; colors?: readonly string[]; label?: string }) {
  const [ref, W] = useWidth()
  const max = Math.max(1, ...data.map(d => (stacked ? sum(d.v) : Array.isArray(d.v) ? Math.max(...d.v) : d.v)))
  const empty = data.every(d => sum(d.v) === 0)
  const slot = (W - PL - PR) / Math.max(1, data.length)
  const bw = Math.min(56, slot * 0.64)
  const ph = h - TOP
  const f = (v: number): string => (fmt ? fmt(v) : String(v))
  const step = labelStep(data.map(d => d.l), slot)
  const widestVal = Math.max(1, ...data.map(d => f(sum(d.v)).length)) * CH + 6
  const showVals = slot >= widestVal
  return (
    <div ref={ref}>
      <svg className="chart" viewBox={`0 0 ${W} ${h + 24}`} width={W} height={h + 24} style={{ display: 'block', maxWidth: '100%' }} role={onBar ? 'group' : undefined} aria-label={onBar ? label : undefined} aria-hidden={onBar ? undefined : true}>
        <YAxis W={W} h={h} max={max} fmt={fmt} empty={empty} />
        {data.map((d, i) => {
          const x = PL + i * slot + (slot - bw) / 2
          let y = h
          const vals = stacked && Array.isArray(d.v) ? d.v : [sum(d.v)]
          const total = sum(d.v)
          const act = onBar ? { role: 'button', tabIndex: 0, 'aria-label': `${d.l}: ${f(total)}`, onClick: () => onBar(d, i), onKeyDown: (e: KeyboardEvent<SVGGElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBar(d, i) } } } : {}
          return (
            <g key={i} style={{ cursor: onBar ? 'pointer' : undefined }} {...act}>
              <title>{`${d.l}: ${f(total)}`}</title>
              <rect x={PL + i * slot} y={0} width={slot} height={h + 24} fill="transparent" />
              {vals.map((v, j) => {
                const bh = (v / max) * ph
                y -= bh
                return <rect key={j} x={x} y={y} width={bw} height={Math.max(0, bh)} rx="2" fill={colors?.[j] ?? d.c ?? 'var(--acc)'} opacity={stacked ? 1 : 0.9} />
              })}
              {showVals && total > 0 && (
                <text x={x + bw / 2} y={y - 4} textAnchor="middle" style={{ fill: 'var(--fg2)' }}>
                  {f(total)}
                </text>
              )}
              {i % step === 0 && (
                <text x={x + bw / 2} y={h + 17} textAnchor="middle">
                  {d.l}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {!onBar && (
        <table className="sr-only">
          <caption>{label}</caption>
          <thead><tr><th scope="col">Item</th><th scope="col">Value</th></tr></thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i}><th scope="row">{d.l}</th><td>{f(sum(d.v))}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export interface LineSeries {
  n: string
  c: string
  v: readonly number[]
}

export function Line({ series, labels, h = 170, fmt, label = 'Line chart' }: { series: readonly LineSeries[]; labels: readonly string[]; h?: number; fmt?: (v: number) => string; label?: string }) {
  const [ref, W] = useWidth()
  const max = Math.max(1, ...series.flatMap(s => s.v))
  const n = labels.length
  const empty = series.every(s => s.v.every(v => v === 0))
  const x0 = PL + 8
  const x1 = W - PR - 16
  const X = (i: number): number => x0 + i * ((x1 - x0) / Math.max(1, n - 1))
  const Y = (v: number): number => h - (v / max) * (h - TOP)
  const f = (v: number): string => (fmt ? fmt(v) : String(v))
  const step = labelStep(labels, (x1 - x0) / Math.max(1, n - 1))
  return (
    <div ref={ref}>
      <svg className="chart" viewBox={`0 0 ${W} ${h + 24}`} width={W} height={h + 24} style={{ display: 'block', maxWidth: '100%' }} aria-hidden="true">
        <YAxis W={W} h={h} max={max} fmt={fmt} empty={empty} />
        {series.map((s, j) => (
          <g key={j}>
            <polyline fill="none" stroke={s.c} strokeWidth="2" strokeLinejoin="round" points={s.v.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} />
            {s.v.map((v, i) => (
              <circle key={i} cx={X(i)} cy={Y(v)} r="3" fill={s.c}>
                <title>{`${s.n} · ${labels[i]}: ${f(v)}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {labels.map((l, i) =>
          i % step === 0 ? (
            <text key={i} x={X(i)} y={h + 17} textAnchor="middle">
              {l}
            </text>
          ) : null,
        )}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map(s => <th key={s.n} scope="col">{s.n}</th>)}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={i}>
              <th scope="row">{l}</th>
              {series.map(s => <td key={s.n}>{f(s.v[i] ?? 0)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Legend({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  return (
    <div className="row wrap" style={{ gap: 12 }}>
      {items.map(([l, c]) => (
        <span key={l} className="row xs muted" style={{ gap: 5 }}>
          <span className="dot" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  )
}

export interface FunnelStep {
  l: string
  v: number
  [extra: string]: unknown
}

export function Funnel({ steps, onStep }: { steps: readonly FunnelStep[]; onStep?: (s: FunnelStep) => void }) {
  const max = Math.max(1, steps[0]?.v || 1)
  return (
    <div className="col" style={{ gap: 6 }}>
      {steps.map((s, i) => (
        <button key={s.l} type="button" disabled={!onStep} onClick={() => onStep?.(s)} style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: onStep ? 'pointer' : 'default' }}>
          <div className="row sm" style={{ marginBottom: 3 }}>
            <span className="muted">{s.l}</span>
            <span className="sp" />
            <span className="b num">{F.num(s.v)}</span>
            {i > 0 && (
              <span className="faint xs num" style={{ width: 44, textAlign: 'right' }}>
                {steps[i - 1].v ? Math.round((s.v / steps[i - 1].v) * 100) + '%' : '—'}
              </span>
            )}
          </div>
          <div style={{ height: 14, borderRadius: 3, background: 'var(--line)' }}>
            <div style={{ height: '100%', width: Math.max(2, (s.v / max) * 100) + '%', background: 'var(--acc)', opacity: 1 - i * 0.13, borderRadius: 3 }} />
          </div>
        </button>
      ))}
    </div>
  )
}
