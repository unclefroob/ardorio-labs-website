import { cloneElement, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { UI } from '../ui/store'
import { menuBox } from './menuBox'
import { Btn } from './basic'
import { Icon } from './Icon'
import { useFocusTrap } from './util'

export function Modal({ title, sub, onClose, children, footer, width, icon, role = 'dialog', describedBy, closeLabel = 'Close' }: { title: string; sub?: ReactNode; onClose?: () => void; children?: ReactNode; footer?: ReactNode; width?: number | string; icon?: string; role?: 'dialog' | 'alertdialog'; describedBy?: string; closeLabel?: string }) {
  const close = onClose ?? UI.close
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, close)
  const onBg = (e: MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) close()
  }
  return (
    <div className="mbg" onMouseDown={onBg}>
      <div ref={ref} className="modal" role={role} aria-modal="true" aria-label={title} aria-describedby={describedBy} tabIndex={-1} style={width ? { maxWidth: width } : undefined}>
        <div className="modal-h">
          {icon && (
            <div style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--acc-soft)', color: 'var(--acc-ink)' }}>
              <Icon n={icon} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{title}</h2>
            {sub && (
              <div className="muted sm" style={{ marginTop: 2 }}>
                {sub}
              </div>
            )}
          </div>
          <Btn kind="ghost" size="sm" icon="x" onClick={close} aria-label={closeLabel} />
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  )
}

const closeDrawer = (): void => UI.drawer(null)

export function Drawer({ title, sub, children, footer, onClose }: { title: string; sub?: ReactNode; children?: ReactNode; footer?: ReactNode; onClose?: () => void }) {
  const close = onClose ?? closeDrawer
  const ref = useRef<HTMLElement>(null)
  useFocusTrap(ref, close)
  return (
    <>
      <div className="drawer-bg" onMouseDown={close} />
      <aside ref={ref} className="drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="modal-h" style={{ borderBottom: '1px solid var(--line)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="trunc">{title}</h2>
            {sub && <div className="muted sm">{sub}</div>}
          </div>
          <Btn kind="ghost" size="sm" icon="x" onClick={close} aria-label="Close" />
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </aside>
    </>
  )
}

export interface MenuItemDef {
  label: string
  icon?: string
  dot?: string
  right?: ReactNode
  checked?: boolean
  disabled?: boolean
  title?: string
  /** A non-clickable group label. */
  head?: boolean
  onClick?: () => void
}
export type MenuItem = MenuItemDef | '-' | null | false | undefined

interface TriggerProps {
  onClick?: (e: MouseEvent<HTMLElement>) => void
  'aria-expanded'?: boolean
  'aria-haspopup'?: 'menu'
}

export function Menu({ trigger, items, align, width }: { trigger: ReactElement<TriggerProps>; items: readonly MenuItem[]; align?: 'right' | 'left'; width?: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<CSSProperties | null>(null)
  // Drawn into the app root so it keeps the app's styles; with no root (a bare kit test) it stays inline.
  const [host, setHost] = useState<Element | null>(null)
  const toggle = (e: MouseEvent<HTMLElement>): void => {
    // A trigger that calls onClick without its event still opens, just inline.
    setHost(e?.currentTarget?.closest('.sos') ?? null)
    setBox(null)
    setOpen(!open)
  }
  useLayoutEffect(() => {
    if (!open || !host) return
    const place = (): void => {
      const t = ref.current
      const m = menuRef.current
      if (!t || !m) return
      setBox(menuBox(t.getBoundingClientRect(), m.scrollHeight, m.offsetWidth, window.innerWidth, window.innerHeight, align))
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, host, align])
  useEffect(() => {
    if (!open) return
    const out = (e: globalThis.MouseEvent): void => {
      if (!(e.target instanceof Node)) return
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('mousedown', out)
      document.removeEventListener('keydown', key, true)
    }
  }, [open])
  const size: CSSProperties = width ? { minWidth: width } : {}
  const pos: CSSProperties = host
    // Measured hidden on the first frame, then placed.
    ? { ...size, ...(box ?? { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }) }
    : { top: 'calc(100% + 4px)', ...(align === 'right' ? { right: 0 } : { left: 0 }), ...size }
  const list = (
    <div ref={menuRef} className="menu" role="menu" style={pos} onClick={e => e.stopPropagation()}>
      {items.map((it, i) => {
        if (!it) return null
        if (it === '-') return <div key={i} className="msep" role="separator" />
        if (it.head) return <div key={i} className="mlab">{it.label}</div>
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            className="mi"
            disabled={it.disabled}
            title={it.title}
            onClick={() => {
              setOpen(false)
              it.onClick?.()
            }}
          >
            {it.icon && <Icon n={it.icon} s={14} style={{ color: 'var(--fg3)' }} />}
            {it.dot && <span className="dot" style={{ background: it.dot }} />}
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.right != null && <span className="faint xs">{it.right}</span>}
            {it.checked && <Icon n="check" s={13} />}
          </button>
        )
      })}
    </div>
  )
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }} onClick={e => e.stopPropagation()}>
      {cloneElement(trigger, { onClick: toggle, 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open && (host ? createPortal(list, host) : list)}
    </span>
  )
}
