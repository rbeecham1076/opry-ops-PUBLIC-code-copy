// A few music notes float up from whatever was just ticked off (respects "reduce motion").
export function floatNotes(from: Element | null) {
  if (!from || typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const r = from.getBoundingClientRect()
  const glyphs = ['♪', '♫', '♩']
  for (let i = 0; i < 3; i++) {
    const n = document.createElement('span')
    n.className = 'floatnote'; n.textContent = glyphs[i]
    n.style.left = `${r.left + r.width / 2 + (i - 1) * 12}px`; n.style.top = `${r.top}px`
    n.style.animationDelay = `${i * 120}ms`
    document.body.appendChild(n)
    setTimeout(() => n.remove(), 1600)
  }
}

// Checklist progress as notes on a five-line staff: filled notes are done, hollow ones still to go.
export function StaffProgress({ done, total }: { done: number; total: number }) {
  if (!total) return null
  const slots = 12, filled = Math.round((done / total) * slots)
  const ys = [26, 22, 18, 14, 20, 24, 16, 12, 18, 22, 14, 20]
  return <svg className="staff" viewBox="0 0 160 36" role="img" aria-label={`${done} of ${total} steps done`}>
    {[8, 13, 18, 23, 28].map(y => <line key={y} x1="0" x2="160" y1={y} y2={y}/>)}
    <text x="2" y="27" className="clef">𝄞</text>
    {ys.map((y, i) => { const x = 26 + i * 11, on = i < filled
      return <g key={i} className={on ? 'on' : ''}><ellipse cx={x} cy={y} rx="3.6" ry="2.7" transform={`rotate(-20 ${x} ${y})`}/><line x1={x + 3.3} x2={x + 3.3} y1={y} y2={y - 11}/></g> })}
  </svg>
}
