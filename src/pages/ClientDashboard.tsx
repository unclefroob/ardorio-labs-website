import { useParams } from 'react-router-dom'
import { clients } from '../data/clients'
import ClientHeader from '../components/dashboard/ClientHeader'
import StatusBoard from '../components/dashboard/StatusBoard'

export default function ClientDashboard() {
  const { slug } = useParams<{ slug: string }>()
  const client = slug ? clients[slug] : undefined

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
        <p className="label mb-4">404</p>
        <h1 className="font-serif text-4xl text-ink mb-3">We can't find that project.</h1>
        <p className="text-stone-600 text-sm max-w-sm">
          If you're a client, check your URL or contact your Ardorio project lead.
        </p>
        <a href="https://ardorio.co" className="btn-ghost mt-8">
          Back to ardorio.co
        </a>
      </div>
    )
  }

  return (
    <div className="pt-14">
      <div className="divider" />
      <ClientHeader client={client} />
      <StatusBoard tickets={client.tickets} milestones={client.milestones} />
    </div>
  )
}
