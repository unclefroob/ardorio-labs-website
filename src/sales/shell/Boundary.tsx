import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logSales } from '../log'
import { Btn } from '../kit'
import { UI } from '../ui/store'

interface Props {
  children: ReactNode
  /** Changing this clears a caught error, so navigating away recovers the shell. */
  resetKey?: string
  /** 'page' renders inside the shell; 'root' is the last resort around everything. */
  level: 'page' | 'root'
}
interface State { err: Error | null; key?: string }

export class Boundary extends Component<Props, State> {
  state: State = { err: null, key: this.props.resetKey }

  static getDerivedStateFromError(err: Error): Partial<State> {
    return { err }
  }

  static getDerivedStateFromProps(p: Props, s: State): Partial<State> | null {
    return p.resetKey !== s.key ? { err: null, key: p.resetKey } : null
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    logSales('render', { message: err.message, stack: info.componentStack })
  }

  render(): ReactNode {
    const { err } = this.state
    if (!err) return this.props.children
    return (
      <div className="page" role="alert">
        <h1 style={{ fontSize: 18, margin: '0 0 6px' }}>Something went wrong on this page</h1>
        <p className="muted">{err.message || 'An unexpected error occurred.'}</p>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <Btn
            onClick={() => {
              this.setState({ err: null })
              if (this.props.level === 'page') UI.nav('dashboard')
              else window.location.reload()
            }}
          >
            {this.props.level === 'page' ? 'Back to dashboard' : 'Reload'}
          </Btn>
        </div>
      </div>
    )
  }
}
