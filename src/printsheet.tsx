import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Printable sheets (campaign plan, "Print my day"): the sheet is rendered outside the app (straight into <body>) and
// stays hidden on screen. printSheet() switches the page into print mode so ONLY that sheet prints — the browser's
// print window also offers "Save as PDF".
export function PrintSheet({ id, children }: { id: string; children: ReactNode }) {
  return createPortal(<div className="printsheet" data-sheet={id}>{children}</div>, document.body)
}

export function printSheet(id: string) {
  document.body.classList.add('print-sheet'); document.body.dataset.sheet = id
  const done = () => { document.body.classList.remove('print-sheet'); delete document.body.dataset.sheet; window.removeEventListener('afterprint', done) }
  window.addEventListener('afterprint', done); window.print()
}
