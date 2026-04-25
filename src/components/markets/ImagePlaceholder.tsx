export function ImagePlaceholder({ imageUrl, question }: { imageUrl?: string; question: string }) {
  if (imageUrl) {
    return <img src={imageUrl} alt={question} className="w-full h-40 object-cover block" />
  }
  return (
    <div className="w-full h-40 bg-gradient-to-br from-brand-dim/60 via-ink/5 to-ink/10 flex items-center justify-center">
      <svg className="w-7 h-7 text-ink/15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  )
}
