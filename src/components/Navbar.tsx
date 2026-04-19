import { NavLink } from 'react-router-dom'
import { useRelayContext } from '../context/RelayContext'

const STATUS_COLOR = {
  connected: 'bg-positive',
  connecting: 'bg-caution animate-pulse',
  disconnected: 'bg-negative',
}

const links = [
  { to: '/', label: 'markets' },
  { to: '/oracle', label: 'oracle' },
  { to: '/contracts', label: 'contracts' },
  { to: '/wallet', label: 'wallet' },
]

export default function Navbar() {
  const { status } = useRelayContext()

  return (
    <header className="border-b border-ink/10 px-6 py-4 flex items-center justify-between bg-navbar" >
      <div className="flex items-center gap-6">
        <span className="font-mono font-bold tracking-tight text-brand">predictr</span>
        <nav className="flex items-center gap-4">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `text-sm transition-colors ${isActive ? 'text-ink' : 'text-ink/40 hover:text-ink/70'}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2 text-sm text-ink/40">
        <span className={`w-2 h-2 rounded-full ${STATUS_COLOR[status]}`} />
        {status}
      </div>
    </header>
  )
}
