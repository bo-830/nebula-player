import { useState } from 'react'
import { Music2 } from 'lucide-react'
import { mediaUrlFor } from '../lib/mediaUrl'

export function Cover({
  src,
  alt,
  className
}: {
  src: string | null
  alt: string
  className?: string
}): React.JSX.Element {
  // Remember *which* cover failed instead of a boolean flag: a different `src`
  // is then a different value, so it retries on its own — no effect is needed
  // to reset state when the prop changes.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const url = src && failedSrc !== src ? mediaUrlFor(src) : null
  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        className={className}
        draggable={false}
        onError={() => setFailedSrc(src)}
      />
    )
  }
  return (
    <div className={`cover-ph ${className ?? ''}`} aria-label={alt}>
      <Music2 />
    </div>
  )
}
