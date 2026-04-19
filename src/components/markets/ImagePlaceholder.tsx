export function ImagePlaceholder({ imageUrl, question }: { imageUrl?: string; question: string }) {
  if (imageUrl) {
    return <img src={imageUrl} alt={question} className="w-full h-40 object-cover rounded-t-lg" />
  }
  return (
    <div className="w-full h-40 bg-ink/5 rounded-t-lg flex items-center justify-center">
      <svg className="w-8 h-8 text-ink/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5M4.5 3h15A1.5 1.5 0 0121 4.5v15a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 4.5v-15A1.5 1.5 0 014.5 3z" />
      </svg>
    </div>
  )
}
