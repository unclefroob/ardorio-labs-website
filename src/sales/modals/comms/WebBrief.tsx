import { useEffect, useRef, useState } from 'react'
import { isFailure, prepareMeeting, type PrepOutcome } from '../../ai/client'
import { Q } from '../../data/Q'
import type { Meeting } from '../../data/types'
import { AiNotConfigured, Btn, Chip, Empty, Skel, Spinner } from '../../kit'
import { Src } from '../../shared/IntelBits'
import { copyText } from '../../shared/intelText'
import { useLookups } from '../../shared/useLookups'
import { UI } from '../../ui/store'
import { FailureBanner, Sources } from './Enrich'

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <div className="b sm" style={{ marginBottom: 4 }}>{title}</div>
      <ul className="sm" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>{items.map(x => <li key={x}>{x}</li>)}</ul>
    </div>
  )
}

/** An optional, web-searched addition to the rules-based briefing. Nothing runs until the user asks for it. */
export function WebBrief({ meeting }: { meeting: Meeting }) {
  const b = meeting.businessId
  const lk = useLookups(b)
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<PrepOutcome | null>(null)
  const live = useRef<AbortController | null>(null)
  useEffect(() => () => live.current?.abort(), [])
  const editable = Q.canEdit(b)

  const run = async (): Promise<void> => {
    if (busy) return
    const ac = new AbortController()
    live.current = ac
    setBusy(true)
    setOut(null)
    const o = await prepareMeeting({ businessId: b, meetingId: meeting.id }, { signal: ac.signal })
    if (live.current !== ac) return
    live.current = null
    setBusy(false)
    setOut(o)
  }
  const cancel = (): void => {
    live.current?.abort()
    live.current = null
    setBusy(false)
    setOut({ status: 'cancelled' })
  }

  const ready = out && !isFailure(out) ? out : null
  const copy = (): void => {
    if (!ready) return
    const p = ready.prep
    const lines = [
      p.summary,
      p.talkingPoints.length ? 'Talking points:\n' + p.talkingPoints.map(x => '- ' + x).join('\n') : '',
      p.questions.length ? 'Questions:\n' + p.questions.map(x => '- ' + x).join('\n') : '',
      p.watchOuts.length ? 'Watch-outs:\n' + p.watchOuts.map(x => '- ' + x).join('\n') : '',
      p.news.length ? 'News:\n' + p.news.map(n => `- ${n.headline} (${n.sourceUrl})`).join('\n') : '',
    ].filter(Boolean)
    copyText(lines.join('\n\n'), UI.toast, 'Brief copied')
  }

  const start = (
    <div className="row wrap">
      <Btn icon="search" disabled={!editable || lk.notConfigured || lk.capped || busy} onClick={() => void run()}>Prepare web brief · 1 lookup</Btn>
      {lk.label && !lk.notConfigured && <span className="sm muted">{lk.label}</span>}
      {!editable && <span className="sm muted">You need edit access to this business to use a lookup.</span>}
    </div>
  )

  return (
    <div className="card card-b col gap12" aria-label="Web brief">
      <div className="row wrap">
        <b className="sm">Web brief</b>
        <AiNotConfigured provider="xai" />
        <span className="sp" />
        {ready && <Chip icon="spark">Grok{ready.model ? ` (${ready.model})` : ''}</Chip>}
      </div>
      {busy ? (
        <div className="col gap12" aria-busy="true" role="status" aria-live="polite">
          <div className="row"><Spinner />Searching the public web… this can take 30 to 60 seconds.</div>
          <Skel rows={4} />
          <div><Btn size="sm" onClick={cancel}>Cancel</Btn></div>
        </div>
      ) : lk.notConfigured ? (
        <FailureBanner o={{ status: 'notConfigured' }} onRetry={() => undefined} />
      ) : ready ? (
        <div className="col gap12" role="status" aria-live="polite">
          {ready.prep.summary && <div className="sm" style={{ lineHeight: 1.6 }}>{ready.prep.summary}</div>}
          <div className="grid g2">
            <List title="Talking points" items={ready.prep.talkingPoints} />
            <List title="Questions to ask" items={ready.prep.questions} />
          </div>
          <List title="Watch-outs" items={ready.prep.watchOuts} />
          {ready.prep.news.length > 0 && (
            <div>
              <div className="b sm" style={{ marginBottom: 4 }}>Recent news</div>
              {ready.prep.news.map(n => <div key={n.headline + n.sourceUrl} className="sm">· {n.headline} <span className="xs">(<Src url={n.sourceUrl} />)</span></div>)}
            </div>
          )}
          {!ready.prep.summary && !ready.prep.talkingPoints.length && !ready.prep.news.length && (
            <Empty icon="search" title="Nothing usable found" body={ready.withheld > 0 ? `${ready.withheld} item(s) were withheld because none could be tied to a page we could check.` : 'No public information turned up for this company.'} />
          )}
          <Sources sources={ready.sources} />
          <div className="faint xs">This brief is not saved. Copy it if you want to keep it. {ready.disclaimer}</div>
          <div className="row wrap">
            <Btn size="sm" icon="copy" onClick={copy}>Copy</Btn>
            <Btn size="sm" disabled={lk.capped || !editable} onClick={() => void run()}>Prepare again · 1 lookup</Btn>
            {lk.label && <span className="sm muted">{lk.label}</span>}
          </div>
        </div>
      ) : out && isFailure(out) ? (
        <div className="col gap12">
          <FailureBanner o={out} onRetry={() => void run()} />
          {out.status !== 'cap' && start}
        </div>
      ) : lk.capped && lk.usage ? (
        <FailureBanner o={{ status: 'cap', usage: lk.usage }} onRetry={() => undefined} />
      ) : (
        <>
          <div className="muted sm">Searches the public web for recent news about the company and suggests talking points. Every item links to its source. Adds to the CRM briefing above.</div>
          {start}
        </>
      )}
    </div>
  )
}
