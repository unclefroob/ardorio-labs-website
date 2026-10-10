import { useNavigate } from 'react-router-dom'
import { Act } from '../data/Act'
import { Q } from '../data/Q'
import { S, useStore } from '../data/store'
import { useSyncStatus } from '../data/sync'
import { Av, Btn, Icon, Menu, Spinner, type MenuItem } from '../kit'
import { UI, useUi } from '../ui/store'
import { ClockBanner } from './Banners'

const QUICK: ReadonlyArray<readonly [string, string, string] | '-'> = [
  ['newCompany', 'New company', 'building'],
  ['newContact', 'New contact', 'user'],
  ['newDeal', 'New deal', 'kanban'],
  ['newTask', 'New task', 'checksq'],
  '-',
  ['logCall', 'Log call', 'phone'],
  ['logMeeting', 'Log meeting', 'users'],
  ['compose', 'Compose email', 'mail'],
  '-',
  ['research', 'Start research', 'spark'],
  ['enrol', 'Enrol in sequence', 'send'],
]

export function Topbar() {
  useStore()
  const ui = useUi()
  const sync = useSyncStatus()
  const navigate = useNavigate()
  const me = Q.me()
  const unread = Q.notifs().filter(n => !n.read).length
  const can = Q.anyEdit()
  const dark = S.session.theme === 'dark'

  const quick: MenuItem[] = QUICK.map(x =>
    x === '-' ? '-' : { label: x[1], icon: x[2], onClick: () => (x[0] === 'research' ? UI.nav('prospecting', { q: { tab: 'research' } }) : UI.open(x[0])) },
  )
  const account: MenuItem[] = [
    { label: `${me.name}${me.title ? ' · ' + me.title : ''}`, head: true },
    ...Q.myBiz().map<MenuItem>(b => ({ label: `${Q.biz(b)?.name ?? b}: ${Q.role(b)}`, dot: Q.biz(b)?.accent, disabled: true })),
    me.super ? { label: 'Super admin', icon: 'shield', disabled: true } : null,
    '-',
    { label: dark ? 'Light mode' : 'Dark mode', icon: 'moon', onClick: () => Act.setTheme(dark ? 'light' : 'dark') },
    { label: 'Back to admin', icon: 'left', onClick: () => navigate('/admin') },
  ]

  return (
    <header className="top">
      <Btn kind="ghost" className="hamb" icon="menu" onClick={() => UI.side(!ui.side)} aria-label="Menu" aria-expanded={ui.side} />
      <button type="button" className="search" onClick={() => UI.palette(true)} aria-label="Search">
        <Icon n="search" s={14} />
        <span>Search companies, contacts, deals…</span>
        <kbd>⌘K</kbd>
      </button>
      <span className="sp" />
      {sync.state === 'saving' && (
        <span className="faint xs hide-m row" role="status" style={{ gap: 5 }}>
          <Spinner s={12} /> Saving
        </span>
      )}
      <ClockBanner />
      <Menu align="right" trigger={<Btn kind="pri" icon="plus" disabled={!can} title={can ? 'Quick create' : 'Read-only access'}><span className="hide-m">New</span></Btn>} items={quick} />
      <Btn kind="ghost" icon="spark" onClick={() => UI.drawer('copilot', { ctx: ui.route })} title="AI Copilot" aria-label="AI Copilot" />
      <span style={{ position: 'relative' }}>
        <Btn kind="ghost" icon="bell" onClick={() => UI.nav('notifications')} aria-label={`Notifications, ${unread} unread`} />
        {unread > 0 && <span aria-hidden="true" style={{ position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderRadius: 4, background: 'var(--bad2)', border: '2px solid var(--surf)' }} />}
      </span>
      <Menu
        align="right"
        width={260}
        trigger={
          <button type="button" className="acct" aria-label="Account menu" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Av u={me} s={28} />
          </button>
        }
        items={account}
      />
    </header>
  )
}
