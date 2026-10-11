import { Card } from '../../kit'
import type { ActivityItem } from '../../shared/invoices'
import { formatCents } from '../../shared/money'

export function Totals({ subtotal, gst, total, gstPct, note, struck }: { subtotal: number; gst: number; total: number; gstPct: number; note?: string; struck?: boolean }) {
  const m = 'money' + (struck ? ' strike' : '')
  return (
    <Card title="Totals" right={<span className="faint sm">AUD</span>}>
      <div className="tot"><span className="muted">Subtotal (ex GST)</span><span className={m}>{formatCents(subtotal)}</span></div>
      <div className="tot"><span className="muted">GST ({gstPct}%)</span><span className={m}>{formatCents(gst)}</span></div>
      <div className="tot big"><span>Total</span><span className={m}>{formatCents(total)}</span></div>
      {note && <div className="sm muted" style={{ marginTop: 8 }}>{note}</div>}
    </Card>
  )
}

export function Activity({ items }: { items: ActivityItem[] }) {
  return (
    <Card title="Activity">
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(i => (
          <li key={i.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', marginTop: 5, flex: 'none', background: i.tone === 'bad' ? 'var(--bad2)' : i.tone === 'warn' ? 'var(--warn)' : i.done ? 'var(--acc)' : 'var(--line2)' }} />
            <div>
              <div className={'b sm' + (i.done ? '' : ' faint')}>{i.label}</div>
              <div className="faint sm">{[i.when, i.note].filter(Boolean).join(' · ')}</div>
              {i.lines?.map(l => <div key={l} className="sm">{l}</div>)}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
