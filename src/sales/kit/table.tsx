import { useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Btn, Ck, Empty } from './basic'
import { Icon } from './Icon'

export interface Col<R> {
  k: string
  l?: ReactNode
  w?: number | string
  right?: boolean
  hide?: boolean
  nosort?: boolean
  desc?: boolean
  wrap?: boolean
  max?: number | string
  sort?: (r: R) => unknown
  r?: (r: R) => ReactNode
}

export type SortState = [key: string, dir: 1 | -1]

type Cmp = string | number

function cmpVal(v: unknown): Cmp {
  if (v == null) return -Infinity
  if (typeof v === 'number' || typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  return String(v)
}

const sortBtn: CSSProperties = { background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }

export interface DataTableProps<R> {
  cols: readonly Col<R>[]
  rows: readonly R[]
  rowKey?: string
  sel?: readonly string[]
  setSel?: (ids: string[]) => void
  onRow?: (r: R) => void
  empty?: ReactNode
  page?: number
  sortInit?: SortState | null
  dense?: boolean
}

export function DataTable<R extends object>({ cols, rows, rowKey = 'id', sel, setSel, onRow, empty, page = 30, sortInit }: DataTableProps<R>) {
  const [sort, setSort] = useState<SortState | null>(sortInit ?? null)
  const [n, setN] = useState(page)
  const get = (r: R, k: string): unknown => (r as Record<string, unknown>)[k]
  const idOf = (r: R): string => String(get(r, rowKey))
  const sorted = useMemo(() => {
    if (!sort) return rows
    const c = cols.find(x => x.k === sort[0])
    if (!c) return rows
    const fn = c.sort ?? ((r: R) => (r as Record<string, unknown>)[c.k])
    return rows.slice().sort((a, b) => {
      const x = cmpVal(fn(a))
      const y = cmpVal(fn(b))
      return x > y ? sort[1] : x < y ? -sort[1] : 0
    })
  }, [rows, sort, cols])
  if (!rows.length) return <>{empty ?? <Empty title="No records" body="Nothing matches the current filters." />}</>
  const vis = sorted.slice(0, n)
  const selected = sel ?? []
  const allOn = !!sel && rows.every(r => selected.includes(idOf(r)))
  const shown = cols.filter(c => !c.hide)
  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, r: R): void => {
    if (onRow && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onRow(r)
    }
  }
  return (
    <div>
      <div className="tw">
        <table className={sel && setSel ? 'tbl tbl-sel' : 'tbl'}>
          <thead>
            <tr>
              {sel && setSel && (
                <th>
                  <Ck checked={allOn} label="Select all" onChange={v => setSel(v ? rows.map(idOf) : [])} />
                </th>
              )}
              {shown.map(c => {
                const on = sort && sort[0] === c.k
                return (
                  <th key={c.k} className={c.nosort ? '' : 's'} style={{ width: c.w, textAlign: c.right ? 'right' : undefined }} aria-sort={on ? (sort[1] > 0 ? 'ascending' : 'descending') : undefined}>
                    {c.nosort ? (
                      c.l
                    ) : (
                      <button type="button" style={sortBtn} onClick={() => setSort(on ? [c.k, (-sort[1]) as 1 | -1] : [c.k, c.desc ? -1 : 1])}>
                        {c.l}
                        {on && <Icon n={sort[1] > 0 ? 'up' : 'down'} s={11} style={{ marginLeft: 3 }} />}
                      </button>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {vis.map(r => {
              const id = idOf(r)
              const on = selected.includes(id)
              return (
                <tr key={id} className={(onRow ? 'click ' : '') + (on ? 'sel' : '')} tabIndex={onRow ? 0 : undefined} onClick={() => onRow?.(r)} onKeyDown={e => onKey(e, r)}>
                  {sel && setSel && (
                    <td onClick={e => e.stopPropagation()}>
                      <Ck checked={on} label="Select row" onChange={v => setSel(v ? selected.concat(id) : selected.filter(x => x !== id))} />
                    </td>
                  )}
                  {shown.map(c => (
                    <td key={c.k} className={c.wrap ? 'w' : ''} style={{ textAlign: c.right ? 'right' : undefined, maxWidth: c.max }}>
                      {c.r ? c.r(r) : (get(r, c.k) as ReactNode)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length > n && (
        <div className="row" style={{ justifyContent: 'center', padding: 10, borderTop: '1px solid var(--line)' }}>
          <Btn size="sm" onClick={() => setN(n + page)}>Show more</Btn>
          <span className="faint sm">Showing {n} of {rows.length}</span>
        </div>
      )}
    </div>
  )
}

export function BulkBar({ n, clear, children }: { n: number; clear: () => void; children?: ReactNode }) {
  if (!n) return null
  return (
    <div className="row wrap" style={{ padding: '8px 12px', background: 'var(--acc-soft)', borderBottom: '1px solid var(--acc-line)' }}>
      <span className="b" style={{ color: 'var(--acc-ink)' }}>{n} selected</span>
      {children}
      <span className="sp" />
      <Btn kind="ghost" size="sm" onClick={clear}>Clear</Btn>
    </div>
  )
}

export function FilterBar({ children }: { children?: ReactNode }) {
  return (
    <div className="row wrap" style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', gap: 8 }}>
      {children}
    </div>
  )
}

export function SearchInp({ value, onChange, placeholder, w = 240 }: { value: string; onChange: (v: string) => void; placeholder?: string; w?: number }) {
  return (
    <div style={{ position: 'relative', width: w, maxWidth: '100%' }}>
      <Icon n="search" s={13} style={{ position: 'absolute', left: 9, top: 8, color: 'var(--fg3)' }} />
      <input className="inp sm" style={{ paddingLeft: 28 }} value={value} placeholder={placeholder || 'Search'} onChange={e => onChange(e.target.value)} aria-label={placeholder || 'Search'} />
    </div>
  )
}
