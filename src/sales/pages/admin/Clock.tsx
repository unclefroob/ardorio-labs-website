import { useState } from 'react'
import { nudge } from '../../api/engine'
import type { EngineRunResponse } from '../../api/contract'
import { Act } from '../../data/Act'
import { formatOffset, getOffsetMinutes, now as clockNow, useNow } from '../../data/clock'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { flushAll } from '../../data/sync'
import { formatInstant, orgTz, wallFromMs } from '../../data/tz'
import { Btn, Card, Chip, Inp } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { Denied } from '../../shell/states'
import { UI } from '../../ui/store'

const PRESETS: ReadonlyArray<readonly [hours: number, label: string]> = [[1, '+1 hour'], [4, '+4 hours'], [24, '+1 day'], [72, '+3 days'], [168, '+1 week']]

const WHY: Record<string, string> = {
  busy: 'another run was already in progress',
  held_elsewhere: 'another server instance holds the run lock',
  disabled: 'the engine is switched off on the server',
}

type RunState = { s: 'idle' } | { s: 'running' } | { s: 'done'; r: EngineRunResponse } | { s: 'error' }

function RunResult({ st }: { st: RunState }) {
  if (st.s === 'running') return <div className="faint sm" role="status">Asking the server…</div>
  if (st.s === 'error') return <div className="sm" role="alert" style={{ color: 'var(--bad2)' }}>Could not reach the engine. The server also runs on its own timer, so due steps will still be picked up.</div>
  if (st.s !== 'done') return null
  const { r } = st
  return (
    <div className="sm" role="status">
      {r.ran
        ? <>Ran{r.businessIds.length ? <> for {r.businessIds.join(', ')}</> : null}.</>
        : <>Did not run ({r.reason ?? 'no reason given'}){r.reason && WHY[r.reason] ? `: ${WHY[r.reason]}` : ''}.</>}
      <div className="faint xs">Server time {formatInstant(Date.parse(r.serverNow))}</div>
    </div>
  )
}

/** Administrator control for the shared simulated clock. Moving it moves it for every user. */
export function Clock() {
  useNow()
  const [run, setRun] = useState<RunState>({ s: 'idle' })
  const offset = getOffsetMinutes()
  const [date, setDate] = useState(() => wallFromMs(clockNow()).slice(0, 16))
  if (!Q.anyAdmin()) return <Denied what="The clock" />

  const real = clockNow() - offset * 60000
  const runNow = async (): Promise<void> => {
    setRun({ s: 'running' })
    try {
      // The engine reads the clock offset and enrolments from the server, so save what is local first.
      await flushAll()
      setRun({ s: 'done', r: await nudge() })
    } catch {
      setRun({ s: 'error' })
    }
  }
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageHead title="Clock" sub={`Simulated time for testing sequences. All times are ${orgTz().replace(/_/g, ' ')} time.`} />
      <div className="col gap12">
        <Card title="Simulated clock" icon="clock" right={offset ? <Chip tone="warn">{formatOffset(offset)}</Chip> : <Chip>Real time</Chip>}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.01em' }}>{F.long(F.nowIso())}</div>
          <div className="muted">{formatInstant(clockNow())}</div>
          <div className="faint xs" style={{ marginTop: 4 }}>Real time: {formatInstant(real)}</div>
          <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
            {PRESETS.map(([h, l]) => (
              <Btn key={h} size="sm" kind={h === 72 ? 'pri' : undefined} onClick={() => { Act.advance(h); UI.toast(`Advanced ${l.slice(1)}`) }}>{l}</Btn>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <Inp type="datetime-local" className="sm" value={date} onChange={setDate} aria-label="Set date and time" />
            <Btn size="sm" disabled={!date} onClick={() => { Act.setClock(date); UI.toast('Clock set') }}>Set</Btn>
            <Btn size="sm" kind="ghost" disabled={!offset} onClick={() => { Act.resetClock(); setDate(wallFromMs(clockNow()).slice(0, 16)); UI.toast('Clock back to real time') }}>Reset</Btn>
          </div>
          <div className="faint xs" style={{ marginTop: 8 }}>Moving the clock moves it for every user, and sequences run against the new time.</div>
        </Card>
        <Card title="Sequence engine" icon="zap">
          <div className="sm" style={{ marginBottom: 10 }}>The server turns due sequence steps into email tasks. It runs on its own timer; use this to run it now.</div>
          <Btn icon="play" disabled={run.s === 'running'} onClick={() => { void runNow() }}>Run due steps</Btn>
          <div style={{ marginTop: 10 }}><RunResult st={run} /></div>
        </Card>
      </div>
    </div>
  )
}
