import { useState } from 'react'
import { TA, Toggle } from './basic'
import { looksLikeMarkdown, renderSalesMarkdown } from './markdown'

/** Long text shown formatted (Markdown) or exactly as typed, as the viewer chose. */
export function MarkdownText({ text, formatted }: { text: string; formatted: boolean }) {
  if (!formatted || !looksLikeMarkdown(text)) return <div className="sm" style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
  return <div className="sm md" dangerouslySetInnerHTML={{ __html: renderSalesMarkdown(text) }} />
}

/** The "Formatted" switch for a card that shows Markdown (state from useFormatted, in markdown.ts). */
export function FormattedSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="row xs faint" style={{ gap: 6 }}>
      Formatted
      <Toggle on={on} onChange={onChange} label="Show Markdown formatting" />
    </span>
  )
}

/** A text box for Markdown, with Write and Preview, and a one-line reminder of the syntax. */
export function MarkdownArea({ value, onChange, rows = 6, label, autoFocus, onKeyDown, minHeight }: {
  value: string; onChange: (v: string) => void; rows?: number; label: string; autoFocus?: boolean; minHeight?: number
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row xs" style={{ gap: 4 }} role="tablist" aria-label={`${label}: write or preview`}>
        {(['write', 'preview'] as const).map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={'md-tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>{t === 'write' ? 'Write' : 'Preview'}</button>
        ))}
        <span className="sp" />
        <span className="faint">Markdown: **bold**, # heading, - list, [link](https://…)</span>
      </div>
      {tab === 'write' ? (
        <TA aria-label={label} value={value} onChange={onChange} rows={rows} autoFocus={autoFocus} onKeyDown={onKeyDown} style={{ fontFamily: 'inherit', ...(minHeight ? { minHeight } : {}) }} />
      ) : (
        <div className="md-preview" style={minHeight ? { minHeight } : undefined}>
          {value.trim() ? <MarkdownText text={value} formatted /> : <span className="faint sm">Nothing to preview yet.</span>}
        </div>
      )}
    </div>
  )
}
