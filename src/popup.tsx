import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// On My Day, tiles keep their shape: tapping one opens its details in a popup on the same page
// (instead of stretching the tile or opening a new tab). Elsewhere (a show's checklist, To-Do) details stay inline.
export const PopupDetails = createContext(false)
export const usePopupDetails = () => useContext(PopupDetails)
// Any show name tag anywhere in the app opens that show's page (details, checklist, rider, tickets, files).
export const OpenShow = createContext<((id: string) => void) | null>(null)

export function DetailPopup({ title, kicker, onClose, children }: { title: string; kicker?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc); document.body.classList.add('popup-open')
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('popup-open') }
  }, [onClose])
  return createPortal(<div className="popback" onClick={onClose}>
    <div className="popcard" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
      <div className="pophead"><div>{kicker && <small>{kicker}</small>}<h2>{title}</h2></div>
        <button type="button" className="iconbtn" aria-label="Close" onClick={onClose} autoFocus><X size={22}/></button></div>
      <div className="popbody">{children}</div>
    </div>
  </div>, document.body)
}

// Inline where there's room, popup on My Day.
export function Detail({ open, title, kicker, onClose, children }: { open: boolean; title: string; kicker?: string; onClose: () => void; children: ReactNode }) {
  const popup = usePopupDetails()
  if (!open) return null
  return popup ? <DetailPopup title={title} kicker={kicker} onClose={onClose}>{children}</DetailPopup> : <>{children}</>
}
