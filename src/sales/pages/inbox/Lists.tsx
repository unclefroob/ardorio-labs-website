import { PageHead } from '../../shared/PageHead'
import type { Route } from '../../ui/store'
import { ListsInner } from './parts/ListsInner'

export function Lists({ route }: { route: Route }) {
  return (
    <div className="page">
      <PageHead title="Lead lists" sub="Static and dynamic prospect lists" />
      <ListsInner id={route.id} />
    </div>
  )
}
