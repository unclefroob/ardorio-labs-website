import { useRef, useState } from 'react'
import type { RosterioPlan, RosterioProvisionRequest } from '../../api/contract'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { asPlan, planLabel, PLAN_OPTIONS, provision, rosterioLinkOf, UNSURE_MESSAGE, useRosterioLinks, useRosterioStatus, linkSummary } from '../../data/rosterio'
import type { Deal } from '../../data/types'
import { Banner, Btn, Fld, Inp, Sel, Toggle } from '../../kit/basic'
import { Spinner } from '../../kit/basic'
import { Modal } from '../../kit/overlay'
import { UI } from '../../ui/store'
import { MissingModal, NoEditModal } from './guards'

interface Draft {
  accountName: string
  adminFirstName: string
  adminLastName: string
  adminEmail: string
  adminPhone: string
  plan: RosterioPlan
  isTrial: boolean
  trialEndDate: string
}
type Phase = 'form' | 'confirm' | 'sending'
interface Done { accountName: string; email: string; isNewUser: boolean; tempPassword: string | null }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TITLE = 'Provision Rosterio account'

export function ProvisionRosterio({ dealId }: { dealId: string }) {
  const d = Q.deal(dealId)
  if (!d || d.businessId !== 'ros') return <MissingModal title={TITLE} what="Rosterio deal" />
  if (!Q.canEdit('ros')) return <NoEditModal title={TITLE} what="set up Rosterio accounts" />
  return <Gate d={d} />
}

/**
 * Only opens the form when the link is switched on and this company has no account yet. Once the person has pressed
 * the button this stops gating: a sync that lands mid-request must not swap the form away, and the password panel
 * must not be replaced by "already set up". The result is held here, one level above the form.
 */
function Gate({ d }: { d: Deal }) {
  const st = useRosterioStatus()
  useRosterioLinks()
  const [engaged, setEngaged] = useState(false)
  const [done, setDone] = useState<Done | null>(null)
  const link = rosterioLinkOf(Q.company(d.companyId))
  const close = <Btn onClick={UI.close}>Close</Btn>
  if (done) return <DonePanel done={done} />
  if (engaged) return <Form d={d} recover={link?.state === 'unknown'} onStart={() => setEngaged(true)} onDone={setDone} />
  if (st.s === 'idle' || st.s === 'loading') return <Modal title={TITLE} footer={close}><div className="row sm"><Spinner />Checking the Rosterio link…</div></Modal>
  if (st.s === 'error') return <Modal title={TITLE} footer={close}><Banner tone="bad">{st.message}</Banner></Modal>
  if (!st.status.configured) {
    return <Modal title={TITLE} footer={close}><Banner tone="info">Not set up: ask an admin to set the Rosterio URL and key.</Banner></Modal>
  }
  if (link?.state === 'provisioned') {
    return <Modal title={TITLE} footer={close}><Banner tone="ok">Rosterio account: {linkSummary(link)}</Banner></Modal>
  }
  if (link?.state === 'provisioning') {
    return <Modal title={TITLE} footer={close}><Banner tone="info">This account is being set up right now. Close this and check back in a minute.</Banner></Modal>
  }
  return <Form d={d} recover={link?.state === 'unknown'} onStart={() => setEngaged(true)} onDone={setDone} />
}

function Form({ d, recover, onStart, onDone }: { d: Deal; recover: boolean; onStart: () => void; onDone: (r: Done) => void }) {
  const co = Q.company(d.companyId)
  const ct = Q.contact(d.primaryContact) ?? Q.contact(d.contactIds[0])
  const prior = rosterioLinkOf(co)
  const [f, setF] = useState<Draft>({
    accountName: prior?.accountName ?? co?.name ?? '',
    adminFirstName: ct?.firstName ?? '', adminLastName: ct?.lastName ?? '', adminEmail: ct?.email ?? '', adminPhone: ct?.phone || ct?.mobile || '',
    plan: asPlan(prior?.plan) ?? asPlan(d.fields.plan) ?? 'starter',
    isTrial: prior?.isTrial ?? false, trialEndDate: prior?.trialEndDate ?? '',
  })
  const [phase, setPhase] = useState<Phase>('form')
  const [err, setErr] = useState<Partial<Record<keyof Draft, string>>>({})
  const [problem, setProblem] = useState('')
  const sending = useRef(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]): void => setF(o => ({ ...o, [k]: v }))

  const validate = (): boolean => {
    const e: Partial<Record<keyof Draft, string>> = {}
    if (!f.accountName.trim()) e.accountName = 'Enter the account name'
    if (!f.adminFirstName.trim()) e.adminFirstName = 'Enter a first name'
    if (!f.adminLastName.trim()) e.adminLastName = 'Enter a last name'
    if (!EMAIL.test(f.adminEmail.trim())) e.adminEmail = 'Enter a valid email address'
    if (f.isTrial && !(f.trialEndDate > F.today())) e.trialEndDate = 'Pick a trial end date in the future'
    setErr(e)
    return Object.keys(e).length === 0
  }

  const send = async (): Promise<void> => {
    if (sending.current) return
    sending.current = true
    onStart()
    setProblem('')
    setPhase('sending')
    const req: RosterioProvisionRequest = {
      dealId: d.id, accountName: f.accountName.trim(), adminFirstName: f.adminFirstName.trim(), adminLastName: f.adminLastName.trim(),
      adminEmail: f.adminEmail.trim(), plan: f.plan, isTrial: f.isTrial,
      ...(f.adminPhone.trim() ? { adminPhone: f.adminPhone.trim() } : {}),
      ...(f.isTrial ? { trialEndDate: f.trialEndDate } : {}),
    }
    const r = await provision(d.companyId, req)
    sending.current = false
    if (r.ok) {
      onDone({ accountName: r.link.accountName || req.accountName, email: r.adminUser.email, isNewUser: r.adminUser.isNewUser, tempPassword: r.adminUser.tempPassword })
      return
    }
    setProblem(r.message)
    setPhase('form')
  }

  const next = (): void => {
    if (!validate()) return
    if (recover) void send()
    else setPhase('confirm')
  }

  if (phase === 'confirm' || (phase === 'sending' && !recover)) {
    const busy = phase === 'sending'
    return (
      <Modal
        title="Confirm new Rosterio account"
        icon="zap"
        sub={d.title}
        footer={<><Btn disabled={busy} onClick={() => setPhase('form')}>Back</Btn><Btn kind="pri" disabled={busy} onClick={() => void send()}>{busy ? 'Creating…' : 'Create account'}</Btn></>}
      >
        <Banner tone="warn">This creates a live Rosterio account and a login for {f.adminEmail.trim()}.</Banner>
        <dl className="dl" style={{ marginTop: 12 }}>
          <dt>Account name</dt><dd>{f.accountName.trim()}</dd>
          <dt>Plan</dt><dd>{planLabel(f.plan)}</dd>
          <dt>Trial</dt><dd>{f.isTrial ? 'Until ' + F.date(f.trialEndDate) : 'No'}</dd>
          <dt>Login for</dt><dd>{f.adminFirstName.trim()} {f.adminLastName.trim()} ({f.adminEmail.trim()})</dd>
        </dl>
      </Modal>
    )
  }

  const busy = phase === 'sending'
  return (
    <Modal
      title={recover ? 'Check Rosterio account' : TITLE}
      icon="zap"
      sub={d.title}
      width={620}
      footer={
        <>
          <Btn onClick={UI.close}>Cancel</Btn>
          <Btn kind="pri" disabled={busy} onClick={next}>{recover ? (busy ? 'Checking…' : 'Check status') : 'Continue'}</Btn>
        </>
      }
    >
      {recover && !problem && <Banner tone="warn">{UNSURE_MESSAGE} If the account was never created, this creates it now with a login for {f.adminEmail.trim() || 'the email below'}.</Banner>}
      {problem && <Banner tone="bad">{problem}</Banner>}
      <div className="grid g2" style={{ marginTop: 8 }}>
        <Fld label="Account name" req err={err.accountName} style={{ gridColumn: '1/-1' }}><Inp value={f.accountName} onChange={v => set('accountName', v)} autoFocus /></Fld>
        <Fld label="Admin first name" req err={err.adminFirstName}><Inp value={f.adminFirstName} onChange={v => set('adminFirstName', v)} /></Fld>
        <Fld label="Admin last name" req err={err.adminLastName}><Inp value={f.adminLastName} onChange={v => set('adminLastName', v)} /></Fld>
        <Fld label="Admin email" req err={err.adminEmail} hint="This person gets the login."><Inp type="email" value={f.adminEmail} onChange={v => set('adminEmail', v)} /></Fld>
        <Fld label="Admin phone"><Inp value={f.adminPhone} onChange={v => set('adminPhone', v)} /></Fld>
        <Fld label="Plan"><Sel value={f.plan} onChange={v => set('plan', asPlan(v) ?? 'starter')} options={PLAN_OPTIONS} /></Fld>
        <Fld label="Trial">
          <div className="row"><Toggle on={f.isTrial} onChange={v => set('isTrial', v)} label="This is a trial" /><span className="sm muted">{f.isTrial ? 'Trial account' : 'Paid account'}</span></div>
        </Fld>
        {f.isTrial && <Fld label="Trial ends" req err={err.trialEndDate}><Inp type="date" value={f.trialEndDate} onChange={v => set('trialEndDate', v)} /></Fld>}
      </div>
    </Modal>
  )
}

/** The one place the temporary password is shown. It lives in this component's state and is gone when the window closes. */
function DonePanel({ done }: { done: Done }) {
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(done.tempPassword ?? '')
      UI.toast('Password copied')
    } catch {
      UI.toast('Could not copy. Select the password and copy it by hand.', 'bad')
    }
  }
  return (
    <Modal title="Rosterio account created" icon="check" sub={done.accountName} footer={<Btn kind="pri" onClick={UI.close}>Close</Btn>}>
      <Banner tone="ok">The account is live. The login is for {done.email}.</Banner>
      {done.tempPassword ? (
        <div style={{ marginTop: 14 }}>
          <div className="b sm">Temporary password</div>
          <div className="row" style={{ marginTop: 6 }}>
            <code data-testid="temp-password" style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--surf2)', userSelect: 'all' }}>{done.tempPassword}</code>
            <Btn size="sm" icon="copy" onClick={() => void copy()}>Copy password</Btn>
          </div>
          <Banner tone="warn">Shown once, not stored by SalesOS. Pass it to the customer securely. When you close this window it is gone for good.</Banner>
        </div>
      ) : (
        <div className="sm muted" style={{ marginTop: 14 }}>
          {done.isNewUser
            ? 'No password was returned. Ask a Rosterio admin to reset the login for this person.'
            : 'This person already had a Rosterio login, so no new password was made. If the account was created earlier, its password was only shown once at that time.'}
        </div>
      )}
    </Modal>
  )
}
