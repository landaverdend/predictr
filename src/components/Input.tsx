import type { InputHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
}

export function Input({ label, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-ink/40">{label}</label>}
      <input
        {...props}
        className={`bg-transparent border border-ink/15 rounded-lg px-3 py-2 text-xs font-mono text-ink/80 placeholder-ink/25
          focus:outline-none focus:border-ink/40 transition-colors
          [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
          ${className}`}
      />
    </div>
  )
}
