import { useEffect, useRef, type ReactNode } from 'react'
import { TOKEN_DEFS, tokenRe } from '../data/tokens'
import { useCaret, useChipEditor, useTokenPicker } from './tokenHooks'
import { Btn } from './basic'
import { Menu } from './overlay'
import { chipify, chipView, copyChips, insertChip, paintChips, serializeText, type ChipInfo } from './tokenChips'

// The pieces every editor shares to show variables as chips: the "{{" picker, the Insert menu, a one-line field (subjects), and
// read-only text (step cards). All of them read and write plain {{key}} text.

/** The Insert menu of variables, labelled as the chips are, with an example of each. */
export function TokenMenu({ onPick, disabled, label = 'Insert variable' }: { onPick: (key: string) => void; disabled?: boolean; label?: string }) {
  return (
    <Menu
      align="right"
      trigger={<Btn kind="ghost" size="xs" iconRight="down" disabled={disabled}>{label}</Btn>}
      items={TOKEN_DEFS.map(t => ({ label: t.label, right: 'e.g. ' + t.sample, onClick: () => onPick(t.key) }))}
    />
  )
}

/**
 * A one-line field (a subject) that shows its variables as chips. Its value is plain text with {{key}}; Enter does nothing (a subject
 * is one line), pasted text loses its line breaks, and typing "{{" or the Insert menu adds a variable.
 */
export function TokenInput({ value, onChange, disabled, placeholder, label, info, id }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string; label: string; info?: ChipInfo; id?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef<string | null>(null)
  const caret = useCaret(ref)
  useEffect(() => {
    const el = ref.current
    if (!el || value === last.current) return
    el.textContent = value
    chipify(el, info)
    last.current = value
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps -- the chips' look follows `info` below, without rebuilding the text
  useEffect(() => { if (ref.current) paintChips(ref.current, info) }, [info])
  const emit = (): void => {
    const el = ref.current
    if (!el) return
    const v = serializeText(el)
    last.current = v
    onChange(v)
  }
  const picker = useTokenPicker(ref, (key, back) => { if (ref.current) { insertChip(ref.current, key, info, back); emit() } })
  const chipEd = useChipEditor(ref, emit, () => { if (ref.current) paintChips(ref.current, info) }, !disabled)
  return (
    <div className="tokinp-w">
      <div
        ref={ref} id={id} className={'inp tokinp' + (disabled ? ' dis' : '')} contentEditable={!disabled} suppressContentEditableWarning
        role="textbox" aria-label={label} aria-multiline="false" aria-disabled={disabled || undefined} data-ph={placeholder}
        onInput={() => { if (ref.current) chipify(ref.current, info); emit(); picker.check() }}
        onKeyDown={e => { if (picker.onKeyDown(e)) return; if (e.key === 'Enter') e.preventDefault() }}
        onKeyUp={caret.save} onMouseUp={caret.save} onBlur={caret.save} onClick={chipEd.onClick}
        onPaste={e => {
          e.preventDefault()
          const t = e.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' ')
          ref.current?.ownerDocument.execCommand('insertText', false, t)
        }}
        onCopy={e => { if (ref.current) copyChips(e, ref.current, false) }}
        onCut={e => { if (ref.current) copyChips(e, ref.current, true, emit) }}
      />
      {!disabled && <TokenMenu label="Insert" onPick={key => { if (!ref.current) return; ref.current.focus(); caret.restore(); insertChip(ref.current, key, info); emit() }} />}
      {picker.view}
      {chipEd.view}
    </div>
  )
}

/** Text with its variables shown as chips, read-only (step cards, titles, lists). */
export function TokenText({ text, info }: { text: string; info?: ChipInfo }) {
  const out: ReactNode[] = []
  let at = 0
  for (const m of text.matchAll(tokenRe())) {
    const start = m.index ?? 0
    if (start > at) out.push(text.slice(at, start))
    const v = chipView(m[1], m[2] !== undefined ? m[2].trim() : undefined, info)
    out.push(<span key={start} className={v.cls} title={v.title} aria-label={v.aria}>{v.label}</span>)
    at = start + m[0].length
  }
  if (at < text.length) out.push(text.slice(at))
  return <>{out}</>
}
