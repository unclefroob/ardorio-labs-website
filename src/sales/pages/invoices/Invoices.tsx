import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { invoiceError, invoiceSummary, invoicesCsv, listInvoices, saveBlob } from '../../api/invoices'
import { F } from '../../data/F'
import { dealName, useLoad } from '../../data/invoicing'
import { useStore } from '../../data/store'
import { Q } from '../../data/Q'
import { RosterioInvoices } from './RosterioInvoices'
import { Banner, Btn, Card, Chip, DataTable, DlLink, Empty, Icon, Menu, SearchInp, Sel, Skel, Tabs, type Col } from '../../kit'
import { filterInvoices, dueCell, fmtDay, issuedText, needsRefund, TABS, tabCounts, tileFacts, voidReasonLabel, type InvoiceTab } from '../../shared/invoices'
import { invoiceRef } from '../../shared/externalInvoices'
import { formatCents, formatCentsTile } from '../../shared/money'
import { PageHead } from '../../shared/PageHead'
import { UI } from '../../ui/store'
import { copyLink, downloadPdf } from './actions'
import { CustomerLink, ExternalChip, MethodChip, RetainerChip, TermChip, StatusChip, TestChip, milestoneLabel } from './parts'
import { InvoicesDenied } from './states'

const SHOW_TEST_KEY = 'sos.invoices.showTest'
// Remembered for this browser session only; storage can be blocked, so every access is guarded.
const readShowTest = (): boolean => { try { return sessionStorage.getItem(SHOW_TEST_KEY) === '1' } catch { return false } }
const writeShowTest = (v: boolean): void => { try { if (v) sessionStorage.setItem(SHOW_TEST_KEY, '1'); else sessionStorage.removeItem(SHOW_TEST_KEY) } catch { /* not remembered */ } }

/**
 * Invoices for the businesses in the workspace you are an admin of: Ardorio's (issued from SalesOS), Rosterio's (its subscriptions,
 * from Stripe), or both on tabs in All businesses.
 */
export function Invoices() {
  useStore()
  const ard = Q.canAdmin('ard') && Q.inScope('ard')
  const ros = Q.canAdmin('ros') && Q.inScope('ros')
  const [tab, setTab] = useState<'ard' | 'ros'>(ard ? 'ard' : 'ros')
  const tabs = ard && ros ? <Tabs tabs={[['ard', Q.biz('ard')?.name ?? 'Ardorio'], ['ros', `${Q.biz('ros')?.name ?? 'Rosterio'} (Stripe)`]]} value={tab} onChange={k => setTab(k === 'ros' ? 'ros' : 'ard')} /> : null
  if (ros && (!ard || tab === 'ros')) return <RosterioInvoices tabs={tabs} />
  return <ArdorioInvoices tabs={tabs} />
}

function ArdorioInvoices({ tabs }: { tabs: ReactNode }) {
  useStore()
  const [showTest, setShowTest] = useState(readShowTest)
  useEffect(() => writeShowTest(showTest), [showTest])
  const list = useLoad(s => listInvoices({ includeTest: showTest }, s), `list:${showTest ? 'test' : 'real'}`)
  const sum = useLoad(s => invoiceSummary(s), 'summary')
  const [tab, setTab] = useState<InvoiceTab>('all')
  const [query, setQuery] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [exporting, setExporting] = useState(false)
  const [refundOnly, setRefundOnly] = useState(false)
  const today = F.today()

  const all: InvoiceDto[] = useMemo(() => list.data?.invoices ?? [], [list.data])
  const counts = tabCounts(all)
  const rows = useMemo(() => filterInvoices(all, { tab, query, companyId, refundOnly, includeTest: showTest }, dealName), [all, tab, query, companyId, refundOnly, showTest])
  const testCount = all.filter(i => i.test).length
  const facts = list.data && sum.data ? tileFacts(all, sum.data.tiles, today) : null
  const customers = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of all) if (i.companyId) m.set(i.companyId, i.clientName)
    return [...m].sort((a, b) => a[1].localeCompare(b[1]))
  }, [all])

  const err = list.error ? invoiceError(list.error, 'load') : null
  if (err?.kind === 'denied') return <InvoicesDenied />

  const exportCsv = async (): Promise<void> => {
    setExporting(true)
    try {
      saveBlob(await invoicesCsv(), 'ardorio-invoices.csv')
    } catch (e) {
      UI.toast(invoiceError(e, 'download').message, 'bad')
    } finally {
      setExporting(false)
    }
  }
  const markPaid = (inv: InvoiceDto): void => UI.open('markPaid', { invoice: inv, onDone: () => { list.reload(); sum.reload() } })
  const open = (inv: InvoiceDto): void => UI.nav('invoice', { id: inv.id })
  const recordExternal = (): void => UI.open('recordExternal', { onDone: () => { list.reload(); sum.reload() } })

  const cols: Col<InvoiceDto>[] = [
    // An external record shows its reference, never the hidden number the server keeps for it.
    { k: 'invoiceNumber', l: 'Invoice', sort: r => invoiceRef(r), desc: true, r: r => <b className={'mono' + (r.status === 'void' ? ' void-cell' : '')}>{invoiceRef(r)}</b> },
    { k: 'clientName', l: 'Customer', sort: r => r.clientName.toLowerCase(), r: r => (r.status === 'void' ? <span className="void-cell"><CustomerLink inv={r} /></span> : <CustomerLink inv={r} />) },
    {
      k: 'deal', l: 'Deal', sort: r => dealName(r.dealId),
      r: r => (r.dealId
        ? <div><DlLink id={r.dealId} />{milestoneLabel(r) && <div className="faint sm">{milestoneLabel(r)}</div>}</div>
        : <span className="faint">No deal</span>),
    },
    { k: 'issueDate', l: 'Issued', sort: r => (r.status === 'draft' ? '' : r.issueDate), r: r => (r.status === 'draft' ? <span className="faint">{issuedText(r)}</span> : fmtDay(r.issueDate)) },
    {
      k: 'dueDate', l: 'Due', sort: r => r.dueDate,
      r: r => {
        const d = dueCell(r, today)
        if (r.status === 'void') return <span className="void-cell">{d.text}</span>
        return r.status === 'draft' ? <span className="faint">{d.text}</span> : <div className={d.late ? 'late' : ''}>{d.text}{d.sub && <div className="sm">{d.sub}</div>}</div>
      },
    },
    {
      k: 'totalCents', l: 'Amount', right: true, sort: r => r.totalCents,
      r: r => <div className={'money' + (r.status === 'void' ? ' strike' : '')}><div className="b">{formatCents(r.totalCents)}</div><div className="faint sm">{formatCents(r.subtotalCents)} ex GST</div></div>,
    },
    {
      k: 'status', l: 'Status', sort: r => (r.overdue ? 'overdue' : r.status),
      r: r => (
        <div>
          <span className="row wrap" style={{ gap: 4 }}><StatusChip inv={r} /><TestChip inv={r} /><RetainerChip inv={r} /><TermChip inv={r} /><ExternalChip inv={r} /><MethodChip inv={r} />{needsRefund(r) && <Chip tone="bad" icon="alert">Needs refund</Chip>}</span>
          {r.voided && <div className="void-cell sm" style={{ marginTop: 2 }}>{voidReasonLabel(r.voided.reason)} · {fmtDay(r.voided.voidedAt)}</div>}
          {r.payment && <div className="faint sm" style={{ marginTop: 2 }}>{fmtDay(r.payment.paidAt)}</div>}
        </div>
      ),
    },
    {
      k: 'a', l: '', nosort: true,
      r: r => (
        <span className="row" style={{ gap: 4 }} onClick={e => e.stopPropagation()}>
          {r.status === 'draft' && <Btn size="xs" onClick={() => open(r)}>Edit</Btn>}
          {r.status === 'sent' && r.source !== 'external' && <Btn size="xs" onClick={() => markPaid(r)}>Mark paid</Btn>}
          <Menu
            align="right"
            trigger={<Btn size="xs" kind="ghost" aria-label={`More actions for ${invoiceRef(r)}`}>⋯</Btn>}
            items={[
              { label: 'Open', icon: 'ext', onClick: () => open(r) },
              // An external record has no PDF and no hosted page.
              r.source !== 'external' && { label: r.status === 'draft' ? 'Preview PDF' : 'Download PDF', icon: 'download', onClick: () => void downloadPdf(r) },
              r.source !== 'external' && r.status !== 'draft' && r.status !== 'void' && { label: 'Copy invoice link', icon: 'copy', onClick: () => void copyLink(r) },
            ]}
          />
        </span>
      ),
    },
  ]

  return (
    <div className="page">
      <PageHead title="Invoices" sub="Create, issue and track invoices for your customers. Amounts are shown ex-GST unless marked.">
        <Chip icon="plug" title="Reserved for the next phase">Xero: not connected</Chip>
        <Btn icon="download" onClick={() => void exportCsv()} disabled={exporting}>{exporting ? 'Exporting…' : 'Export CSV'}</Btn>
        <Btn icon="plus" onClick={recordExternal}>Record external invoice or payment</Btn>
        <Btn kind="pri" icon="plus" onClick={() => UI.nav('invoice', { id: 'new' })}>New invoice</Btn>
      </PageHead>
      {tabs}

      {err && <Card><Empty icon="alert" title="Couldn't load invoices" body={err.message} action={<Btn onClick={() => { list.reload(); sum.reload() }}>Try again</Btn>} /></Card>}

      {!err && (
        <>
          <div className="grid g4" style={{ marginBottom: 16 }}>
            <div className="kpi static"><span className="l">Outstanding{facts ? ` · ${facts.outstanding.count} invoice${facts.outstanding.count === 1 ? '' : 's'}` : ''}</span><span className="v num">{facts ? formatCentsTile(facts.outstanding.exCents) : '—'}</span><span className="s">{facts ? `${formatCentsTile(facts.outstanding.incCents)} inc GST` : ' '}</span></div>
            <div className="kpi static">
              <span className="l">Overdue</span>
              <span className="row"><span className="v num" style={facts && facts.overdue.exCents > 0 ? { color: 'var(--bad-ink)' } : undefined}>{facts ? formatCentsTile(facts.overdue.exCents) : '—'}</span>{facts && facts.overdue.count > 0 && <Chip tone="bad">{facts.overdue.count} overdue</Chip>}</span>
              <span className="s">{facts?.overdue.worst ? `${facts.overdue.worst.name}, ${facts.overdue.worst.days} day${facts.overdue.worst.days === 1 ? '' : 's'} late` : facts ? 'Nothing overdue' : ' '}</span>
            </div>
            <div className="kpi static"><span className="l">Paid this month</span><span className="v num">{facts ? formatCentsTile(facts.paidThisMonth.exCents) : '—'}</span><span className="s">{facts ? `${formatCentsTile(facts.paidThisMonth.incCents)} inc GST · ${facts.paidThisMonth.count} invoice${facts.paidThisMonth.count === 1 ? '' : 's'}` : ' '}</span></div>
            <div className="kpi static"><span className="l">In drafts{facts ? ` · ${facts.drafts.count} invoice${facts.drafts.count === 1 ? '' : 's'}` : ''}</span><span className="v num">{facts ? formatCentsTile(facts.drafts.exCents) : '—'}</span><span className="s">Not yet issued</span></div>
          </div>

          {sum.data && sum.data.tiles.needsRefundCount > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Banner tone="bad" icon="flag" action={<Btn size="sm" onClick={() => { setTab('all'); setRefundOnly(!refundOnly) }}>{refundOnly ? 'Show all' : 'Review'}</Btn>}>
                <b>{sum.data.tiles.needsRefundCount} payment{sum.data.tiles.needsRefundCount === 1 ? '' : 's'} on cancelled invoices need{sum.data.tiles.needsRefundCount === 1 ? 's' : ''} a refund</b> ({formatCents(sum.data.tiles.needsRefundCents)}).
              </Banner>
            </div>
          )}

          <Tabs
            value={tab}
            onChange={k => setTab(k as InvoiceTab)}
            tabs={TABS.map(([k, l]) => [k, l, counts[k]] as const)}
          />

          <div className="row wrap" style={{ marginBottom: 12, gap: 10 }}>
            <SearchInp value={query} onChange={setQuery} placeholder="Search number, customer or deal" w={260} />
            <Sel value={companyId} onChange={setCompanyId} placeholder="All customers" aria-label="Customer" style={{ width: 180 }} options={customers} />
            <label className="ck"><input type="checkbox" checked={showTest} onChange={e => setShowTest(e.target.checked)} /><span>Show test invoices{showTest && list.data ? ` (${testCount})` : ''}</span></label>
            <span className="sp" />
            <span className="faint sm">Newest first</span>
          </div>

          {list.loading && !list.data ? (
            <Card><Skel rows={8} table label="Loading invoices" /></Card>
          ) : all.length === 0 ? (
            <Card pad={false}>
              <Empty
                icon="file"
                title="No invoices yet"
                body="Create the first one from a won deal, or start a blank invoice for a customer. Won milestones appear on the deal as ready to invoice."
                action={<span className="row"><Btn kind="pri" onClick={() => UI.nav('invoice', { id: 'new' })}>New invoice</Btn><Btn onClick={() => UI.nav('deals')}>Go to Deals</Btn></span>}
              />
            </Card>
          ) : (
            <Card pad={false}>
              <DataTable<InvoiceDto> cols={cols} rows={rows} page={50} onRow={open} rowClass={r => (r.test ? 'test-row' : '')} sortInit={['invoiceNumber', -1]} empty={<Empty icon="search" title="No invoices match" body={tab === 'all' ? 'Nothing matches the current search.' : `No ${TABS.find(t => t[0] === tab)?.[1].toLowerCase()} invoices match the current search.`} />} />
            </Card>
          )}
          <div className="faint sm" style={{ marginTop: 10 }}>
            <Icon n="info" s={12} /> Overdue is worked out from the due date. It is not a separate status. Test invoices are never counted in the figures above. Invoices are visible to Ardorio admins only.
          </div>
        </>
      )}
    </div>
  )
}
