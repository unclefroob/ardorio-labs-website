import { xeroStatus } from '../../api/xero'
import { useLoad } from '../../data/invoicing'
import { Chip } from '../../kit'
import { chipFor } from '../../shared/xero'
import { UI } from '../../ui/store'

/** The Xero state in the Invoices header; press it to open the Xero settings. */
export function XeroChip() {
  const q = useLoad(s => xeroStatus(s), 'xero-chip')
  // A failed read says nothing rather than something wrong.
  if (q.error) return null
  const v = chipFor(q.data)
  return (
    <button type="button" onClick={() => UI.nav('settings', { q: { tab: 'invoicing' } })} aria-label={`${v.label}. Open Xero settings`} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
      <Chip icon="plug" tone={v.tone} title={v.title}>{v.label}</Chip>
    </button>
  )
}
