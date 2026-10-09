import { useState, type ReactNode } from 'react'
import { wipeDemo } from '../../api/demo'
import { SalesHttpError } from '../../api/http'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import { pollOnce } from '../../data/sync'
import type { BusinessId } from '../../data/types'
import { Banner, BizDot, Btn, Card, Chip, Fld, Sel, Spinner } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { UI } from '../../ui/store'

interface DemoLoader {
  loadDemo(o: { businessIds: BusinessId[]; onProgress?: (done: number, total: number) => void }): Promise<{ created: number }>
}

// The loader lives in src/sales/demo/ and must stay out of production bundles' main path, so it is only ever reached through this glob.
const LOADERS = import.meta.glob<unknown>('../../demo/index.ts')

function isLoader(m: unknown): m is DemoLoader {
  return typeof m === 'object' && m !== null && 'loadDemo' in m && typeof m.loadDemo === 'function'
}

const errText = (e: unknown): string => (e instanceof SalesHttpError ? e.message : "Couldn't reach the server")

function Action({ icon, children, onClick, kind, disabled }: { icon: string; children: ReactNode; onClick: () => void; kind?: string; disabled?: boolean }) {
  return <Btn icon={icon} kind={kind} disabled={disabled} onClick={onClick} style={{ justifyContent: 'flex-start' }}>{children}</Btn>
}

function WorkspaceCard() {
  const me = Q.me()
  const bs = Q.myBiz()
  return (
    <Card title="Workspace" icon="user">
      <Fld label="Workspace">
        <Sel value={S.session.ws} onChange={v => Act.setSession({ ws: v === 'all' ? 'all' : (v as BusinessId) })} options={[...(bs.length > 1 ? [['all', 'All Businesses'] as const] : []), ...bs.map(b => [b, Q.biz(b)?.name ?? b] as const)]} />
      </Fld>
      <div className="sm" style={{ marginTop: 12 }}>
        <span className="faint">You:</span> <b>{me.name}</b>
        <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
          {me.super
            ? <Chip tone="acc">Super Administrator</Chip>
            : S.businesses.filter(b => me.m[b.id]).map(b => <Chip key={b.id}><BizDot b={b.id} />{b.name}: {me.m[b.id]}</Chip>)}
        </div>
      </div>
    </Card>
  )
}

function TriggerCard() {
  const live = S.enrolments.filter(e => ['active', 'awaiting_task'].includes(e.status) && Q.inScope(e.businessId))
  const first = live[0]?.contactId
  const need = (): string | undefined => {
    if (!first) UI.toast('No active enrolments in scope. Enrol a contact first.', 'bad')
    return first
  }
  const trig = (scenario: string): void => {
    const c = need()
    if (c) UI.open('simReply', { contactId: c, scenario })
  }
  const evt = (kind: 'email_open' | 'link_click' | 'meeting_booked', msg: (n: string) => string) => (): void => {
    const c = need()
    if (!c) return
    Act.simEvent(kind, c)
    UI.toast(msg(Q.contact(c)?.name ?? 'contact'))
  }
  return (
    <Card title="Email & sequence triggers" icon="mail">
      {live.length === 0 && <div style={{ marginBottom: 10 }}><Banner tone="info">Nothing to trigger yet: no contacts are in an active sequence in this workspace.</Banner></div>}
      <div className="grid g2" style={{ gap: 6 }}>
        <Action icon="reply" onClick={() => UI.open('simReply', {})}>Trigger incoming email…</Action>
        <Action icon="star" onClick={() => trig('Interested')}>Trigger positive reply</Action>
        <Action icon="x" onClick={() => trig('Not interested')}>Trigger negative reply</Action>
        <Action icon="stop" onClick={() => trig('Unsubscribe request')}>Trigger unsubscribe</Action>
        <Action icon="alert" onClick={() => trig('Delivery failure')}>Trigger bounced email</Action>
        <Action icon="bell" onClick={() => { Act.sampleNotif(); UI.toast('Notification generated') }}>Generate sample notification</Action>
        <Action icon="eye" onClick={evt('email_open', n => `Simulated open for ${n} (informational only)`)}>Trigger email open</Action>
        <Action icon="link" onClick={evt('link_click', n => `Link click for ${n}`)}>Trigger link click</Action>
        <Action icon="cal" onClick={evt('meeting_booked', n => `Meeting booked by ${n}: sequence exits`)}>Trigger meeting booked</Action>
      </div>
    </Card>
  )
}

function EnrichCard() {
  const wizaFail = S.demo.wizaFail
  const researchFail = S.demo.researchFail
  const enrich = (): void => {
    const c = Q.contacts()[0]
    if (!c) {
      UI.toast('No contacts in this workspace to enrich', 'bad')
      return
    }
    Act.setDemo({ wizaFail: false })
    if (S.wiza.status !== 'connected') Act.setWiza({ status: 'connected' })
    UI.open('enrich', { contactId: c.id })
  }
  const research = (): void => {
    const co = Q.companies()[0]
    if (!co) {
      UI.toast('No companies in this workspace to research', 'bad')
      return
    }
    Act.setDemo({ researchFail: false })
    UI.nav('company', { id: co.id, q: { tab: 'intel' } })
  }
  return (
    <Card title="Enrichment & research triggers" icon="spark">
      <div className="grid g2" style={{ gap: 6 }}>
        <Action icon="zap" onClick={enrich}>Wiza enrichment success</Action>
        <Action icon="alert" kind={wizaFail ? 'pri' : undefined} onClick={() => { Act.setDemo({ wizaFail: !wizaFail }); UI.toast(`Wiza failure mode ${!wizaFail ? 'ON' : 'OFF'}`) }}>{wizaFail ? 'Turn off Wiza failure' : 'Wiza enrichment failure mode'}</Action>
        <Action icon="spark" onClick={research}>Company research result</Action>
        <Action icon="alert" kind={researchFail ? 'pri' : undefined} onClick={() => { Act.setDemo({ researchFail: !researchFail }); UI.toast(`Research failure mode ${!researchFail ? 'ON' : 'OFF'}`) }}>{researchFail ? 'Turn off research failure' : 'Research unavailable mode'}</Action>
      </div>
    </Card>
  )
}

type LoadState = { s: 'idle' } | { s: 'loading'; done: number; total: number } | { s: 'error'; msg: string }

function DataCard() {
  const bs = Q.myBiz().filter(b => Q.canAdmin(b))
  const [scope, setScope] = useState('')
  const [load, setLoad] = useState<LoadState>({ s: 'idle' })
  const [wiping, setWiping] = useState(false)
  const [err, setErr] = useState('')
  const loaderKey = Object.keys(LOADERS)[0]
  const targets = (): BusinessId[] => (scope ? [scope as BusinessId] : bs)
  const label = scope ? Q.biz(scope)?.name ?? scope : 'every business you administer'

  const run = async (): Promise<void> => {
    if (!loaderKey) return
    setLoad({ s: 'loading', done: 0, total: 0 })
    try {
      const mod = await LOADERS[loaderKey]?.()
      if (!isLoader(mod)) throw new Error('The demo data package is not valid.')
      const r = await mod.loadDemo({ businessIds: targets(), onProgress: (done, total) => setLoad({ s: 'loading', done, total }) })
      await pollOnce()
      setLoad({ s: 'idle' })
      UI.toast(`Loaded ${r.created} demo records`)
    } catch (e) {
      setLoad({ s: 'error', msg: e instanceof Error && !(e instanceof SalesHttpError) ? e.message : errText(e) })
    }
  }
  const wipe = (): void => {
    UI.confirm({
      title: 'Wipe demo data?',
      body: `Every record that was created as demo data in ${label} is removed for everyone. Real records are not touched.`,
      confirm: 'Wipe demo data',
      danger: true,
      onConfirm: () => {
        setWiping(true)
        setErr('')
        wipeDemo({ businessIds: targets() })
          .then(async r => {
            await pollOnce()
            UI.toast(`Wiped ${r.wiped} demo record${r.wiped === 1 ? '' : 's'}`)
          })
          .catch((e: unknown) => setErr(`Couldn't wipe demo data. ${errText(e)}`))
          .finally(() => setWiping(false))
      },
    })
  }
  return (
    <Card title="Demo data" icon="flag">
      <div className="faint sm" style={{ marginBottom: 10 }}>Demo records are flagged when they are created, so they can be removed without touching real data.</div>
      {bs.length > 1 && (
        <Fld label="Applies to">
          <Sel value={scope} onChange={setScope} placeholder="Every business you administer" options={bs.map(b => [b, Q.biz(b)?.name ?? b] as const)} />
        </Fld>
      )}
      {err && <div style={{ marginTop: 10 }}><Banner tone="bad">{err}</Banner></div>}
      {load.s === 'error' && <div style={{ marginTop: 10 }}><Banner tone="bad" action={<Btn size="sm" onClick={() => { void run() }}>Retry</Btn>}>Couldn't load demo tools. {load.msg}</Banner></div>}
      {!loaderKey && <div style={{ marginTop: 10 }}><Banner tone="info">Loading demo data is not available in this build.</Banner></div>}
      <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
        <Btn icon="upload" disabled={!loaderKey || load.s === 'loading' || !bs.length} onClick={() => { void run() }}>
          {load.s === 'loading' ? <><Spinner />{load.total ? `Loading ${load.done}/${load.total}…` : 'Loading…'}</> : 'Load demo data'}
        </Btn>
        <Btn kind="danger" icon="trash" disabled={wiping || !bs.length} onClick={wipe}>{wiping ? <><Spinner />Wiping…</> : 'Wipe demo data'}</Btn>
      </div>
    </Card>
  )
}

export function Demo() {
  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <PageHead title="Demo Control Centre" sub="Administrator-only simulation controls for end-to-end testing" />
      <div className="grid g3" style={{ marginBottom: 14 }}>
        <WorkspaceCard />
      </div>
      <div className="grid g2" style={{ marginBottom: 14 }}>
        <TriggerCard />
        <EnrichCard />
      </div>
      <DataCard />
    </div>
  )
}
