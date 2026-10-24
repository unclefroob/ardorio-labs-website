import { SalesHttpError } from '../../api/http'
import { rosterioInvoices } from '../../api/rosterio'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { useStore, S } from '../../data/store'
import { useLoad } from '../../data/invoicing'
import { accountSnapshot, planLabel, rosterioLinkOf, useRosterioAccounts } from '../../data/rosterio'
import { detailStanding, standingText, useRosterioAccountDetail } from '../../data/rosterioAccount'
import { useRosterioBilling } from '../../data/rosterioBilling'
import { Banner, Btn, Chip, Empty, Link, Skel, Tabs } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { Denied } from '../../shell/states'
import { UI, type Route } from '../../ui/store'
import { AccountBilling } from './AccountBilling'
import { AccountOverview, type AccountTab } from './AccountOverview'
import { ActivityPanel, InvoicesPanel, PeoplePanel } from './AccountPanels'

const TABS: readonly AccountTab[] = ['overview', 'billing', 'invoices', 'people', 'activity']
const isTab = (v: unknown): v is AccountTab => TABS.includes(v as AccountTab)
const TONE = { paid: 'ok', trial: 'warn', trialEnded: 'bad', inactive: 'bad' } as const

/**
 * One Rosterio account: its details and its Stripe billing, read live from Rosterio. Reached from the company page and from
 * Customers › Rosterio. Rosterio admins only, as the billing and prices on it are.
 */
export function RosterioAccount({ route }: { route: Route }) {
  const id = route.id
  if (!Q.canAdmin('ros')) {
    return <Denied title="Rosterio accounts are for Rosterio admins" body="You can see customers and deals, but a Rosterio account's details and billing are limited to admins of Rosterio. Ask an admin if you need access." />
  }
  // A Rosterio account id is 24 hex characters; anything else cannot be an account, so nothing is asked of Rosterio.
  if (!id || !/^[0-9a-f]{24}$/i.test(id)) {
    return (
      <div className="page">
        <Empty icon="search" title="Account not found" body="That is not a Rosterio account. Open one from Customers or from its company." action={<Btn onClick={() => UI.nav('customers', { q: { product: 'ros' } })}>Back to Customers</Btn>} />
      </div>
    )
  }
  return <Account id={id} route={route} />
}

function Account({ id, route }: { id: string; route: Route }) {
  useStore()
  // The address holds the tab, so Back and Forward move between tabs and a different account opens on its own.
  const tab: AccountTab = isTab(route.q?.tab) ? route.q.tab : 'overview'
  const detail = useRosterioAccountDetail(id)
  const billing = useRosterioBilling({ accountId: id })
  const invoices = useLoad(sig => rosterioInvoices({ accountId: id }, sig), `ros-inv-acct:${id}`)
  const d = detail.data
  // The link window reads the accounts list, so load it when there is something to link.
  const accounts = useRosterioAccounts(d && !d.company ? 'ifStale' : 'never')

  const fromCompany = route.q?.from === 'company' && typeof route.q.companyId === 'string' ? route.q.companyId : undefined
  const choose = (t: string): void => {
    if (!isTab(t)) return
    UI.replace('rosterioAccount', { id, q: { ...route.q, tab: t } })
  }

  if (!d) {
    return (
      <div className="page">
        <PageHead title="Rosterio account" crumb={[<Link key="c" to="customers" q={{ product: 'ros' }}>Customers</Link>]} />
        {detail.error
          ? <Banner tone="bad" action={<Btn size="sm" kind="pri" onClick={detail.reload}>Try again</Btn>}>{detail.error instanceof SalesHttpError ? detail.error.message : 'Could not read this account from Rosterio. Try again.'}</Banner>
          : <Skel rows={8} label="Reading the account from Rosterio" />}
      </div>
    )
  }

  // A link made in this browser shows at once; the company the server reported wins otherwise.
  const company = d.company ?? S.companies.filter(c => !c.archived).map(c => ({ c, l: rosterioLinkOf(c) })).filter(x => x.l?.accountId === d.accountId).map(x => ({ id: x.c.id, name: x.c.name }))[0] ?? null
  const crumb = fromCompany
    ? [
        <Link key="a" to="companies">Companies</Link>,
        <Link key="b" to="company" id={fromCompany}>{Q.company(fromCompany)?.name ?? company?.name ?? 'Company'}</Link>,
        <span key="c">Rosterio account</span>,
      ]
    : [
        <Link key="a" to="customers" q={{ product: 'ros' }}>Customers</Link>,
        <Link key="b" to="customers" q={{ product: 'ros' }}>Rosterio</Link>,
        <span key="c">{d.name}</span>,
      ]
  const st = detailStanding(d)
  const managed = d.pricing?.managedContract ?? !!d.terms
  const list = invoices.data?.invoices
  const linkCompany = (): void => UI.open('linkRosterio', { accountId: d.accountId })
  // The link window reads this account from the loaded list, so it opens only once the account is in it.
  const linkWhy = !Q.canEdit('ros')
    ? 'You need edit access to Rosterio'
    : accountSnapshot(d.accountId) ? undefined
    : accounts.s === 'error' ? 'The Rosterio account list could not be read. Refresh and try again.'
    : accounts.s === 'ok' ? 'This account is not in the latest list from Rosterio (it lists the newest accounts only)'
    : 'Reading the Rosterio account list…'
  const changed = (): void => { detail.reload(); invoices.reload() }

  return (
    <div className="page">
      <PageHead
        crumb={crumb}
        eyebrow="Rosterio account"
        title={d.name}
        sub={
          <div className="col" style={{ gap: 6 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              <Chip tone={TONE[st.kind]}>{standingText(st)}</Chip>
              {d.plan && <Chip tone="acc">{planLabel(d.plan)}</Chip>}
              <Chip>{managed ? 'Managed contract' : 'Self-serve'}</Chip>
            </div>
            <div>{d.memberCount} of {d.maxUsers ?? 'unlimited'} users{d.createdAt ? ` · customer since ${F.date(d.createdAt)}` : ''}</div>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="faint">CRM company</span>
              {company
                ? <Link to="company" id={company.id}>{company.name}</Link>
                : <><span>Not linked to a company</span><Btn size="xs" icon="link" disabled={!!linkWhy} title={linkWhy} onClick={linkCompany}>Link company…</Btn></>}
            </div>
          </div>
        }
      >
        <span className="faint sm" title={F.dt(d.fetchedAt)}>Read from Rosterio {F.rel(d.fetchedAt)}</span>
        <Btn icon="refresh" disabled={detail.loading} onClick={() => { detail.reload(); billing.reload(); invoices.reload() }}>Refresh</Btn>
        {d.adminUrl && <a className="btn" href={d.adminUrl} target="_blank" rel="noopener noreferrer">Open in Admin</a>}
      </PageHead>

      <Tabs
        value={tab}
        onChange={choose}
        tabs={[['overview', 'Overview'], ['billing', 'Billing'], ['invoices', 'Invoices', list ? list.length : null], ['people', 'People', d.people.active], ['activity', 'Activity']]}
      />

      {tab === 'overview' && <AccountOverview d={d} go={choose} />}
      {tab === 'billing' && <AccountBilling accountId={d.accountId} companyId={company?.id} name={d.name} billing={billing} invoices={list} onChanged={changed} />}
      {tab === 'invoices' && (
        invoices.error
          ? <Banner tone="bad" action={<Btn size="sm" kind="pri" onClick={invoices.reload}>Try again</Btn>}>{invoices.error instanceof SalesHttpError ? invoices.error.message : 'Could not load Rosterio invoices. Try again.'}</Banner>
          : !invoices.data ? <Skel rows={5} table label="Loading invoices" /> : <InvoicesPanel data={invoices.data} />
      )}
      {tab === 'people' && <PeoplePanel d={d} />}
      {tab === 'activity' && <ActivityPanel d={d} billing={billing.data} />}
    </div>
  )
}
