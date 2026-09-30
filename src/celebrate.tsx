import { useEffect } from 'react'

// Sellout moments: a shower of gold stars (the star in the Opry "O") the first time a show passes 85% sold
// or finishes its checklist. Shown once per show per device; respects "reduce motion".
export function celebrate(message: string) {
  if (typeof document === 'undefined') return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const wrap = document.createElement('div')
  wrap.className = 'celebrate'
  wrap.setAttribute('role', 'status')
  wrap.innerHTML = `<div class="celebrate-msg">★ ${message}</div>`
  if (!reduce) for (let i = 0; i < 28; i++) {
    const s = document.createElement('span')
    s.className = 'star'; s.textContent = i % 3 === 0 ? '✦' : '★'
    s.style.left = `${Math.random() * 100}%`; s.style.animationDelay = `${Math.random() * 0.6}s`
    s.style.fontSize = `${14 + Math.random() * 22}px`
    wrap.appendChild(s)
  }
  document.body.appendChild(wrap)
  setTimeout(() => wrap.remove(), 3200)
}

export function useCelebrate(id: string, kind: 'sellout' | 'checklist' | null) {
  useEffect(() => {
    if (!kind) return
    const key = `opry-celebrated-${kind}-${id}`
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1') } catch { return }
    celebrate(kind === 'sellout' ? 'Over 85% sold — nearly a full house!' : 'Checklist complete — this show is ready!')
  }, [id, kind])
}
