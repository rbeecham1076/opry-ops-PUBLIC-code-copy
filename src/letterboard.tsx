import { fmtDate, type Event } from './lib/data'

// The roadside sign out front: black changeable letters on white tracks, dates in red.
// Shows the next few shows exactly the way passers-by on the highway see them.
const clean = (t: string) => t.replace(/[’']/g, "'").replace(/\s*[:(].*$/, '').replace(/^The Broken People Tour Starring /i, '').toUpperCase()

// The marquee, streamlined: a slim sign with a steady row of bulbs and the next three shows in changeable letters.
// Sits at the top of My Day's side column. Tap a show to open it.
export function SignMarquee({ events, onOpen }: { events: Event[]; onOpen: (id: string) => void }) {
  const rows = events.filter(e => e.show_status !== 'HOLD' && e.show_status !== 'CANCELLED').slice(0, 3)
  if (!rows.length) return null
  return <section className="signmarquee" aria-label="On the sign: the next three shows">
    <header><span className="sm-bulbs" aria-hidden="true"/><h2>Kentucky Opry</h2><small>ON THE SIGN</small><span className="sm-bulbs" aria-hidden="true"/></header>
    <div className="sm-board">{rows.map(e => <button key={e.id} className="sm-row" onClick={() => onOpen(e.id)} title={e.title}>
      <span className="sm-name">{clean(e.title)}</span><span className="sm-date">{fmtDate(e.event_date, { month: 'short', day: 'numeric' }).toUpperCase()}</span></button>)}</div>
  </section>
}
