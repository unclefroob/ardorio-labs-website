import { useEffect, useRef } from 'react'
import { F } from '../data/F'
import { UI } from '../ui/store'
import { Btn } from './basic'
import { Menu } from './overlay'

export function RichText({ value, onChange, tokens, minH, onAI, aiBusy, label = 'Message body' }: { value: string; onChange: (html: string) => void; tokens?: readonly string[]; minH?: number | string; onAI?: () => void; aiBusy?: boolean; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef<string | null>(null)
  useEffect(() => {
    if (ref.current && value !== last.current) {
      ref.current.innerHTML = F.body(value)
      last.current = value
    }
  }, [value])

  const emit = (): void => {
    const el = ref.current
    if (!el) return
    last.current = el.innerHTML
    onChange(el.innerHTML)
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
        <Btn kind="ghost" size="xs" icon="ul" onClick={() => ex('insertUnorderedList')} title="Bulleted list" aria-label="Bulleted list" />
        <Btn kind="ghost" size="xs" icon="link" onClick={link} title="Link" aria-label="Link" />
        {tokens && (
          <>
            <span style={{ width: 1, height: 16, background: 'var(--line2)', margin: '0 4px' }} />
            <Menu trigger={<Btn kind="ghost" size="xs" iconRight="down">Insert token</Btn>} items={tokens.map(t => ({ label: `{{${t}}}`, onClick: () => ex('insertText', `{{${t}}}`) }))} />
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
      <div ref={ref} className="rte" contentEditable suppressContentEditableWarning style={minH ? { minHeight: minH } : undefined} onInput={emit} role="textbox" aria-multiline="true" aria-label={label} />
    </div>
  )
}
