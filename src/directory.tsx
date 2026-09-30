import { useState } from 'react'
import { Mail, Phone } from 'lucide-react'
import { BU_LABEL, fmtDate, useTable, type BusinessUnit, type Event } from './lib/data'
import { Empty, Panel } from './components'

type Contact = { id: string; name: string; organization: string | null; role: string | null; email: string | null; phone: string | null; artist_id: string | null; venue_id: string | null; source: string | null }
type Artist = { id: string; name: string; aliases: string[]; buckets: string[]; status: string; notes: string | null; agent: Contact | null }
type Venue = { id: string; name: string; city: string | null; state: string | null; capacity: number | null; business_unit: BusinessUnit; ticketing_provider: string | null
  hospitality_notes: string | null; production_notes: string | null; notes: string | null }

const has = (q: string, ...f: (string | null | undefined)[]) => !q || f.some(x => x?.toLowerCase().includes(q.toLowerCase()))
const Reach = ({ c }: { c: Contact }) => <span className="reach">
  {c.email && c.email.split(', ').map(e => <a key={e} href={`mailto:${e}`}><Mail size={13}/> {e}</a>)}
  {c.phone && c.phone.split(', ').map(p => <a key={p} href={`tel:${p.replace(/[^\d+]/g, '')}`}><Phone size={13}/> {p}</a>)}
</span>

export function ArtistsVenues({ events, q, openShow, only }: { events: Event[]; q: string; openShow: (id: string) => void; only?: 'Artists' | 'Venues' | 'Contacts' }) {
  const [tabState, setTab] = useState<'Artists' | 'Venues' | 'Contacts'>('Artists'); const tab = only ?? tabState; const [bucket, setBucket] = useState('ALL')
  const artists = useTable<Artist>('artists', '*, agent:contacts!artists_agent_contact_fk(*)', { column: 'name' })
  const venues = useTable<Venue>('venues', '*', { column: 'name' })
  const contacts = useTable<Contact>('contacts', '*', { column: 'name' })
  const buckets = [...new Set(artists.rows.flatMap(a => a.buckets ?? []))].sort()
  const showsFor = (a: Artist) => events.filter(e => e.artist_id === a.id || [a.name, ...(a.aliases ?? [])].some(n => e.title.toLowerCase().includes(n.toLowerCase())))

  const aList = artists.rows.filter(a => (bucket === 'ALL' || a.buckets?.includes(bucket)) && has(q, a.name, ...(a.aliases ?? []), a.agent?.name))
  // Kentucky Opry first, then the State Theater, then Marion Civic Center, then the other outside venues A–Z.
  const VENUE_ORDER = [/kentucky opry/i, /state theater/i, /marion/i]
  const venueRank = (n: string) => { const i = VENUE_ORDER.findIndex(re => re.test(n)); return i < 0 ? VENUE_ORDER.length : i }
  const vList = venues.rows.filter(v => has(q, v.name, v.city)).sort((a, b) => venueRank(a.name) - venueRank(b.name) || a.name.localeCompare(b.name))
  const cList = contacts.rows.filter(c => has(q, c.name, c.organization, c.role, c.email))
  return <>
    <section className="hero small">
      <p>ARTISTS, VENUES & CONTACTS</p>
      <h1>Who we book, where, and who to call</h1>
      <span>{artists.rows.length} artists · {venues.rows.length} venues · {contacts.rows.length} contacts — imported from “acts we book”, the outside-venue list and the handbook.</span>
    </section>
    {!only && <div className="modebar"><div className="tabs" role="tablist">{(['Artists', 'Venues', 'Contacts'] as const).map(t =>
      <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === 'Artists' && <select className="bucketsel" value={bucket} onChange={e => setBucket(e.target.value)} aria-label="Bucket"><option value="ALL">All artists</option>{buckets.map(b => <option key={b}>{b}</option>)}</select>}
    </div>}
    {only === 'Artists' && buckets.length > 0 && <div className="modebar"><select className="bucketsel" value={bucket} onChange={e => setBucket(e.target.value)} aria-label="Kind of act"><option value="ALL">All artists</option>{buckets.map(b => <option key={b}>{b}</option>)}</select></div>}

    {tab === 'Artists' && <Panel title={`${aList.length} artist${aList.length === 1 ? '' : 's'}`}>
      <div className="cards">{aList.map(a => { const shows = showsFor(a); return <div className="dcard" key={a.id}>
        <strong>{a.name}</strong>
        <div className="steptags">{a.buckets?.map(b => <span key={b} className="pill">{b}</span>)}</div>
        {a.agent ? <small><b>Agent:</b> {a.agent.name}<Reach c={a.agent}/></small> : <small className="muted">No agent on file</small>}
        {shows.length > 0 && <small><b>Shows:</b> {shows.map((e, i) => <span key={e.id}>{i ? ', ' : ''}<button className="linkish small" onClick={() => openShow(e.id)}>{fmtDate(e.event_date, { month: 'short', day: 'numeric', year: 'numeric' })}</button></span>)}</small>}
        {a.notes?.includes('ask Rach') && <small className="flag">{a.notes.split('\n').find(l => l.includes('ask Rach'))}</small>}
      </div> })}</div>
      {aList.length === 0 && <Empty>No artists match.</Empty>}
    </Panel>}

    {tab === 'Venues' && <Panel title={`${vList.length} venues`}>
      <div className="cards">{vList.map(v => <div className="dcard" key={v.id}>
        <strong>{v.name}</strong>
        <small>{[v.city, v.state].filter(Boolean).join(', ') || 'Location not recorded'} · {BU_LABEL[v.business_unit]}{v.capacity ? ` · ${v.capacity} seats` : ''}</small>
        {v.ticketing_provider && <small><b>Ticketing:</b> {v.ticketing_provider}</small>}
        {v.hospitality_notes && <small>{v.hospitality_notes}</small>}
        {v.production_notes && <small>{v.production_notes}</small>}
        {contacts.rows.filter(c => c.venue_id === v.id).map(c => <small key={c.id}><b>{c.name}</b>{c.role && c.role !== 'Venue contact' ? ` (${c.role})` : ''}<Reach c={c}/></small>)}
      </div>)}</div>
    </Panel>}

    {tab === 'Contacts' && <ContactCrates contacts={cList} venues={venues.rows} artists={artists.rows}/>}
  </>
}

// Everyone, filed like a record-store bin: one divider per group (our team, each venue, artists & agents, crew …).
const CREW = /graphics|video|slides|sound|website|radio|commercial|engineer/i
function groupOf(c: Contact, venueName: (id: string) => string | undefined) {
  if (c.organization?.startsWith('Kentucky Opry')) return 'Kentucky Opry team'
  if (c.venue_id) return venueName(c.venue_id) ?? c.organization ?? 'Venues'
  if (/hotel|inn\b/i.test(c.role ?? '')) return 'Hotels'
  if (c.artist_id || /agent|artist/i.test(c.role ?? '')) return 'Artists & agents'
  if (CREW.test(c.role ?? '')) return 'Crew, design & media'
  if (/co-op|church|homeschool|school/i.test(`${c.organization} ${c.role}`)) return 'Community & churches'
  return 'Other'
}
const FIRST = ['Kentucky Opry team'], LAST = ['Artists & agents', 'Crew, design & media', 'Hotels', 'Community & churches', 'Other']

function ContactCrates({ contacts, venues, artists }: { contacts: Contact[]; venues: Venue[]; artists: Artist[] }) {
  const venueName = (id: string) => { const v = venues.find(x => x.id === id); return v ? `${v.name}${v.city ? ` · ${v.city}` : ''}` : undefined }
  const artistName = (id: string | null) => artists.find(a => a.id === id)?.name
  const groups = new Map<string, Contact[]>()
  for (const c of contacts) { const g = groupOf(c, venueName); groups.set(g, [...(groups.get(g) ?? []), c]) }
  const rank = (g: string) => FIRST.includes(g) ? 0 : LAST.includes(g) ? 2 + LAST.indexOf(g) : 1
  const order = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  const slug = (g: string) => 'crate-' + g.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  if (!contacts.length) return <Empty>No contacts match.</Empty>
  return <div className="crates">
    <nav className="cratetabs" aria-label="Jump to a group">{order.map(g => <a key={g} href={'#' + slug(g)}>{g.split(' · ')[0]} <small>{groups.get(g)!.length}</small></a>)}</nav>
    {order.map(g => <section key={g} id={slug(g)} className="crate">
      <h2 className="cratehead"><span>{g}</span><small>{groups.get(g)!.length}</small></h2>
      <div className="cratecards">{groups.get(g)!.sort((a, b) => (artistName(a.artist_id) ?? a.name).localeCompare(artistName(b.artist_id) ?? b.name)).map(c => <div className="dcard" key={c.id}>
        <strong>{c.name}</strong>
        <small>{[artistName(c.artist_id) && `for ${artistName(c.artist_id)}`, c.role, g.startsWith(c.organization ?? '~') ? null : c.organization].filter(Boolean).join(' · ')}</small>
        <Reach c={c}/>
        {(() => { const books = artists.filter(a => a.agent?.id === c.id).map(a => a.name); return books.length > 0 && <small><b>Books:</b> {books.join(', ')}</small> })()}
      </div>)}</div>
    </section>)}
  </div>
}
