import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Logo from '../Logo'

/**
 * The admin masthead and section nav, shared by every /admin page.
 *
 * Replaces a row of pill buttons that sat beside the page heading on the index
 * only. That pattern grew an item every time a page was added, competed with
 * the h1 for attention, wrapped once it hit eight, and left every other admin
 * page with no way to move between sections at all.
 *
 * Sections are split in two: the work on the left, and administering the tool
 * itself on the right, so the list a person uses daily stays short.
 */

interface NavItem {
  to: string
  label: string
  /** Exact match only — /admin is a prefix of every other admin route. */
  exact?: boolean
}

const PRIMARY: NavItem[] = [
  { to: '/admin/invoices', label: 'Invoices' },
  { to: '/admin/clients', label: 'Clients' },
  { to: '/admin', label: 'Projects', exact: true },
  { to: '/admin/newsroom', label: 'Newsroom' },
]

const SECONDARY: NavItem[] = [
  { to: '/admin/staff', label: 'Staff' },
  { to: '/admin/users', label: 'Client users' },
  { to: '/admin/settings', label: 'Settings' },
]

export default function AdminNav({ breadcrumb }: { breadcrumb?: string }) {
  const { pathname } = useLocation()
  const { logout } = useAuth()
  const navigate = useNavigate()

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.to
    return pathname === item.to || pathname.startsWith(`${item.to}/`)
  }

  function handleLogout() {
    logout()
    navigate('/admin/login')
  }

  const link = (item: NavItem, quiet = false) => (
    <Link
      key={item.to}
      to={item.to}
      aria-current={isActive(item) ? 'page' : undefined}
      className={`label whitespace-nowrap border-b-2 pb-2 -mb-px transition-colors ${
        isActive(item)
          ? 'border-ink text-ink'
          : `border-transparent hover:text-ink ${quiet ? 'text-stone-400' : 'text-stone-500'}`
      }`}
    >
      {item.label}
    </Link>
  )

  return (
    <header className="border-b border-cream-300 bg-cream-100">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between py-4">
          <Link to="/admin" className="flex items-center gap-2 group">
            <Logo size={18} />
            <span className="font-mono text-sm font-medium text-ink">ardorio</span>
            {breadcrumb && (
              <span className="font-mono text-xs text-stone-400 ml-1">/ {breadcrumb}</span>
            )}
          </Link>
          <button
            onClick={handleLogout}
            className="font-mono text-xs text-stone-400 hover:text-ink transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Scrolls rather than wraps on a narrow window, so the bar stays one
            line and the masthead height never jumps. */}
        <nav className="flex items-center gap-6 overflow-x-auto">
          {PRIMARY.map(i => link(i))}
          <span className="flex-1" />
          <span className="hidden sm:block w-px h-3 bg-cream-300 shrink-0" aria-hidden="true" />
          {SECONDARY.map(i => link(i, true))}
        </nav>
      </div>
    </header>
  )
}
