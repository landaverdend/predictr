import { useProfiles } from '../hooks/useProfiles'

type AvatarProps = {
  pubkey: string
  size?: 'sm' | 'md' | 'lg'
}

export function Avatar({ pubkey, size = 'sm' }: AvatarProps) {
  const profiles = useProfiles([pubkey])
  const profile = profiles.get(pubkey)

  const dim = size === 'sm' ? 'w-5 h-5 text-[9px]' : size === 'md' ? 'w-7 h-7 text-[10px]' : 'w-16 h-16 text-base'

  if (profile?.picture) {
    return (
      <img
        src={profile.picture}
        alt={profile.name ?? pubkey.slice(0, 8)}
        onError={e => { e.currentTarget.style.display = 'none' }}
        className={`${dim} rounded-full object-cover shrink-0 bg-ink/10`}
      />
    )
  }

  return (
    <div className={`${dim} rounded-full bg-ink/10 flex items-center justify-center shrink-0`}>
      <span className="font-mono text-ink/40">{pubkey.slice(0, 2)}</span>
    </div>
  )
}
