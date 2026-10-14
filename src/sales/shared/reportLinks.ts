import { Act } from '../data/Act'
import { Q } from '../data/Q'
import { UI } from '../ui/store'

/**
 * Deep links into the Ardorio revenue report (Reports, tab 'ardorio'). The tab only exists when Ardorio is in the
 * current workspace, so a link from a page that is not scoped by workspace (Customers lists every product you belong
 * to) would land on the Overview. The link switches the workspace to Ardorio first, and says so.
 */

/** The viewer may see Ardorio money, but the current workspace hides Ardorio. */
export const ardorioOutOfScope = (): boolean => Q.canBill() && Q.member('ard') && !Q.inScope('ard')

/** Bring Ardorio into view (switching the workspace to Ardorio) when it is hidden. True when it switched. */
export function showArdorio(): boolean {
  if (!ardorioOutOfScope()) return false
  Act.setSession({ ws: 'ard' })
  UI.toast(`Switched to ${Q.biz('ard')?.name ?? 'Ardorio'} to show its revenue report`)
  return true
}

/** Open the Ardorio revenue report (or its forecast view), whatever the current workspace. */
export function openArdorioReport(view: 'report' | 'forecast' = 'report'): void {
  if (!Q.canBill()) return
  showArdorio()
  UI.nav('reports', { q: view === 'forecast' ? { tab: 'ardorio', view } : { tab: 'ardorio' } })
}
