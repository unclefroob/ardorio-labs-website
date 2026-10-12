import { useRef, useState } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { getInvoice, invoiceError, unmarkTest } from '../../api/invoices'
import { Q } from '../../data/Q'
import { Banner, Btn } from '../../kit'
import { fmtDay, testMenu } from '../../shared/invoices'
import { UI } from '../../ui/store'
import type { MoreItem } from './MoreMenu'
import { personName } from './parts'

/**
 * Mark, unmark and delete for the invoice in view. `onChange` receives the updated invoice. Unmarking is one click (it is
 * reversible and harmless) and is protected against a double submit.
 */
export type TestOps = { markTest?: () => void; unmarkTest?: () => void; deleteTest?: () => void; isSuper?: boolean }

/** The test-related More menu items. Marking works in any status; deleting is for a super user, on a test invoice only. */
export function testItems(inv: Pick<InvoiceDto, 'test'>, o: TestOps, hasPrior: boolean): MoreItem[] {
  const t = testMenu(inv, !!o.isSuper)
  const items: MoreItem[] = []
  if (t.mark && o.markTest) items.push({ key: 'mark-test', label: 'Mark as test invoice…', icon: 'flag', divider: hasPrior, onSelect: o.markTest })
  if (t.unmark && o.unmarkTest) items.push({ key: 'unmark-test', label: 'Unmark as test', icon: 'refresh', divider: hasPrior, onSelect: o.unmarkTest })
  if (t.deletePermanently && o.deleteTest) items.push({ key: 'delete-test', label: 'Delete permanently…', icon: 'trash', danger: true, divider: true, onSelect: o.deleteTest })
  return items
}

export function useTestActions(inv: InvoiceDto | null, onChange: (i: InvoiceDto) => void) {
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const refresh = async (): Promise<void> => {
    if (!inv) return
    try {
      onChange(await getInvoice(inv.id))
    } catch (e) {
      UI.toast(invoiceError(e, 'load').message, 'bad')
    }
  }
  const unmark = async (): Promise<void> => {
    if (lock.current || !inv) return
    lock.current = true
    setBusy(true)
    try {
      onChange(await unmarkTest(inv.id))
      UI.toast(`${inv?.invoiceNumber ?? 'Invoice'} is a real invoice again`)
    } catch (e) {
      const r = invoiceError(e, 'test')
      UI.toast(r.message, 'bad')
      if (r.kind === 'not-test' || r.kind === 'conflict') void refresh()
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return {
    busy,
    isSuper: Q.isSuper(),
    markTest: () => { if (inv) UI.open('markTest', { invoice: inv, onDone: onChange, onRefresh: refresh }) },
    unmarkTest: () => void unmark(),
    deleteTest: () => { if (inv) UI.open('deleteTestInvoice', { invoice: inv, onRefresh: refresh }) },
  }
}

/** Shown on a test invoice: says what it means and who marked it, with the way back. */
export function TestBanner({ inv, onUnmark, busy }: { inv: InvoiceDto; onUnmark: () => void; busy: boolean }) {
  const t = inv.test
  if (!t) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <Banner icon="flag" action={<Btn size="sm" onClick={onUnmark} disabled={busy}>{busy ? 'Unmarking…' : 'Unmark as test'}</Btn>}>
        <b>Test invoice, excluded from totals and exports.</b>
        <div className="sm" style={{ marginTop: 2 }}>Marked by {personName(t.markedBy)} on {fmtDay(t.markedAt)}: {t.reason}</div>
      </Banner>
    </div>
  )
}
