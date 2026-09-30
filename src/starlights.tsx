// Star lights: the wire-outline stars on the front of the Kentucky Opry building are strings of bulbs.
// Drawn here as a star outline with little bulbs along it that twinkle in a slow chase.
const OUTER = 11, INNER = 4.4

function starPoints(): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 === 0 ? OUTER : INNER
    return [12 + r * Math.cos(a), 12 + r * Math.sin(a)]
  })
}

// Evenly space n bulbs along the star's outline.
function bulbs(n: number): [number, number][] {
  const pts = starPoints(), segs = pts.map((p, i) => [p, pts[(i + 1) % pts.length]] as const)
  const lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1])), total = lens.reduce((s, l) => s + l, 0)
  return Array.from({ length: n }, (_, k) => {
    let d = (k / n) * total, i = 0
    while (d > lens[i]) { d -= lens[i]; i++ }
    const [a, b] = segs[i], t = d / lens[i]
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  })
}

export function StarLights({ size = 64, count = 20, className = '', label }: { size?: number; count?: number; className?: string; label?: string }) {
  const pts = starPoints()
  return <svg className={'starlights ' + className} width={size} height={size} viewBox="0 0 24 24" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <polygon className="sl-wire" points={pts.map(p => p.join(',')).join(' ')}/>
    {bulbs(count).map(([x, y], i) => <circle key={i} className="sl-bulb" cx={x} cy={y} r=".78" style={{ ['--i' as string]: i, ['--n' as string]: count }}/>)}
  </svg>
}
