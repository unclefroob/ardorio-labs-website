import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Banner, Btn, Empty, Skel } from '../kit'
import { loadBootstrap } from '../data/bootstrap'
import { UI } from '../ui/store'

export function BackToAdmin({ kind }: { kind?: string }) {
  return (
    <RouterLink to="/admin" className={`btn ${kind ?? ''}`}>
      Back to admin
    </RouterLink>
  )
}

export function LoadingShell() {
  return (
    <div className="app" aria-busy="true" aria-label="Loading SalesOS">
      <div className="side" />
      <div className="mainwrap">
        <div className="top" />
        <div className="main">
          <div className="page">
            <Skel rows={5} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 24 }}>{children}</div>
}

export function NoAccess({ message }: { message: string }) {
  return (
    <Centered>
      <Empty icon="lock" title="No access to SalesOS" body={message} action={<BackToAdmin />} />
    </Centered>
  )
}

export function LoadFailed({ message }: { message: string }) {
  return (
    <Centered>
      <Empty
        icon="alert"
        title="Couldn't load SalesOS"
        body={message}
        action={
          <div className="row" style={{ gap: 8 }}>
            <Btn kind="pri" onClick={() => void loadBootstrap()}>Try again</Btn>
            <BackToAdmin />
          </div>
        }
      />
    </Centered>
  )
}

export function Denied({ what }: { what?: string }) {
  return (
    <div className="page">
      <Empty
        icon="lock"
        title="You don't have access"
        body={`${what ?? 'This page'} requires administrator access for at least one business. Ask an administrator if you need it.`}
        action={<Btn onClick={() => UI.nav('dashboard')}>Back to dashboard</Btn>}
      />
    </div>
  )
}

export function NotFound() {
  return (
    <div className="page">
      <Empty icon="search" title="Page not found" body="This SalesOS page doesn't exist." action={<Btn onClick={() => UI.nav('dashboard')}>Back to dashboard</Btn>} />
    </div>
  )
}

export function PageBanner({ children }: { children: ReactNode }) {
  return <div className="page"><Banner tone="bad">{children}</Banner></div>
}
