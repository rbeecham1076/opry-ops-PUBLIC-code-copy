import { useState, type FormEvent } from 'react'
import { ExternalLink, Mail, Pencil, Phone, Plus, Printer } from 'lucide-react'
import { insertRow, saveRow, useTable } from './lib/data'
import { Panel, useAsync } from './components'
import { STANDARD_TERMS } from './terms'
import { LINKS } from './links'

// The venue cheat sheet: need-to-know facts, one tap from every screen. Every line says where it came from.
type Contact = { id: string; name: string; organization: string | null; role: string | null; email: string | null; phone: string | null; venue_id: string | null; artist_id: string | null; staff_team: string | null; staff_sort: number | null; hours?: string | null }

const teamLabel = (t: string) => (t === 'Owners' ? 'Clay & Barbie' : t)
const TEAMS = ['Owners', 'Office', 'Show day', 'Production', 'Marketing', 'Concessions']
// Jobs the team has that nobody is filed under yet — shown as "add them" slots, never guessed.
const NEEDED: { team: string; job: string; test: RegExp }[] = [
  { team: 'Production', job: 'Lights (lighting director)', test: /light/i },
  { team: 'Concessions', job: 'Concessions workers', test: /concession/i },
]



const FACTS: { title: string; rows: [string, string][]; source: string }[] = [
  { title: 'The venue', source: 'Handbook, website, Tech Rider',
    rows: [['Office phone', '555-555-0100'], ['Seats', '537 (public / Etix). The handbook says 527 — use 537 unless Jamie says otherwise.'],
      ['Doors', 'Usually 1 hour before show time (7:00 show → 6:00 doors)'], ['Dressing rooms', '2 small rooms with bathrooms, no showers'],
      ['Merch', 'Room for two 8-foot tables'], ['Meals', 'Clay prefers a $X/person meal buyout; catering if the artist team says no']] },
  { title: 'Sound, stage & lights', source: 'Kentucky Opry Tech Rider (Drive)',
    rows: [['Mixing desk', 'Midas M32 at front of house (no separate monitor desk unless required)'],
      ['Speakers', '10 × dB Technologies DVA K5 line array (5 per side), 2 × DVA K5 front fills, 2 × DVA KS10 subs'],
      ['Room processing', '2 × DBX DriveRack Venu 360'], ['Monitors', '5 × dB Technologies FMX12, 2 × FMX15'],
      ['Stage risers', '1 × 8′×8′×12″, 2 × 6′×8′×6″'], ['Lighting', 'ChamSys QuickQ 20 board, in-house lighting director'],
      ['Extra gear', 'Split snakes, monitor console etc. through 4 Rivers Productions (extra cost)'],
      ['Volume', 'Aim for 85–90 dBA, peaks at 95 dB']] },
  { title: 'What we offer & contract checks', source: 'Rachel, 2026-09-30', rows: STANDARD_TERMS },
  { title: 'How we make offers', source: 'Handbook, Jamie’s proformas',
    rows: [['“Sold out”', '93–94% of seats — the rest are artist, promoter and radio/TV comps'],
      ['Proformas', 'Jamie builds one per show in the artist’s folder — email him the fee + location, then text him'],
      ['Contracts', 'Clay reads and signs. Save contract and rider separately as ArtistMM-DD-YYsigned']] },
  { title: 'Local vendors we’ve used', source: 'OPRY Show Advance Sheet',
    rows: [['Lunch / deli', 'Parcell’s Deli'], ['Dinner', 'Popi’s'], ['Catering', 'Artisan Kitchen'],
      ['Backline rental', 'Louisville Backline Company; Allen Music (pickup)'], ['Hotels', 'Hotel Rooms sheet (linked under Where things live)']] },
]

const WHERE: [string, string, string][] = [
  ['OPRY Show Advance Sheet', LINKS.opryAdvanceSheet, 'Tour manager, load-in, meals, backline for every show — production edits this'],
  ['Etown Show Advance Sheet', LINKS.etownAdvanceSheet, 'Same for the State Theater'],
  ['Hotel Rooms (hotel advance sheet)', LINKS.hotelRooms, 'Rooms, nights and confirmation numbers for every show'],
  ['Kentucky Opry Tech Rider', LINKS.techRider, 'Sound, stage, lights — send with the venue info sheet'],
  ['Venue info sheet — Kentucky Opry', LINKS.venueInfoOpry, 'Goes to the tour manager with the contract'],
  ['Venue info sheet — State Theater', LINKS.venueInfoState, 'Same, for Elizabethtown'],
  ['Venue info sheet — Marion', LINKS.venueInfoMarion, 'Same, for Marion Civic Center'],
  ['How to buy event insurance (outside venues)', LINKS.eventInsuranceHowTo, 'Video — at least 30 days out; Eventsured gives instant quotes'],
  ['Admin Checklist', LINKS.adminChecklist, 'The job, one line at a time'],
  ['Administrative Assistant Handbook', LINKS.handbook, 'How everything is done'],
]

const Reach = ({ c }: { c: Contact }) => <span className="reach">
  {c.phone && c.phone.split(', ').map(p => <a key={p} href={`tel:${p.replace(/\(.*\)/, '').replace(/[^\d+]/g, '')}`}><Phone size={14}/> {p}</a>)}
  {c.email && c.email.split(', ').map(e => <a key={e} href={`mailto:${e}`}><Mail size={14}/> {e}</a>)}
</span>

function StaffCard({ c }: { c: Contact }) {
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState({ role: c.role ?? '', phone: c.phone ?? '', email: c.email ?? '' })
  const { busy, err, run } = useAsync()
  const save = (e: FormEvent) => { e.preventDefault(); run(async () => { await saveRow('contacts', { id: c.id }, { role: f.role || null, phone: f.phone || null, email: f.email || null }, `Staff contact updated: ${c.name}`, c.id); setEdit(false) }) }
  return <div className="dcard staff">
    <div className="staffhead">{/^clay\b/i.test(c.name) && <img className="staffpic" src="/photos/clay.jpg" alt=""/>}<strong>{c.name}</strong><button className="linkbtn noprint" onClick={() => setEdit(!edit)} aria-label={`Edit ${c.name}`}><Pencil size={14}/> {edit ? 'Close' : 'Edit'}</button></div>
    {!edit ? <><small>{c.role}</small>{c.hours && <small className="hours">🕒 {c.hours}</small>}<Reach c={c}/>{!c.phone && !c.email && <small className="flag">No phone or email yet</small>}</>
      : <form className="addform" onSubmit={save}>
        <label className="grow">Job<input value={f.role} onChange={e => setF({ ...f, role: e.target.value })}/></label>
        <label className="grow">Phone<input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="270-…"/></label>
        <label className="grow">Email<input value={f.email} onChange={e => setF({ ...f, email: e.target.value })}/></label>
        <button className="primary" disabled={busy}>Save</button>{err && <p className="msg error">{err}</p>}
      </form>}
  </div>
}

function AddStaff({ team, job, onDone }: { team: string; job?: string; onDone?: () => void }) {
  const [f, setF] = useState({ name: '', team, role: job ?? '', phone: '', email: '' })
  const { busy, err, run } = useAsync()
  const add = (e: FormEvent) => { e.preventDefault(); run(async () => {
    const id = crypto.randomUUID()
    await insertRow('contacts', { id, name: f.name.trim(), staff_team: f.team, role: f.role || null, phone: f.phone || null, email: f.email || null,
      organization: 'Kentucky Opry / CCP team', business_unit: 'SHARED', source: 'Entered in Opry Ops' }, `Staff contact added: ${f.name}`, id)
    setF({ ...f, name: '', phone: '', email: '' }); onDone?.() }) }
  return <form className="addform" onSubmit={add}>
    <label className="grow">Name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="First and last name"/></label>
    <label>Team<select value={f.team} onChange={e => setF({ ...f, team: e.target.value })}>{TEAMS.map(t => <option key={t} value={t}>{teamLabel(t)}</option>)}</select></label>
    <label className="grow">Job<input value={f.role} onChange={e => setF({ ...f, role: e.target.value })}/></label>
    <label className="grow">Phone<input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })}/></label>
    <label className="grow">Email<input value={f.email} onChange={e => setF({ ...f, email: e.target.value })}/></label>
    <button className="primary" disabled={busy || !f.name.trim()}><Plus size={16}/> Add</button>{err && <p className="msg error">{err}</p>}
  </form>
}

function StaffSheet() {
  const contacts = useTable<Contact>('contacts', '*', { column: 'name' })
  const [adding, setAdding] = useState<{ team: string; job?: string } | null>(null)
  const staff = contacts.rows.filter(c => c.staff_team).sort((a, b) => (a.staff_sort ?? 999) - (b.staff_sort ?? 999) || a.name.localeCompare(b.name))
  const missing = NEEDED.filter(n => !staff.some(c => c.staff_team === n.team && n.test.test(`${c.role} ${c.staff_team}`)))
  return <Panel kicker="KENTUCKY OPRY & CCP" title="Staff contact sheet" action={<button className="linkbtn noprint" onClick={() => window.print()}><Printer size={16}/> Print</button>}>
    {TEAMS.map(team => { const people = staff.filter(c => c.staff_team === team), gaps = missing.filter(m => m.team === team)
      if (!people.length && !gaps.length) return null
      return <div key={team} className="staffteam"><h3>{teamLabel(team)}</h3>
        <div className="cards">{people.map(c => <StaffCard key={c.id} c={c}/>)}
          {gaps.map(g => <button key={g.job} className="dcard gap noprint" onClick={() => setAdding({ team: g.team, job: g.job })}><strong>{g.job}</strong><small>Nobody on file yet — tap to add name &amp; number</small></button>)}
        </div></div> })}
    {adding ? <div className="noprint"><h3 className="minihead">Add {adding.job ?? 'someone'}</h3><AddStaff team={adding.team} job={adding.job} onDone={() => setAdding(null)}/></div>
      : <button className="linkbtn noprint" onClick={() => setAdding({ team: 'Office' })}><Plus size={16}/> Add a person</button>}
  </Panel>
}

export function QuickInfo() {
  return <>
    <section className="hero small noprint"><p>CONTACTS & INFO</p><h1>Who to call, and need-to-know</h1>
      <span>The team, venue facts, how we make offers, and where files live. Tap a number to call, an address to email.</span></section>
    <StaffSheet/>
    {FACTS.map(f => <Panel key={f.title} kicker={`FROM: ${f.source.toUpperCase()}`} title={f.title}>
      <dl className="qi">{f.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </Panel>)}
    <Panel kicker="GOOGLE DRIVE" title="Where things live">
      <ul className="docs">{WHERE.map(([t, u, d]) => <li key={t}><a href={u} target="_blank" rel="noreferrer">{t} <ExternalLink size={13}/></a> <small>— {d}</small></li>)}</ul>
      <p className="note">Contracts folder is private to Clay, Jamie and Barbie. Logins live in the password manager, never here.</p>
    </Panel>
  </>
}
