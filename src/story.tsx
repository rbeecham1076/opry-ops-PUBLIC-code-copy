import { useMemo, useState } from 'react'
import { capacityOf, fmtDate, money, todayISO, type Event } from './lib/data'
import { showColor } from './components'
import { StarLights } from './starlights'

// The Opry Story: where the theater came from (photos and facts from the 28th-anniversary slides, docs/BRAND.md)
// and every past show on record in Opry Ops. Internal page — handy for anniversary posts, "then & now", and
// remembering how past shows did.
type Moment = { when: string; title: string; text: string; photo?: string; alt?: string }
const MOMENTS: Moment[] = [
  { when: '1969 – 1980', title: 'On the road', text: 'Clay spent the 1970s traveling the country with his band — guitar, mandolin, fiddle and vocals.',
    photo: '/photos/history/clay-young-blue-embroidered-shirt.jpg', alt: 'Young Clay in an embroidered western shirt with a red guitar' },
  { when: 'May 13–14, 1988', title: 'Opening weekend', text: 'Clay and Barbie opened the Kentucky Opry Show in an arched building near Kentucky Lake. The roadside sign said it all.',
    photo: '/photos/history/1988-opening-weekend-sign.jpg', alt: 'Roadside sign: Kentucky Opry Show! Opening May 13th–14th' },
  { when: '1988', title: 'The first home', text: '"Clay Campbell\'s Kentucky Opry Show — Family Entertainment." Friday and Saturday nights at 8:00.',
    photo: '/photos/history/1988-opened-quonset.jpg', alt: 'The original arched Kentucky Opry building with a Cadillac out front' },
  { when: '1988', title: 'The first brochure', text: 'Adults $6, children 12 & under $3. No alcohol, family fun — "come as you are." Same phone number, 527-3869.',
    photo: '/photos/history/1988-first-brochure.jpg', alt: 'The first Kentucky Opry brochure, 1988' },
  { when: '1988', title: 'The first band', text: 'The Kentucky Opry Show band and performers, in front of the barnwood KENTUCKY OPRY sign.',
    photo: '/photos/history/1988-first-band.jpg', alt: 'The first Kentucky Opry band and performers' },
  { when: 'New Year\'s Eve 1989', title: 'A new building', text: 'The first show in the new theater — the stage the Opry still plays today.',
    photo: '/photos/history/1989-first-show-new-building.jpg', alt: 'First show in the new building, New Year\'s Eve 1989' },
  { when: 'The Campbell family', title: 'Family owned', text: 'Clay, Barbie and their three boys — the Opry has always been a family business.',
    photo: '/photos/history/campbell-family-star-suit.jpg', alt: 'The Campbell family in stage clothes' },
  { when: 'Clay\'s book', title: 'Guitars, Bars & a Prodigal Son', text: 'Clay tells his story in The Clay Campbell Story.',
    photo: '/photos/history/clay-book-cover.jpg', alt: 'Cover of The Clay Campbell Story' },
  { when: 'Today', title: '537 seats, still family fun', text: 'Country legends, bluegrass and gospel, tribute shows, comedy and magic — plus free Gospel, Bluegrass and Classic Country nights.',
    photo: '/photos/stage-to-seats.jpg', alt: 'The Opry stage looking out at the green seats' },
]

export function OpryStory({ events, openShow }: { events: Event[]; openShow: (id: string) => void }) {
  const today = todayISO()
  const past = useMemo(() => events.filter(e => e.event_date && e.event_date < today && e.show_status !== 'CANCELLED')
    .sort((a, b) => (b.event_date ?? '').localeCompare(a.event_date ?? '')), [events, today])
  const years = [...new Set(past.map(e => e.event_date!.slice(0, 4)))]
  const [year, setYear] = useState<string>('all'); const [q, setQ] = useState('')
  const shown = past.filter(e => (year === 'all' || e.event_date!.startsWith(year)) && (!q || e.title.toLowerCase().includes(q.toLowerCase())))
  const tickets = past.reduce((s, e) => s + (e.tickets_sold ?? 0), 0)
  const since = new Date().getFullYear() - 1988

  return <>
    <section className="hero storyhero">
      <div className="storyhero-text">
        <p>THE OPRY STORY · SINCE MAY 1988</p>
        <h1>{since} years of family entertainment</h1>
        <span>Where the Kentucky Opry came from, and every past show on record — for anniversary posts, “then &amp; now”, and remembering what worked.</span>
        <div className="storystats">
          <div><b>1988</b><small>opening weekend</small></div>
          <div><b>537</b><small>seats today</small></div>
          <div><b>{past.length}</b><small>past shows on record</small></div>
          <div><b>{tickets.toLocaleString()}</b><small>tickets on record</small></div>
        </div>
      </div>
      <div className="storyhero-art">
        <img src="/photos/history/1988-opened-quonset.jpg" alt="The original Kentucky Opry building, 1988"/>
        <StarLights size={92} className="storystar" label="Star lights, like the ones on the front of the building"/>
      </div>
    </section>

    <section className="panel timeline-panel">
      <div className="panelhead"><div><small>THEN</small><h2>How it started</h2></div></div>
      <ol className="timeline">
        {MOMENTS.map((m, i) => <li key={i} style={{ ['--i' as string]: i }}>
          <span className="tl-dot" aria-hidden="true"><StarLights size={26} count={10}/></span>
          <div className="tl-card">
            {m.photo && <img src={m.photo} alt={m.alt ?? ''} loading="lazy"/>}
            <div><small>{m.when}</small><h3>{m.title}</h3><p>{m.text}</p></div>
          </div>
        </li>)}
      </ol>
      <p className="note">From the 28th-anniversary slideshow (June 11, 2016) and docs/BRAND.md. Family photos are for inside the office — ask Clay and Barbie before any public post.</p>
    </section>

    <section className="panel">
      <div className="panelhead"><div><small>PAST SHOWS</small><h2>Every show on record</h2></div>
        <input className="storysearch" value={q} onChange={e => setQ(e.target.value)} placeholder="Find an artist…" aria-label="Find a past show"/></div>
      <div className="rolechips" role="group" aria-label="Year">
        <button className={year === 'all' ? 'on' : ''} onClick={() => setYear('all')}>All ({past.length})</button>
        {years.map(y => <button key={y} className={year === y ? 'on' : ''} onClick={() => setYear(y)}>{y} ({past.filter(e => e.event_date!.startsWith(y)).length})</button>)}
      </div>
      {shown.length ? <div className="postergrid">{shown.map(e => { const cap = capacityOf(e), pct = cap && e.tickets_sold != null ? Math.round(e.tickets_sold / cap * 100) : null
        return <button key={e.id} className="poster" style={{ ['--sc' as string]: showColor(e.id) }} onClick={() => openShow(e.id)} title={`Open ${e.title}`}>
          <span className="poster-img" style={{ backgroundImage: `${e.image_url ? `url("${e.image_url}"), ` : ''}url("/photos/seats-to-stage.jpg")` }}/>
          <span className="poster-date">{fmtDate(e.event_date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <b>{e.title}</b>
          <small>{e.venue?.name ?? ''}</small>
          <span className="poster-stats">{e.show_type === 'HOUSE' ? 'Free night' : e.tickets_sold != null ? <>{e.tickets_sold}{cap ? ` / ${cap}` : ''} sold{pct != null ? ` · ${pct}%` : ''}</> : 'No ticket count'}{e.show_type !== 'HOUSE' && e.ticket_revenue != null ? ` · ${money(e.ticket_revenue)}` : ''}</span>
        </button> })}</div>
        : <p className="empty">{past.length ? 'No past shows match.' : 'Past shows appear here as they’re played — older ones can be added from the Etix history.'}</p>}
    </section>
  </>
}
