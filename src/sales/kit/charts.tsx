import { F } from '../data/F'

export interface BarDatum {
  l: string
  v: number | number[]
  c?: string
}

export function Bars({ data, h = 180, fmt, stacked, onBar, colors }: { data: readonly BarDatum[]; h?: number; fmt?: (v: number) => string; stacked?: boolean; onBar?: (d: BarDatum, i: number) => void; colors?: readonly string[] }) {
  const sum = (v: number | number[]): number => (Array.isArray(v) ? v.reduce((s, x) => s + x, 0) : v)
  const max = Math.max(1, ...data.map(d => (stacked ? sum(d.v) : Array.isArray(d.v) ? Math.max(...d.v) : d.v)))
  const slot = 400 / Math.max(1, data.length)
  return (
    <svg className="chart" viewBox={`0 0 400 ${h + 24}`} width="100%" style={{ display: 'block' }} preserveAspectRatio="none" role="img">
      {[0, 0.5, 1].map(f => (
        <line key={f} x1="0" x2="400" y1={h - h * f * 0.92} y2={h - h * f * 0.92} stroke="var(--line)" />
      ))}
      {data.map((d, i) => {
        const x = i * slot + slot * 0.18
        const w = slot * 0.64
        let y = h
        const vals = stacked && Array.isArray(d.v) ? d.v : [sum(d.v)]
        const total = sum(d.v)
        return (
          <g key={i} style={{ cursor: onBar ? 'pointer' : undefined }} onClick={() => onBar?.(d, i)}>
            <title>{`${d.l}: ${fmt ? fmt(total) : total}`}</title>
            {vals.map((v, j) => {
              const bh = (v / max) * h * 0.92
              y -= bh
              return <rect key={j} x={x} y={y} width={w} height={Math.max(0, bh)} rx="2" fill={colors?.[j] ?? d.c ?? 'var(--acc)'} opacity={stacked ? 1 : 0.9} />
            })}
            <text x={x + w / 2} y={h + 15} textAnchor="middle">
              {d.l}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export interface LineSeries {
  n: string
  c: string
  v: readonly number[]
}

export function Line({ series, labels, h = 170, fmt }: { series: readonly LineSeries[]; labels: readonly string[]; h?: number; fmt?: (v: number) => string }) {
  const max = Math.max(1, ...series.flatMap(s => s.v))
  const n = labels.length
  const X = (i: number): number => 10 + i * (380 / Math.max(1, n - 1))
  const Y = (v: number): number => h - (v / max) * h * 0.9
  return (
    <svg className="chart" viewBox={`0 0 400 ${h + 24}`} width="100%" style={{ display: 'block' }} role="img">
      {[0, 0.5, 1].map(f => (
        <line key={f} x1="0" x2="400" y1={h - h * f * 0.9} y2={h - h * f * 0.9} stroke="var(--line)" />
      ))}
      {series.map((s, j) => (
        <g key={j}>
          <polyline fill="none" stroke={s.c} strokeWidth="2" strokeLinejoin="round" points={s.v.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} />
          {s.v.map((v, i) => (
            <circle key={i} cx={X(i)} cy={Y(v)} r="2.5" fill={s.c}>
              <title>{`${s.n} · ${labels[i]}: ${fmt ? fmt(v) : v}`}</title>
            </circle>
          ))}
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={i} x={X(i)} y={h + 15} textAnchor="middle">
          {l}
        </text>
      ))}
    </svg>
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
