import { useEffect, useRef } from 'react'
import { F } from '../data/F'
import { UI } from '../ui/store'
import { Btn } from './basic'
import { chipify, copyChips, insertChip, paintChips, serializeHtml, type ChipInfo } from './tokenChips'
import { TokenMenu } from './TokenField'
import { useCaret, useChipEditor, useTokenPicker } from './tokenHooks'

/**
 * The email editor. With `tokens`, its variables show as chips (typed "{{", the Insert menu, or pasted {{key}} text all become chips);
 * what it hands back is still HTML with plain {{key}} text in it. `info` colours chips some contacts have no value for.
 */
export function RichText({ value, onChange, tokens, minH, onAI, aiBusy, label = 'Message body', info }: { value: string; onChange: (html: string) => void; tokens?: readonly string[]; minH?: number | string; onAI?: () => void; aiBusy?: boolean; label?: string; info?: ChipInfo }) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef<string | null>(null)
  const chips = !!tokens
  const caret = useCaret(ref)
  useEffect(() => {
    if (ref.current && value !== last.current) {
      ref.current.innerHTML = F.body(value)
      if (chips) chipify(ref.current, info)
      last.current = value
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps -- chips follow `info` below without rebuilding the text
  useEffect(() => { if (ref.current && chips) paintChips(ref.current, info) }, [info, chips])

  const emit = (): void => {
    const el = ref.current
    if (!el) return
    const html = chips ? serializeHtml(el) : el.innerHTML
    last.current = html
    onChange(html)
  }
  const picker = useTokenPicker(ref, (key, back) => { if (ref.current) { insertChip(ref.current, key, info, back); emit() } })
  const chipEd = useChipEditor(ref, emit, () => { if (ref.current) paintChips(ref.current, info) }, chips)
  const addToken = (key: string): void => {
    if (!ref.current) return
    ref.current.focus()
    caret.restore()
    insertChip(ref.current, key, info)
    emit()
  }
  const ex = (cmd: string, arg?: string): void => {
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    emit()
  }
  const link = (): void => {
    const sel = window.getSelection()
    const saved = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
    UI.ask(
      url => {
        ref.current?.focus()
        const s = window.getSelection()
        if (saved && s) {
          s.removeAllRanges()
          s.addRange(saved)
        }
        document.execCommand('createLink', false, url)
        emit()
      },
      'Link URL',
      'https://',
    )
  }
  return (
    <div>
      <div className="rte-tb" role="toolbar" aria-label="Formatting">
        <Btn kind="ghost" size="xs" icon="bold" onClick={() => ex('bold')} title="Bold" aria-label="Bold" />
        <Btn kind="ghost" size="xs" icon="italic" onClick={() => ex('italic')} title="Italic" aria-label="Italic" />
        <Btn kind="ghost" size="xs" icon="underline" onClick={() => ex('underline')} title="Underline" aria-label="Underline" />
        <Btn kind="ghost" size="xs" icon="ul" onClick={() => ex('insertUnorderedList')} title="Bulleted list" aria-label="Bulleted list" />
        <Btn kind="ghost" size="xs" icon="ol" onClick={() => ex('insertOrderedList')} title="Numbered list" aria-label="Numbered list" />
        <Btn kind="ghost" size="xs" icon="link" onClick={link} title="Link" aria-label="Link" />
        {tokens && (
          <>
            <span style={{ width: 1, height: 16, background: 'var(--line2)', margin: '0 4px' }} />
            <TokenMenu onPick={addToken} />
          </>
        )}
        {onAI && (
          <>
            <span className="sp" />
            <Btn kind="ghost" size="xs" icon="spark" onClick={onAI} disabled={aiBusy}>
              {aiBusy ? 'Drafting…' : 'AI draft'}
            </Btn>
          </>
        )}
      </div>
      <div
        ref={ref} className="rte" contentEditable suppressContentEditableWarning style={minH ? { minHeight: minH } : undefined} role="textbox" aria-multiline="true" aria-label={label}
        onInput={() => { if (chips && ref.current) chipify(ref.current, info); emit(); if (chips) picker.check() }}
        onKeyDown={e => { if (chips) picker.onKeyDown(e) }}
        onKeyUp={caret.save} onMouseUp={caret.save} onBlur={caret.save} onClick={chipEd.onClick}
        onCopy={e => { if (chips && ref.current) copyChips(e, ref.current, false) }}
        onCut={e => { if (chips && ref.current) copyChips(e, ref.current, true, emit) }}
      />
      {picker.view}
      {chipEd.view}
    </div>
  )
}
