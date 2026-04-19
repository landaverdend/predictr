import React from 'react'

export function Field({ label, children, mono = false, span2 = false }: {
  label: string
  children: React.ReactNode
  mono?: boolean
  span2?: boolean
}) {
  return (
    <div className={`space-y-0.5 ${span2 ? 'col-span-2' : ''}`}>
      <p className="text-ink/30">{label}</p>
      <div className={`text-ink/80 text-xs ${mono ? 'font-mono' : ''}`}>{children}</div>
    </div>
  )
}
