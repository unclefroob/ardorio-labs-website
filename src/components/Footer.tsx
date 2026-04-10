import { Link } from 'react-router-dom'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-white/5 bg-navy-950">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Brand */}
          <div>
            <Link to="/" className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-brand rounded-md flex items-center justify-center">
                <span className="text-white font-bold text-xs">A</span>
              </div>
              <span className="font-semibold text-white tracking-tight">ardorio</span>
            </Link>
            <p className="text-white/50 text-sm leading-relaxed max-w-xs">
              Tech consulting for enterprises. AI strategy. Startup launch partnerships.
            </p>
          </div>

          {/* Links */}
          <div>
            <p className="text-white/30 text-xs font-semibold uppercase tracking-widest mb-4">Navigation</p>
            <div className="flex flex-col gap-2.5">
              {[
                { label: 'Home', to: '/' },
                { label: 'Services', to: '/services' },
                { label: 'Our Work', to: '/work' },
                { label: 'Contact', to: '/contact' },
              ].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="text-sm text-white/50 hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="text-white/30 text-xs font-semibold uppercase tracking-widest mb-4">Contact</p>
            <a
              href="mailto:hello@ardorio.co"
              className="text-sm text-white/50 hover:text-white transition-colors"
            >
              hello@ardorio.co
            </a>
            <p className="text-sm text-white/50 mt-2">ardorio.co</p>
          </div>
        </div>

        <div className="border-t border-white/5 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/30 text-xs">© {year} Ardorio. All rights reserved.</p>
          <p className="text-white/20 text-xs">Built by Ardorio</p>
        </div>
      </div>
    </footer>
  )
}
