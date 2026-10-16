import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { TOKEN_DEFS } from '../data/tokens'
import { Btn } from './basic'
import { pickerQuery } from './tokenChips'

/** Remember where the caret was in an editor, so a menu click (which moves focus) still inserts there. */
export function useCaret(root: RefObject<HTMLElement | null>): { save: () => void; restore: () => void } {
  const saved = useRef<Range | null>(null)
  return {
    save: () => {
      const sel = root.current?.ownerDocument.getSelection()
      if (sel && sel.rangeCount && root.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange()
    },
    restore: () => {
      const sel = root.current?.ownerDocument.getSelection()
      if (!sel || !saved.current || !root.current?.contains(saved.current.startContainer)) return
      sel.removeAllRanges()
      sel.addRange(saved.current)
    },
  }
}

/** Typing "{{" opens a list of variables under the caret: arrows to move, Enter or Tab to insert, Escape to close. */
export function useTokenPicker(root: RefObject<HTMLElement | null>, onPick: (key: string, back: number) => void): {
  check: () => void; onKeyDown: (e: KeyboardEvent) => boolean; view: ReactNode
} {
  const [st, setSt] = useState<{ q: string; back: number; left: number; top: number; idx: number } | null>(null)
  const items = st ? TOKEN_DEFS.filter(t => !st.q || t.key.includes(st.q) || t.label.toLowerCase().includes(st.q)) : []
  const check = (): void => {
    const r = root.current ? pickerQuery(root.current) : null
    setSt(r ? { q: r.q, back: r.back, left: r.rect?.left ?? 0, top: (r.rect?.bottom ?? 0) + 4, idx: 0 } : null)
  }
  const pick = (key: string): void => { if (st) onPick(key, st.back); setSt(null) }
  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (!st || !items.length) return false
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setSt({ ...st, idx: (st.idx + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length })
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(items[Math.min(st.idx, items.length - 1)].key); return true }
    if (e.key === 'Escape') { e.preventDefault(); setSt(null); return true }
    return false
  }
  const view = st && items.length ? (
    <div className="tokpick" role="listbox" aria-label="Insert a variable" style={{ left: st.left, top: st.top }}>
      {items.map((t, i) => (
        <button
          key={t.key} type="button" role="option" aria-selected={i === st.idx} className={'tokpick-i' + (i === st.idx ? ' on' : '')}
          onMouseDown={e => { e.preventDefault(); pick(t.key) }}
        >
          <span className={'tok tok-' + t.side}>{t.label}</span>
          <span className="faint xs">e.g. {t.sample}</span>
        </button>
      ))}
    </div>
  ) : null
  return { check, onKeyDown, view }
}


/**
 * Click a chip to set what goes in when the contact has no value (its fallback), to have it left out, or to remove the variable.
 * The chip is changed in place and the editor saves, so the stored text becomes {{key|fallback}}.
 */
export function useChipEditor(root: RefObject<HTMLElement | null>, onChanged: () => void, refresh: () => void, enabled: boolean): {
  onClick: (e: MouseEvent) => void; view: ReactNode
} {
  const chip = useRef<HTMLElement | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const [st, setSt] = useState<{ key: string; left: number; top: number; fb: string } | null>(null)
  // A click anywhere else closes it, as a menu does.
  const open = !!st
  useEffect(() => {
    if (!open) return
    const away = (e: globalThis.MouseEvent): void => { if (!box.current?.contains(e.target as Node) && e.target !== chip.current) setSt(null) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  const onClick = (e: MouseEvent): void => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('.tok')
    if (!enabled || !el || !root.current?.contains(el)) return
    const r = el.getBoundingClientRect()
    chip.current = el
    setSt({ key: el.dataset.tok ?? '', left: r.left, top: r.bottom + 4, fb: el.dataset.fb ?? '' })
  }
  const done = (fb: string | undefined | null): void => {
    const el = chip.current
    if (!st || !el) return
    if (fb === null) el.remove()
    else if (fb === undefined) delete el.dataset.fb
    else el.dataset.fb = fb
    refresh()
    onChanged()
    setSt(null)
  }
  const d = st ? TOKEN_DEFS.find(t => t.key === st.key) : undefined
  const view = st ? (
    <div ref={box} className="tokpick tokedit" role="dialog" aria-label={`Variable ${d?.label ?? st.key}`} style={{ left: st.left, top: st.top }} onKeyDown={e => { if (e.key === 'Escape') setSt(null) }}>
      <div className="sm b">{d?.label ?? `{{${st.key}}}`}</div>
      {d && <div className="faint xs">{d.side === 'contact' ? "From the contact's record" : 'From your own details'}, e.g. {d.sample}</div>}
      {d && (
        <label className="col xs" style={{ gap: 4, marginTop: 8 }}>
          If empty, use
          <input
            className="inp" autoFocus value={st.fb} placeholder={d.key === 'first_name' ? 'there' : d.key === 'company_name' ? 'your team' : 'Leave empty to hold the email'}
            onChange={e => setSt({ ...st, fb: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); done(st.fb.trim() || undefined) } }}
          />
        </label>
      )}
      <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
        {d && <Btn size="xs" kind="pri" onClick={() => done(st.fb.trim() || undefined)}>Save</Btn>}
        {d && <Btn size="xs" onClick={() => done('')} title="Send the email without it">Leave out if empty</Btn>}
        <Btn size="xs" kind="ghost" onClick={() => done(null)}>Remove</Btn>
        <span className="sp" />
        <Btn size="xs" kind="ghost" onClick={() => setSt(null)}>Cancel</Btn>
      </div>
      <div className="faint xs" style={{ marginTop: 6 }}>Without a fallback, an email to someone with no value is held until it is filled in.</div>
    </div>
  ) : null
  return { onClick, view }
}
