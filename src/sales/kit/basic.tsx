import { cloneElement, isValidElement, useId, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { F } from '../data/F'
import { Q } from '../data/Q'
import type { SalesUser } from '../data/types'
import { Icon } from './Icon'

type BtnProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  kind?: string
  size?: string
  icon?: string
  iconRight?: string
  children?: ReactNode
}

export function Btn({ kind, size, icon, children, className, iconRight, type = 'button', ...r }: BtnProps) {
  return (
    <button type={type} className={['btn', kind, size, !children && icon ? 'icon' : '', className].filter(Boolean).join(' ')} {...r}>
      {icon && <Icon n={icon} s={size === 'xs' ? 12 : size === 'sm' ? 13 : 15} />}
      {children}
      {iconRight && <Icon n={iconRight} s={13} />}
    </button>
  )
}

export function Chip({ tone, children, icon, title, style }: { tone?: string; children?: ReactNode; icon?: string; title?: string; style?: CSSProperties }) {
  return (
    <span className={'chip ' + (tone || '')} title={title} style={style}>
      {icon && <Icon n={icon} s={11} />}
      {children}
    </span>
  )
}

export function Av({ u, name, s = 24, color }: { u?: Pick<SalesUser, 'name' | 'color'> | null; name?: string; s?: number; color?: string }) {
  const nm = u ? u.name : name
  return (
    <span className="av" title={nm} style={{ width: s, height: s, fontSize: s * 0.4, background: u ? u.color : color || '#8E8897' }}>
      {F.ini(nm)}
    </span>
  )
}

export function BizDot({ b, s = 8 }: { b: string; s?: number }) {
  return <span className="dot" style={{ background: Q.biz(b)?.accent, width: s, height: s }} />
}

export function BizChip({ b }: { b: string }) {
  const bz = Q.biz(b)
  if (!bz) return null
  return (
    <span className="chip" style={{ gap: 6 }}>
      <BizDot b={b} />
      {bz.name}
    </span>
  )
}

export type TabDef = string | readonly [key: string, label: ReactNode, count?: number | string | null]

export function Tabs({ tabs, value, onChange }: { tabs: readonly TabDef[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(t => {
        const [k, l, c] = typeof t === 'string' ? [t, t, undefined] : t
        return (
          <button key={k} type="button" role="tab" aria-selected={value === k} className={'tab' + (value === k ? ' on' : '')} onClick={() => onChange(k)}>
            {l}
            {c != null && <span className="cnt">{c}</span>}
          </button>
        )
      })}
    </div>
  )
}

export type SegDef = string | readonly [key: string, label: ReactNode, icon?: string]

export function Seg({ opts, value, onChange }: { opts: readonly SegDef[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="seg" role="group">
      {opts.map(o => {
        const [k, l, ic] = typeof o === 'string' ? [o, o, undefined] : o
        return (
          <button key={k} type="button" aria-pressed={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
            {ic && <Icon n={ic} s={13} />}
            {l}
          </button>
        )
      })}
    </div>
  )
}

/** Binds the label to a single control child through a generated id; other children are left alone. */
export function Fld({ label, hint, err, children, style, req }: { label?: ReactNode; hint?: ReactNode; err?: ReactNode; children?: ReactNode; style?: CSSProperties; req?: boolean }) {
  const gen = useId()
  const only = isValidElement<{ id?: string }>(children) ? children : null
  const id = only?.props.id ?? gen
  return (
    <div className="fld" style={style}>
      {label && (
        <label htmlFor={only ? id : undefined}>
          {label}
          {req && <span style={{ color: 'var(--bad2)' }}> *</span>}
        </label>
      )}
      {only && !only.props.id ? cloneElement(only, { id }) : children}
      {err ? <div className="err" role="alert">{err}</div> : hint && <div className="hint">{hint}</div>}
    </div>
  )
}

type InpProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value?: string | number | null; onChange?: (v: string) => void }

export function Inp({ value, onChange, className, ...r }: InpProps) {
  return <input className={'inp ' + (className || '')} value={value ?? ''} onChange={e => onChange?.(e.target.value)} {...r} />
}

export type OptionDef = string | readonly [value: string, label: ReactNode]

export function Sel({ value, onChange, options, placeholder, className, ...r }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & { value?: string | null; onChange: (v: string) => void; options: readonly OptionDef[]; placeholder?: string | null }) {
  return (
    <select className={'inp ' + (className || '')} value={value ?? ''} onChange={e => onChange(e.target.value)} {...r}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map(o => {
        const [v, l] = typeof o === 'string' ? [o, o] : o
        return (
          <option key={v} value={v}>
            {l}
          </option>
        )
      })}
    </select>
  )
}

export function TA({ value, onChange, ...r }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & { value?: string | null; onChange: (v: string) => void }) {
  return <textarea className="ta" value={value ?? ''} onChange={e => onChange(e.target.value)} {...r} />
}

export function Ck({ checked, onChange, children, disabled, label }: { checked?: boolean; onChange: (v: boolean) => void; children?: ReactNode; disabled?: boolean; label?: string }) {
  return (
    <label className="ck" style={disabled ? { opacity: 0.5 } : undefined}>
      <input type="checkbox" checked={!!checked} disabled={disabled} aria-label={label} onChange={e => onChange(e.target.checked)} onClick={e => e.stopPropagation()} />
      {children}
    </label>
  )
}

export function Toggle({ on, onChange, label, disabled }: { on?: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} className={'tg' + (on ? ' on' : '')} onClick={() => onChange(!on)} />
}

export function Empty({ icon = 'inbox', title, body, action }: { icon?: string; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ic">
        <Icon n={icon} s={18} />
      </div>
      <h4>{title}</h4>
      {body && <p>{body}</p>}
      {action}
    </div>
  )
}

export function Kpi({ label, value, sub, onClick, tone, title }: { label: ReactNode; value: ReactNode; sub?: ReactNode; onClick?: () => void; tone?: string; title?: string }) {
  return (
    <button type="button" className="kpi" onClick={onClick} title={title || (onClick ? 'Open matching records' : undefined)}>
      <span className="l">{label}</span>
      <span className="v" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}
      </span>
      {sub && <span className="s">{sub}</span>}
    </button>
  )
}

export function Prog({ v, tone, h }: { v: number; tone?: string; h?: number }) {
  const pct = Math.max(0, Math.min(100, v))
  return (
    <div className="prog" style={h ? { height: h } : undefined} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <i style={{ width: pct + '%', background: tone ? `var(--${tone})` : undefined }} />
    </div>
  )
}

export function Card({ title, right, children, pad = true, style, icon, className }: { title?: ReactNode; right?: ReactNode; children?: ReactNode; pad?: boolean; style?: CSSProperties; icon?: string; className?: string }) {
  return (
    <section className={'card ' + (className || '')} style={style}>
      {title && (
        <div className="card-h">
          {icon && <Icon n={icon} s={14} style={{ color: 'var(--fg3)' }} />}
          <h3>{title}</h3>
          {right && <div className="r">{right}</div>}
        </div>
      )}
      {pad ? <div className="card-b">{children}</div> : children}
    </section>
  )
}

export function Banner({ tone, icon, children, action }: { tone?: 'bad' | 'warn' | 'ok' | 'info'; icon?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={'banner ' + (tone || '')} role={tone === 'bad' ? 'alert' : 'status'}>
      <Icon n={icon || (tone === 'bad' || tone === 'warn' ? 'alert' : tone === 'ok' ? 'check' : 'info')} s={15} style={{ marginTop: 1, color: `var(--${tone === 'bad' ? 'bad2' : tone || 'fg2'})` }} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {action}
    </div>
  )
}

export function Spinner({ s = 14 }: { s?: number }) {
  return <Icon n="refresh" s={s} className="spin" />
}

export function Skel({ rows = 3 }: { rows?: number }) {
  return (
    <div className="col" style={{ gap: 10 }} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skel" style={{ width: 90 - i * 15 + '%' }} />
      ))}
    </div>
  )
}

export function ScoreRing({ v, s = 46 }: { v: number; s?: number }) {
  const c = v >= 75 ? 'var(--ok)' : v >= 55 ? 'var(--info)' : v >= 35 ? 'var(--warn)' : 'var(--fg3)'
  return (
    <div className="scr" role="img" aria-label={`Score ${v}`} style={{ width: s, height: s, background: `conic-gradient(${c} ${v * 3.6}deg, var(--line) 0)`, fontSize: s * 0.3 }}>
      <div style={{ width: s - 8, height: s - 8, borderRadius: '50%', background: 'var(--surf)', display: 'grid', placeItems: 'center' }}>{v}</div>
    </div>
  )
}

export function Sim({ children }: { children?: ReactNode }) {
  return <span className="sim">{children || 'Simulated'}</span>
}
