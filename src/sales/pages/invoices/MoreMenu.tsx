import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Btn, Icon } from '../../kit'

export interface MoreItem {
  key: string
  label: string
  icon: string
  /** Red text: for the one destructive item. */
  danger?: boolean
  /** Shown but unavailable. The item stays focusable so a keyboard user finds it and hears `hint`. */
  disabled?: boolean
  /** Visible text under the item (not a tooltip): why it is unavailable. */
  hint?: string
  /** A divider is drawn above this item. */
  divider?: boolean
  onSelect?: () => void
}

/**
 * The "More" overflow menu of an invoice header. Arrow keys move, Home and End jump, Escape closes and returns focus to the
 * trigger, Tab closes. Choosing an item puts focus back on the trigger before the action runs, so a dialog the action opens
 * returns focus to the button that started it.
 */
export function MoreMenu({ label, items }: { label: string; items: readonly MoreItem[] }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const id = useId()
  const [first, setFirst] = useState(0)

  useEffect(() => {
    if (!open) return
    refs.current[first]?.focus()
    const out = (e: MouseEvent): void => {
      if (wrap.current && e.target instanceof Node && !wrap.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  }, [open, first])

  if (!items.length) return null

  const close = (refocus: boolean): void => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }
  const move = (to: number): void => {
    const n = items.length
    refs.current[((to % n) + n) % n]?.focus()
  }
  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const at = refs.current.findIndex(r => r === document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); move(at + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(at - 1) }
    else if (e.key === 'Home') { e.preventDefault(); move(0) }
    else if (e.key === 'End') { e.preventDefault(); move(items.length - 1) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
    else if (e.key === 'Tab') close(false)
  }
  const onTriggerKey = (e: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setFirst(e.key === 'ArrowUp' ? items.length - 1 : 0)
      setOpen(true)
    }
  }
  const choose = (it: MoreItem): void => {
    if (it.disabled) return
    close(true)
    it.onSelect?.()
  }

  return (
    <span ref={wrap} style={{ position: 'relative', display: 'inline-flex' }}>
      <Btn
        ref={trigger}
        icon="more"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => { setFirst(0); setOpen(!open) }}
        onKeyDown={onTriggerKey}
      >
        More
      </Btn>
      {open && (
        <div id={id} className="menu" role="menu" aria-label="More actions" style={{ top: 'calc(100% + 6px)', right: 0, minWidth: 260 }} onKeyDown={onMenuKey}>
          {items.map((it, i) => (
            <div key={it.key}>
              {it.divider && <div className="msep" role="separator" />}
              <button
                ref={el => { refs.current[i] = el }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={'mi' + (it.danger ? ' dngtxt' : '')}
                aria-disabled={it.disabled || undefined}
                aria-describedby={it.hint ? `${id}-${it.key}` : undefined}
                onClick={() => choose(it)}
              >
                <Icon n={it.icon} s={14} />
                <span style={{ flex: 1 }}>{it.label}</span>
              </button>
              {it.hint && <div id={`${id}-${it.key}`} className="mhint">{it.hint}</div>}
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
