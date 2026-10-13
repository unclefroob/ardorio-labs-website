import { useState } from 'react'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import { accountTab, defaultProduct, isRosterioTab, wonCustomers, type RosterioTab } from '../../shared/customers'
import { useRosterioAccounts } from '../../data/rosterio'
import { Empty, Seg } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { UI, type Route } from '../../ui/store'
import { RosterioCustomers } from '../rosterio/RosterioCustomers'
import { ArdorioCustomers } from './ArdorioCustomers'
import { WonCustomers } from './WonCustomers'

export function Customers({ route }: { route: Route }) {
  useStore()
  const mine = Q.myBiz()
  // Never fetches: it only reads the last list the Rosterio view loaded, to put a count on the toggle.
  const live = useRosterioAccounts('never').lastGood
  const [picked, setPicked] = useState(() => defaultProduct(mine, route.q?.product, Q.wsBiz()))
  const [tab, setTab] = useState<RosterioTab>(isRosterioTab(route.q?.tab) ? route.q.tab : 'paid')
  const product = picked && mine.includes(picked) ? picked : defaultProduct(mine, undefined, Q.wsBiz())

  const choose = (b: string): void => {
    const next = mine.find(x => x === b)
    if (!next) return
    setPicked(next)
    UI.setRoute({ q: { product: next, tab } })
  }
  const chooseTab = (t: RosterioTab): void => {
    setTab(t)
    UI.setRoute({ q: { product: product ?? '', tab: t } })
  }

  const count = (b: string): number | undefined => {
    if (b === 'ros') return live ? live.accounts.filter(a => accountTab(a) === 'paid').length : undefined
    return wonCustomers(S.deals.filter(d => d.archived !== true), S.companies, b as 'ard').length
  }

  if (!product) {
    return (
      <div className="page">
        <PageHead title="Customers" />
        <Empty icon="building" title="You aren't a member of any business" body="Ask an administrator to add you to a business to see its customers." />
      </div>
    )
  }

  const sub = product === 'ros'
    ? 'Who is paying us, by product. Rosterio accounts are read live from Rosterio. Nothing is copied into SalesOS.'
    : product === 'ard' && Q.canBill()
      ? 'Who is paying us, by product. Ardorio revenue comes from your invoices, ex GST.'
      : 'Who is paying us, by product. Customers are companies with a won deal in this product.'

  return (
    <div className="page">
      <PageHead title="Customers" sub={sub} />
      <div className="row wrap" style={{ marginBottom: 16, gap: 12 }}>
        <Seg value={product} onChange={choose} opts={mine.map(b => [b, `${Q.biz(b)?.name ?? b}${count(b) === undefined ? '' : ` ${count(b)}`}`] as const)} />
        <span className="faint sm">Counts are paying customers. You only see products you belong to.</span>
      </div>
      {product === 'ros' ? <RosterioCustomers tab={tab} onTab={chooseTab} /> : product === 'ard' && Q.canBill() ? <ArdorioCustomers /> : <WonCustomers business={product} />}
    </div>
  )
}
