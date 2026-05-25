import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { ClientProject } from '../types/dashboard'
import ClientHeader from '../components/dashboard/ClientHeader'
import StatusBoard from '../components/dashboard/StatusBoard'

const API = import.meta.env.VITE_API_URL

export default function ClientDashboard() {
  const { slug } = useParams<{ slug: string }>()
  const [client, setClient] = useState<ClientProject | null>(null)
  const [status, setStatus] = useState<'loading' | 'not-found' | 'error' | 'ok'>('loading')

  useEffect(() => {
    if (!slug) { setStatus('not-found'); return }

    setStatus('loading')
    fetch(`${API}/clients/${slug}`)
      .then(res => {
        if (res.status === 404) { setStatus('not-found'); return null }
        if (!res.ok) throw new Error(`API error ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (data) { setClient(data); setStatus('ok') }
      })
      .catch(() => setStatus('error'))
  }, [slug])

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <p className="font-mono text-xs text-stone-400 animate-pulse">Loading...</p>
      </div>
    )
  }

  if (status === 'not-found') {
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

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
        <p className="label mb-4">Error</p>
        <h1 className="font-serif text-3xl text-ink mb-3">Something went wrong.</h1>
        <p className="text-stone-600 text-sm max-w-sm">
          We couldn't load this project right now. Please try again in a moment.
        </p>
      </div>
    )
  }

  return (
    <div className="pt-14">
      <div className="divider" />
      <ClientHeader client={client!} />
      <StatusBoard tickets={client!.tickets} milestones={client!.milestones} />
    </div>
  )
}
