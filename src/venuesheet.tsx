import { useState } from 'react'
import { Copy, Mail } from 'lucide-react'
import { fmtDate, fmtTime, useTable, type Event, type ShowFact } from './lib/data'

// Venue info sheet for the tour manager — the same page Tiffany attached to every rider, filled in for this show.
type Contact = { name: string; role: string | null; phone: string | null; email: string | null }
const TECH_RIDER = 'https://docs.google.com/document/d/REDACTED/edit'

export function venueSheetText(event: Event, facts: ShowFact[], people: Contact[]) {
  const f = (k: string) => facts.find(x => x.field === k)?.value?.trim()
  const p = (n: string) => people.find(c => c.name === n)
  const line = (label: string, c?: Contact, extra = '') => c ? `${label}: ${c.name}${c.phone ? `, ${c.phone.split(',')[0]}` : ''}${c.email ? `, ${c.email.split(',')[0]}` : ''}${extra}` : null
  return [
    `KENTUCKY OPRY — VENUE INFO FOR ${event.title.toUpperCase()}`,
    `${fmtDate(event.event_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`, '',
    'Address: 88 Chilton Ln, Benton, KY 42025',
    'Capacity: 537 · All ages',
    `Doors: ${event.doors_at ? fmtTime(event.doors_at) : '1 hour before showtime'} · Showtime: ${event.starts_at ? fmtTime(event.starts_at) : '7:00 PM Central'}`,
    f('Arrival') && `Arrival: ${f('Arrival')}`, f('Load-in') && `Load-in: ${f('Load-in')}`, f('Soundcheck') && `Soundcheck: ${f('Soundcheck')}`,
    'Load in at the front of the theater; after load-in the bus parks behind the building. Shore power: yes.',
    'Dressing rooms: 2 small rooms with bathrooms (no showers).',
    'Merch: 100% artist. We provide 2 tables, 2 chairs and a merch seller if requested.',
    `Food: ${f('Food: buyout or catering') ?? 'per rider/contract'}${f('Meal times') ? ` · Meal: ${f('Meal times')}` : ''}`,
    `Hotel: ${f('Hotel') ?? 'per rider/contract'} — Quality Inn, 173 Carroll Rd, Benton, KY 42025 · 555-555-0100`,
    'Wi-Fi: given on arrival. Curfew: after staff has cleaned up.', '',
    'CONTACTS',
    line('Office', p('Kentucky Opry office')), line('Owner', p('Clay Campbell')), line('Owner', p('Barbie')), line('Business partner', p('Jamie')),
    line('Admin (hospitality & advance)', p('the office admin')), line('Day of show', p('the day-of-show lead')), line('Sound', p('Chris Rogers')), '',
    `Tech rider (stage plot, sound, lights): ${TECH_RIDER}`,
  ].filter((l): l is string => typeof l === 'string').join('\n')
}

export function VenueSheet({ event, facts }: { event: Event; facts: ShowFact[] }) {
  const people = useTable<Contact>('contacts', 'name, role, phone, email', { column: 'name' }).rows
  const [open, setOpen] = useState(false); const [copied, setCopied] = useState(false)
  const text = venueSheetText(event, facts, people)
  const tm = facts.find(x => x.field === 'Tour manager / production contact')?.value?.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? ''
  const mail = `mailto:${tm}?subject=${encodeURIComponent(`Kentucky Opry venue info — ${event.title}, ${fmtDate(event.event_date, { month: 'short', day: 'numeric' })}`)}&body=${encodeURIComponent(`Hi,\n\nHere is our venue information for ${event.title}. Let me know if you need anything else before show day!\n\n${text}\n\nThank you,\nthe office admin\nKentucky Opry`)}`
  return <div className="venuesheet">
    <button className="bigbtn alt" onClick={() => setOpen(!open)}><Mail size={18}/> Venue info sheet for the tour manager</button>
    {open && <>
      <pre className="recap letter">{text}</pre>
      <div className="actions">
        <a className="btnlink" href={mail}><Mail size={16}/> {tm ? `Email it to ${tm}` : 'Email it'}</a>
        <button onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}><Copy size={15}/> {copied ? 'Copied' : 'Copy'}</button>
      </div>
      <p className="note">Opens your email with everything filled in — nothing is sent until you press Send.{!tm && ' Add the tour manager’s email under Production to fill in the “To”.'}</p>
    </>}
  </div>
}
