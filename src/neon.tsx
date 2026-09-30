import { useId } from 'react'

// The Opry's signature: the nested neon stars on the building — a big red-orange outline star around a smaller
// pale mint-green one. `lit` = the glowing version for dark surfaces (welcome header, sidebar).
// Unlit = a quiet outline in the current text color for small accents. Never animated.
const OUTER = '50,8 60.9,37 91.8,38.4 67.6,57.7 75.9,87.6 50,70.5 24.1,87.6 32.4,57.7 8.2,38.4 39.1,37'
const INNER = '50,30 55.4,44.5 70.9,45.2 58.8,54.9 62.9,69.8 50,61.2 37.1,69.8 41.2,54.9 29.1,45.2 44.6,44.5'

export function NeonStar({ size = 64, lit = true, className = '', label }: { size?: number; lit?: boolean; className?: string; label?: string }) {
  const id = useId().replace(/:/g, '')
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  if (!lit) return <svg className={'neonstar unlit ' + className} width={size} height={size} viewBox="0 0 100 100" {...a11y}>
    <polygon points={OUTER} fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/>
    <polygon points={INNER} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" opacity=".7"/>
  </svg>
  return <svg className={'neonstar lit ' + className} width={size} height={size} viewBox="0 0 100 100" {...a11y}>
    <defs>
      <filter id={`glow${id}`} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2.6" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <g filter={`url(#glow${id})`} fill="none" strokeLinejoin="round">
      <polygon points={OUTER} stroke="var(--neon-red)" strokeWidth="5"/>
      <polygon points={INNER} stroke="var(--neon-mint)" strokeWidth="4"/>
    </g>
    {/* the bright core of each glass tube */}
    <polygon points={OUTER} fill="none" stroke="#ffd9c7" strokeWidth="1.3" strokeLinejoin="round"/>
    <polygon points={INNER} fill="none" stroke="#f3fff9" strokeWidth="1.1" strokeLinejoin="round"/>
  </svg>
}

// A 45 record label for empty states: a small, quiet "nothing here" mark.
export function RecordLabel({ size = 40 }: { size?: number }) {
  return <svg className="recordlabel" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="19" fill="#2a2622"/>
    <circle cx="20" cy="20" r="15" fill="none" stroke="#ffffff1c" strokeWidth=".8"/>
    <circle cx="20" cy="20" r="12" fill="none" stroke="#ffffff14" strokeWidth=".8"/>
    <circle cx="20" cy="20" r="8" fill="var(--gold)"/>
    <circle cx="20" cy="20" r="1.6" fill="var(--canvas)"/>
  </svg>
}

// The little guitar-playing cowboy from the original Opry sign (he still hangs in the lobby) — a quiet nod to the
// theater's past. Drawn as a simple outline; used small and faint, never as a headline.
export function SignCowboy({ size = 56, className = '' }: { size?: number; className?: string }) {
  return <svg className={'signcowboy ' + className} width={size * 0.66} height={size} viewBox="0 0 66 100" role="img" aria-label="The guitar-playing cowboy from the original Kentucky Opry sign">
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
      {/* ten-gallon hat: tall crown and a wide curled brim */}
      <path d="M22 26 C18 14 22 4 30 3 C36 2 38 10 36 18" />
      <path d="M8 30 C4 22 10 16 18 22 C24 27 34 27 40 20 C46 14 54 18 50 27 C46 34 34 36 24 35 C16 34 10 33 8 30 Z" />
      {/* face, big nose and beard */}
      <path d="M22 35 C21 41 24 45 29 45 C33 45 35 41 34 36" />
      <path d="M28 38 C31 38 32 41 29 42" />
      {/* body leaning into the guitar */}
      <path d="M20 46 C14 52 14 62 18 70 L34 70 C38 62 38 52 32 46" />
      {/* guitar across the body: neck out to the right */}
      <path d="M12 58 C10 52 18 50 22 54 C26 50 34 52 32 60 C30 66 20 68 14 64 Z" />
      <path d="M31 57 L56 51" /><path d="M55 48 L60 50 L58 55 L55 54" />
      <path d="M21 58 L22 62" />
      {/* strumming hand and fretting hand */}
      <path d="M17 55 C15 52 19 50 21 53" /><path d="M44 51 C43 47 47 47 48 50 C48 53 46 54 44 53" />
      {/* jeans and boots */}
      <path d="M20 70 L18 88 M34 70 L32 88 M26 72 L26 86" />
      <path d="M16 88 L24 88 L26 94 L12 94 C12 91 14 89 16 88 Z" />
      <path d="M30 88 L36 88 L40 94 L28 94 Z" />
    </g>
  </svg>
}
