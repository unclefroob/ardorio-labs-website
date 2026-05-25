import type { ClientProject } from '../../types/dashboard'

interface Props {
  client: ClientProject
}

export default function ClientHeader({ client }: Props) {
  const total = client.tickets.length
  const done = client.tickets.filter(t => t.status === 'done').length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <>
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-7">
            <p className="label mb-4">Project Status</p>
            <h1 className="font-serif text-5xl sm:text-6xl text-ink leading-tight">
              {client.projectName}
            </h1>
          </div>
          <div className="lg:col-span-5 space-y-4">
            <p className="text-stone-600 leading-relaxed">{client.description}</p>
            <div>
              <div className="h-1 bg-cream-300 rounded-full overflow-hidden">
                <div
                  className="h-full bg-ink rounded-full transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="label mt-2">{done} of {total} done</p>
            </div>
            <p className="font-mono text-xs text-stone-400">Updated {client.lastUpdated}</p>
          </div>
        </div>
      </div>
      <div className="divider" />
    </>
  )
}
