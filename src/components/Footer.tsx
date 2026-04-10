import { Link } from 'react-router-dom'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-cream-300 bg-cream-100">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <Link
              to="/"
              className="font-mono text-sm font-medium text-ink hover:text-stone-700 transition-colors"
            >
              ardorio
            </Link>
            <p className="label mt-1">ardorio.co</p>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {[
              { label: 'Services', to: '/services' },
              { label: 'Work', to: '/work' },
              { label: 'Contact', to: '/contact' },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm text-stone-600 hover:text-ink transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <a
              href="mailto:hello@ardorio.co"
              className="text-sm text-stone-600 hover:text-ink transition-colors"
            >
              hello@ardorio.co
            </a>
          </div>
        </div>

        <div className="border-t border-cream-300 mt-8 pt-6">
          <p className="label">© {year} Ardorio. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
