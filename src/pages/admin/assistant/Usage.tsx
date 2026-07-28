/**
 * F4 — Internal LLM cost / usage dashboard (Phase 1: telemetry only).
 *
 * Reads from /admin/assistant/budget (Ardorio admin auth). NEVER customer-facing
 * — the customer view at F5 stays in "hours saved" units, not dollars.
 *
 * Phase 2 (enforcement) and Phase 3 (rate-limit middleware) remain on the
 * backlog; this page is the data-gathering window for sizing those caps.
 */

import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../../lib/apiClient'

type BudgetRow = {
  userId: string
  displayName: string
  email: string | null
  role: string | null
  usd: number
  microUsd: number
}

type ToolRow = { tool: string; usd: number; microUsd: number }
type ModelRow = { model: string; usd: number; microUsd: number }
type TrendPoint = { month: string; usd: number; microUsd: number; callCount: number }

type BudgetResponse = {
  month: string
  totals: {
    usd: number
    microUsd: number
    callCount: number
    stubCallCount: number
  }
  perUser: BudgetRow[]
  perTool: ToolRow[]
  perModel: ModelRow[]
  trend: TrendPoint[]
}

function currentMonthOption(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function recentMonths(end: string, count: number): string[] {
  const [y, m] = end.split('-').map(n => parseInt(n, 10))
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

function fmtUsd(n: number): string {
  if (n === 0) return '$0.0000'
  return `$${n.toFixed(4)}`
}

function fmtMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(n => parseInt(n, 10))
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-AU', { month: 'short', year: 'numeric' })
}

function Sparkline({ trend }: { trend: TrendPoint[] }) {
  const max = Math.max(1, ...trend.map(t => t.microUsd))
  const w = 320
  const h = 64
  const stepX = w / Math.max(1, trend.length - 1)
  const points = trend.map((t, i) => {
    const x = i * stepX
    const y = h - (t.microUsd / max) * (h - 8) - 4
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={w} height={h} className="block">
      <polyline
        fill="none"
        stroke="#1C1917"
        strokeWidth="1.5"
        points={points}
      />
      {trend.map((t, i) => (
        <circle
          key={t.month}
          cx={i * stepX}
          cy={h - (t.microUsd / max) * (h - 8) - 4}
          r={2.5}
          fill="#1C1917"
        />
      ))}
    </svg>
  )
}

export default function AdminAssistantUsage() {
  const [month, setMonth] = useState<string>(currentMonthOption())
  const [data, setData] = useState<BudgetResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const monthOptions = useMemo(() => recentMonths(currentMonthOption(), 12), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch<BudgetResponse>(`/admin/assistant/budget?month=${encodeURIComponent(month)}`)
      .then(res => { if (!cancelled) setData(res) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [month])

  return (
    <div className="bg-cream-100 min-h-screen">
      <div className="max-w-[1152px] mx-auto py-14 px-6">
        <header className="flex items-end justify-between gap-6 mb-10">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-600">
              Assistant · Internal
            </p>
            <h1 className="font-serif text-4xl text-ink mt-2" style={{ fontVariationSettings: '"opsz" 12' }}>
              Usage &amp; cost
            </h1>
            <p className="text-stone-700 mt-2 max-w-xl">
              Token spend per user, per tool, per model. Margin protection view. Phase 1 — telemetry only;
              no enforcement yet. Data is forward-only from first deploy of the counter.
            </p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600">Month</span>
            <select
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="bg-cream-50 border border-cream-300 px-3 py-2 font-mono text-sm text-ink hover:bg-cream-200 transition-colors"
            >
              {monthOptions.map(m => (
                <option key={m} value={m}>{fmtMonthLabel(m)}</option>
              ))}
            </select>
          </label>
        </header>

        {loading && <p className="font-mono text-sm text-stone-600">Loading…</p>}
        {error && <p className="font-mono text-sm text-red-500">Error: {error}</p>}

        {data && (
          <>
            <section className="grid grid-cols-12 gap-6 mb-12 pb-12 border-b border-cream-300">
              <div className="col-span-12 md:col-span-7">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600">
                  Total · {fmtMonthLabel(data.month)}
                </p>
                <p className="font-serif text-6xl text-ink mt-2" style={{ fontVariationSettings: '"opsz" 12' }}>
                  {fmtUsd(data.totals.usd)}
                </p>
                <div className="grid grid-cols-3 gap-6 mt-6 max-w-md">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600">Calls</p>
                    <p className="font-serif text-2xl text-ink mt-1">{data.totals.callCount}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600">Stub calls</p>
                    <p className="font-serif text-2xl text-stone-600 mt-1">{data.totals.stubCallCount}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600">$ / call</p>
                    <p className="font-serif text-2xl text-ink mt-1">
                      {data.totals.callCount > 0
                        ? fmtUsd(data.totals.usd / data.totals.callCount)
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="col-span-12 md:col-span-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 mb-3">
                  Six-month trend
                </p>
                <Sparkline trend={data.trend} />
                <div className="flex justify-between mt-2 font-mono text-[10px] text-stone-600">
                  {data.trend.map(t => (
                    <span key={t.month}>{t.month.slice(5)}</span>
                  ))}
                </div>
              </div>
            </section>

            <section className="mb-12 pb-12 border-b border-cream-300">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 mb-4">
                Per user
              </p>
              {data.perUser.length === 0 ? (
                <p className="text-stone-600 font-mono text-sm">No usage recorded this month.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-cream-300">
                      <th className="text-left font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 py-2">User</th>
                      <th className="text-left font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 py-2">Role</th>
                      <th className="text-right font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 py-2">Spend</th>
                      <th className="text-right font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 py-2">% of total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perUser.map(row => (
                      <tr key={row.userId} className="border-b border-cream-200 hover:bg-cream-200 transition-colors">
                        <td className="py-3">
                          <div className="font-serif text-base text-ink">{row.displayName}</div>
                          {row.email && <div className="font-mono text-[11px] text-stone-600">{row.email}</div>}
                        </td>
                        <td className="font-mono text-xs text-stone-700">{row.role ?? '—'}</td>
                        <td className="text-right font-serif text-base text-ink">{fmtUsd(row.usd)}</td>
                        <td className="text-right font-mono text-xs text-stone-700">
                          {data.totals.microUsd > 0
                            ? `${Math.round((row.microUsd / data.totals.microUsd) * 100)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="mb-12 pb-12 border-b border-cream-300">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 mb-4">
                Per tool
              </p>
              {data.perTool.length === 0 ? (
                <p className="text-stone-600 font-mono text-sm">No tool calls recorded this month.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-cream-300">
                      <th className="text-left font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 py-2">Tool</th>
                      <th className="text-right font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 py-2">Spend</th>
                      <th className="text-right font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 py-2">% of total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perTool.map(row => (
                      <tr key={row.tool} className="border-b border-cream-200 hover:bg-cream-200 transition-colors">
                        <td className="font-mono text-sm text-ink py-3">{row.tool}</td>
                        <td className="text-right font-serif text-base text-ink">{fmtUsd(row.usd)}</td>
                        <td className="text-right font-mono text-xs text-stone-700">
                          {data.totals.microUsd > 0
                            ? `${Math.round((row.microUsd / data.totals.microUsd) * 100)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="mb-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 mb-4">
                Per model
              </p>
              {data.perModel.length === 0 ? (
                <p className="text-stone-600 font-mono text-sm">No model calls recorded this month.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-cream-300">
                      <th className="text-left font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 py-2">Model</th>
                      <th className="text-right font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 py-2">Spend</th>
                      <th className="text-right font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 py-2">% of total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perModel.map(row => (
                      <tr key={row.model} className="border-b border-cream-200 hover:bg-cream-200 transition-colors">
                        <td className="font-mono text-sm text-ink py-3">{row.model}</td>
                        <td className="text-right font-serif text-base text-ink">{fmtUsd(row.usd)}</td>
                        <td className="text-right font-mono text-xs text-stone-700">
                          {data.totals.microUsd > 0
                            ? `${Math.round((row.microUsd / data.totals.microUsd) * 100)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <p className="font-mono text-[10px] text-stone-400 mt-12">
              Phase 1 telemetry · forward-only counter · enforcement deferred to Phase 2.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
