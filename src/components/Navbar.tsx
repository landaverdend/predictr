import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useRelayContext } from '../context/RelayContext'
import { useNostrUser } from '../hooks/useNostrUser'
import { useNavBadges } from '../hooks/useNavBadges'
import NavBadge from './NavBadge'
import { db } from '../db'

const STATUS_COLOR = {
  connected:    'bg-positive',
  connecting:   'bg-caution animate-pulse',
  disconnected: 'bg-negative',
}

const links = [
  { to: '/', label: 'markets' },
  { to: '/oracle', label: 'oracle' },
  { to: '/contracts', label: 'contracts' },
  { to: '/wallet', label: 'wallet' },
]

function UserMenu() {
  const user = useNostrUser()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function handleClearData() {
    if (!confirm('Clear all local data? This deletes your contracts, wallet keys, and cached markets.')) return
    await db.delete()
    window.location.reload()
  }

  const initials = user?.pubkey.slice(0, 3) ?? '??'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-full hover:opacity-80 transition-opacity"
      >
        {user?.profile?.picture ? (
          <img
            src={user.profile.picture}
            alt={user.profile.name ?? initials}
            onError={e => { e.currentTarget.style.display = 'none' }}
            className="w-8 h-8 rounded-full object-cover ring-2 ring-brand/30"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-brand/20 ring-2 ring-brand/30 flex items-center justify-center">
            <span className="text-[10px] font-mono text-brand font-medium">{initials}</span>
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-ink/10 rounded-xl shadow-lg overflow-hidden z-50">
          {/* Identity header */}
          <div className="px-4 py-3 border-b border-ink/5">
            {user?.profile?.name && (
              <p className="text-sm font-medium truncate">{user.profile.name}</p>
            )}
            <p className="text-[10px] font-mono text-ink/40 truncate mt-0.5">
              {user?.pubkey ?? 'no extension found'}
            </p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={() => { setOpen(false); navigate('/settings') }}
              className="w-full text-left px-4 py-2.5 text-sm text-ink/60 hover:bg-ink/5 transition-colors"
            >
              settings
            </button>
            <button
              onClick={handleClearData}
              className="w-full text-left px-4 py-2.5 text-sm text-negative hover:bg-negative/5 transition-colors"
            >
              clear local data
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Navbar() {
  const { status } = useRelayContext()
  const badges = useNavBadges()

  return (
    <header className="border-b border-ink/10 px-6 py-3 flex items-center justify-between bg-navbar">
      {/* Logo */}
      <span className="font-mono font-bold tracking-tight text-brand">predictr</span>

      {/* Right side: links + status + user */}
      <div className="flex items-center gap-6">
        <nav className="flex items-center gap-5">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `relative text-sm transition-colors ${isActive ? 'text-ink font-medium' : 'text-ink/50 hover:text-ink/80'}`
              }
            >
              {label}
              <NavBadge count={badges[to] ?? 0} />
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 text-xs text-ink/30">
          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOR[status]}`} />
        </div>

        <UserMenu />
      </div>
    </header>
  )
}
