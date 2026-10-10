import { useState } from 'react'
import { Tabs } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import type { Route } from '../../ui/store'
import { Importer } from './parts/Importer'
import { ListsInner } from './parts/ListsInner'
import { Research } from './parts/Research'
import { WizaPanel } from './parts/WizaPanel'

const TABS = [['research', 'Company research'], ['import', 'Import leads (CSV)'], ['wiza', 'Enrich contacts'], ['lists', 'Prospect lists']] as const
const isTab = (v: unknown): v is (typeof TABS)[number][0] => TABS.some(t => t[0] === v)

export function Prospecting({ route }: { route: Route }) {
  const [tab, setTab] = useState<string>(isTab(route.q?.tab) ? route.q.tab : 'research')
  return (
    <div className="page">
      <PageHead title="Find & enrich contacts" sub="Research companies, find people, import leads and enrich contacts. Records land in the shared CRM database." />
      <Tabs value={tab} onChange={setTab} tabs={TABS} />
      {tab === 'research' && <Research />}
      {tab === 'import' && <Importer />}
      {tab === 'wiza' && <WizaPanel onImport={() => setTab('import')} />}
      {tab === 'lists' && <ListsInner />}
    </div>
  )
}
