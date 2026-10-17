import { useState } from 'react'
import { Act } from '../../data/Act'
import type { Deal } from '../../data/types'
import { Btn, Card, FormattedSwitch, MarkdownArea, MarkdownText, useFormatted } from '../../kit'
import { UI } from '../../ui/store'

// The deal's scope summary: long, multi-paragraph text (what is sold, how it is priced, the terms), so it edits in place in a
// tall text box, not in the one-line prompt dialog. Ctrl or Cmd + Enter saves; Escape cancels.
export function ScopeCard({ d, can }: { d: Deal; can: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  const editing = draft !== null
  const [formatted, setFormatted] = useFormatted()

  const save = (): void => {
    if (draft === null) return
    if (draft !== d.description) {
      Act.updateDeal(d.id, { description: draft })
      UI.toast('Scope saved')
    }
    setDraft(null)
  }

  return (
    <Card
      title="Description / scope"
      right={can && editing ? (
        <>
          <Btn size="sm" onClick={() => setDraft(null)}>Cancel</Btn>
          <Btn size="sm" kind="pri" onClick={save}>Save</Btn>
        </>
      ) : d.description ? <FormattedSwitch on={formatted} onChange={setFormatted} /> : null}
    >
      {editing ? (
        <MarkdownArea
          label="Scope summary"
          value={draft}
          onChange={setDraft}
          rows={14}
          autoFocus
          minHeight={260}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.stopPropagation(); setDraft(null) }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() }
          }}
        />
      ) : d.description ? (
        <MarkdownText text={d.description} formatted={formatted} />
      ) : (
        <div className="faint sm">No scope summary yet.</div>
      )}
      {can && !editing && (
        <Btn size="xs" kind="ghost" icon="edit" style={{ marginTop: 8 }} onClick={() => setDraft(d.description)}>Edit</Btn>
      )}
      {editing && <div className="faint sm" style={{ marginTop: 6 }}>Ctrl+Enter to save · Esc to cancel</div>}
    </Card>
  )
}
