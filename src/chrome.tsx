import { useEffect, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { dismissUndo, undoNow, useUndo } from './lib/undo'

// ---------- Text size: small / regular / large, remembered on this device ----------
const SIZES = [{ label: 'A', zoom: 0.92, name: 'Smaller text' }, { label: 'A', zoom: 1, name: 'Regular text' }, { label: 'A', zoom: 1.15, name: 'Larger text' }, { label: 'A', zoom: 1.3, name: 'Largest text' }]
const KEY = 'opry-text-size'
function applyZoom(z: number) { document.documentElement.style.setProperty('--ui-zoom', String(z)) }
export function initTextSize() { try { const z = Number(localStorage.getItem(KEY)); if (z) applyZoom(z) } catch { /* private mode */ } }

export function TextSize() {
  const [zoom, setZoom] = useState(() => { try { return Number(localStorage.getItem(KEY)) || 1 } catch { return 1 } })
  useEffect(() => { applyZoom(zoom); try { localStorage.setItem(KEY, String(zoom)) } catch { /* ignore */ } }, [zoom])
  return <div className="textsize" role="group" aria-label="Text size">
    {SIZES.map((s, i) => <button key={s.zoom} className={zoom === s.zoom ? 'on' : ''} style={{ fontSize: 12 + i * 3 }} title={s.name} aria-label={s.name} aria-pressed={zoom === s.zoom} onClick={() => setZoom(s.zoom)}>{s.label}</button>)}
  </div>
}

// ---------- Undo toast: 25 seconds to put any change back ----------
export function UndoToast() {
  const u = useUndo()
  const [left, setLeft] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!u) return
    setErr(null)
    const tick = () => setLeft(Math.max(0, Math.ceil((u.expires - Date.now()) / 1000)))
    tick(); const t = setInterval(tick, 500); return () => clearInterval(t)
  }, [u])
  if (!u && !err) return null
  return <div className="undotoast" role="status" aria-live="polite">
    {err ? <span>Couldn’t undo: {err}</span> : <span><b>Saved.</b> {u!.label.length > 70 ? u!.label.slice(0, 70) + '…' : u!.label}</span>}
    {u && <button className="undobtn" onClick={() => undoNow().catch(e => setErr(e.message))}><RotateCcw size={16}/> Undo <small>{left}s</small></button>}
    <button className="undox" aria-label="Close" onClick={() => { dismissUndo(); setErr(null) }}><X size={16}/></button>
  </div>
}

// ---------- A 45 record, spinning — for loading screens (the lobby tables are covered in them) ----------
export function Record45({ label = 'Loading…' }: { label?: string }) {
  return <div className="record45" role="status"><span className="disc" aria-hidden="true"/><span>{label}</span></div>
}
