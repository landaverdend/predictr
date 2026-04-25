import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { useRelayContext } from '../context/RelayContext'
import { useNostrUser } from '../hooks/useNostrUser'
import { useNavBadges } from '../hooks/useNavBadges'
import { useElectrumContext } from '../context/ElectrumContext'
import { useLang } from '../context/LangContext'
import { BITCOIN_NETWORK_NAME } from '../lib/config'
import NavBadge from './NavBadge'
import { db } from '../db'

const NETWORK_BADGE: Record<string, { label: string; className: string }> = {
  regtest: { label: 'regtest', className: 'bg-ink/10 text-ink/40' },
  testnet: { label: 'testnet4', className: 'bg-amber-400/15 text-amber-400/80' },
  signet:  { label: 'signet',   className: 'bg-violet-400/15 text-violet-400/80' },
  mainnet: { label: 'mainnet',  className: 'bg-positive/15 text-positive/80' },
}

const STATUS_COLOR = {
  connected:    'bg-positive',
  connecting:   'bg-caution animate-pulse',
  disconnected: 'bg-negative',
}

function UserMenu() {
  const user = useNostrUser()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { t, lang, setLang } = useLang()

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function handleClearData() {
    if (!confirm(t('nav.clear_data') + '?')) return
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
              {user?.pubkey ? nip19.npubEncode(user.pubkey) : 'no extension found'}
            </p>
          </div>

          {/* Language toggle */}
          <div className="px-4 py-2.5 border-b border-ink/5 flex items-center justify-between">
            <span className="text-xs text-ink/40">language</span>
            <div className="flex rounded-lg border border-ink/10 overflow-hidden text-xs">
              {(['en', 'es'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-2.5 py-1 transition-colors uppercase tracking-wider ${lang === l ? 'bg-ink/10 text-ink/80' : 'text-ink/30 hover:text-ink/60'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={() => { setOpen(false); navigate('/settings') }}
              className="w-full text-left px-4 py-2.5 text-sm text-ink/60 hover:bg-ink/5 transition-colors"
            >
              {t('nav.settings')}
            </button>
            <button
              onClick={() => { setOpen(false); navigate('/about') }}
              className="w-full text-left px-4 py-2.5 text-sm text-ink/60 hover:bg-ink/5 transition-colors"
            >
              {lang === 'es' ? 'acerca de' : 'about'}
            </button>
            <button
              onClick={handleClearData}
              className="w-full text-left px-4 py-2.5 text-sm text-negative hover:bg-negative/5 transition-colors"
            >
              {t('nav.clear_data')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Navbar() {
  const { status } = useRelayContext()
  const { blockHeight } = useElectrumContext()
  const badges = useNavBadges()
  const { t } = useLang()

  const links = [
    { to: '/', key: 'nav.markets' as const },
    { to: '/oracle', key: 'nav.oracle' as const },
    { to: '/contracts', key: 'nav.contracts' as const },
    { to: '/wallet', key: 'nav.wallet' as const },
  ]

  const desktopOnlyLinks = [
    { to: '/about', key: 'nav.about' as const },
  ]

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="border-b border-ink/10 px-4 sm:px-6 py-3 flex items-center justify-between bg-navbar">
        {/* Logo + block height */}
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold tracking-tight bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">predictr</span>
          {BITCOIN_NETWORK_NAME !== 'mainnet' && (() => {
            const badge = NETWORK_BADGE[BITCOIN_NETWORK_NAME] ?? { label: BITCOIN_NETWORK_NAME, className: 'bg-ink/10 text-ink/40' }
            return (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${badge.className}`}>
                {badge.label}
              </span>
            )
          })()}
          {blockHeight !== null && (
            <span className="font-mono text-xs text-ink/30 hidden sm:inline">
              block {blockHeight.toLocaleString()}
            </span>
          )}
        </div>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-5">
          {[...links, ...desktopOnlyLinks].map(({ to, key }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `relative text-sm transition-colors ${isActive ? 'text-ink font-medium' : 'text-ink/50 hover:text-ink/80'}`
              }
            >
              {t(key)}
              <NavBadge count={badges[to] ?? 0} />
            </NavLink>
          ))}
        </nav>

        {/* Right: status dot + user */}
        <div className="flex items-center gap-3">
          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOR[status]}`} />
          <UserMenu />
        </div>
      </header>

      {/* ── Mobile bottom tab bar ────────────────────────────────────── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-navbar border-t border-ink/10 flex">
        {links.map(({ to, key }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `relative flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 text-[10px] transition-colors ${isActive ? 'text-ink' : 'text-ink/35 hover:text-ink/60'}`
            }
          >
            {({ isActive }) => (
              <>
                <TabIcon routeKey={key} active={isActive} />
                <span className="leading-none">{t(key)}</span>
                {(badges[to] ?? 0) > 0 && (
                  <span className="absolute top-1.5 right-1/4 translate-x-3 min-w-[14px] h-[14px] rounded-full bg-brand text-[9px] text-white flex items-center justify-center px-1">
                    {badges[to]}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

    </>
  )
}

function TabIcon({ routeKey, active }: { routeKey: string; active: boolean }) {
  const opacity = active ? 'opacity-100' : 'opacity-40'
  if (routeKey === 'nav.markets') return (
    <svg className={`w-5 h-5 ${opacity}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h2l2-8 4 16 3-10 2 5 2-3h3" />
    </svg>
  )
  if (routeKey === 'nav.oracle') return (
    <svg className={`w-5 h-5 ${opacity}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2.5 2.5" />
    </svg>
  )
  if (routeKey === 'nav.contracts') return (
    <svg className={`w-5 h-5 ${opacity}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
  // wallet
  return (
    <svg className={`w-5 h-5 ${opacity}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a1 1 0 110 2 1 1 0 010-2z" />
    </svg>
  )
}
