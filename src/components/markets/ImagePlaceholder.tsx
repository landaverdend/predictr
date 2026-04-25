import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm cursor-zoom-out"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className="max-w-[92vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors"
        aria-label="Close"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M2 2l12 12M14 2L2 14" />
        </svg>
      </button>
    </div>,
    document.body,
  )
}

export function ImagePlaceholder({ imageUrl, question, height = 'h-40', expandable = false }: { imageUrl?: string; question: string; height?: string; expandable?: boolean }) {
  const [open, setOpen] = useState(false)

  if (imageUrl) {
    return (
      <>
        <img
          src={imageUrl}
          alt={question}
          className={`w-full ${height} object-cover block ${expandable ? 'cursor-zoom-in' : ''}`}
          onClick={expandable ? () => setOpen(true) : undefined}
        />
        {open && <Lightbox src={imageUrl} alt={question} onClose={() => setOpen(false)} />}
      </>
    )
  }
  return (
    <div className={`w-full ${height} bg-gradient-to-br from-brand-dim/60 via-ink/5 to-ink/10 flex items-center justify-center`}>
      <svg className="w-7 h-7 text-ink/15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  )
}
