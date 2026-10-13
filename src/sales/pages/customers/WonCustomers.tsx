import type { BusinessId } from '../../api/contract'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import { Banner, Btn, Card, CoLink, DataTable, Empty, type Col } from '../../kit'
import { wonCustomers, wonThisQuarter, type WonCustomer } from '../../shared/customers'
import { UI } from '../../ui/store'

/** Customers of a product with no account feed: the companies that have a won deal in it. */
export function WonCustomers({ business }: { business: BusinessId }) {
  useStore()
  const name = Q.biz(business)?.name ?? business
  const deals = S.deals.filter(d => d.archived !== true)
  const rows = wonCustomers(deals, S.companies, business)
  const total = rows.reduce((n, r) => n + r.value, 0)
  const quarter = wonThisQuarter(deals, S.companies, business)

  if (!rows.length) {
    return (
      <Card pad={false}>
        <Empty icon="dollar" title="No won deals yet" body={`${name} customers are companies with a won deal. Win a deal and its company appears here.`} action={<Btn size="sm" onClick={() => UI.nav('deals')}>Go to Deals</Btn>} />
      </Card>
    )
  }

  const cols: Col<WonCustomer>[] = [
    { k: 'company', l: 'Company', sort: r => r.company.name.toLowerCase(), r: r => <b><CoLink id={r.company.id} /></b> },
    { k: 'deal', l: 'Won deal', sort: r => r.deal.title || r.deal.name, r: r => <span>{r.deal.title || r.deal.name}{r.deals > 1 && <span className="faint sm"> +{r.deals - 1} more</span>}</span> },
    { k: 'value', l: 'Won value', right: true, sort: r => r.value, r: r => <span className="num">{F.money(r.value)}</span> },
    { k: 'wonOn', l: 'Won on', sort: r => r.wonOn, desc: true, r: r => F.date(r.wonOn) },
    { k: 'owner', l: 'Owner', sort: r => Q.user(r.deal.ownerId)?.name ?? '', r: r => Q.user(r.deal.ownerId)?.name ?? '—' },
  ]

  return (
    <>
      <div className="grid g3" style={{ marginBottom: 14 }}>
        <div className="kpi" style={{ cursor: 'default' }}><span className="l">Customers (companies with a won deal)</span><span className="v">{rows.length}</span></div>
        <div className="kpi" style={{ cursor: 'default' }}><span className="l">Won value</span><span className="v">{F.money(total)}</span><span className="s">Deal value, not recurring revenue</span></div>
        <div className="kpi" style={{ cursor: 'default' }}><span className="l">Won this quarter</span><span className="v">{quarter}</span></div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <Banner tone="info">{name} customers come from won deals in the CRM. There is no {name} account feed yet, so plan and status aren&apos;t shown.</Banner>
      </div>
      <Card pad={false}><DataTable cols={cols} rows={rows} page={50} /></Card>
    </>
  )
}
