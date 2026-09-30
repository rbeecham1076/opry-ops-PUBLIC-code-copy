import { useState } from 'react'
import { ArrowLeft, Copy, Mail, MessageSquare, Printer, ShoppingCart, Smartphone } from 'lucide-react'
import { SHOW_PHONE_LIST, daysUntil, fmtDate, fmtTime, isShowStep, useShowRows, useTable, type Event, type ShowFact, type Task } from './lib/data'
import { Empty, Panel, useAsync } from './components'
import { supabase } from './lib/supabase'

// Day-of-Show sheet: everything the day-of-show lead (Day-of-Show Supervisor, runner for the act) needs, due 10 days out.
// Built only from what's on file: advance-sheet facts, rider hospitality, and the team contacts.

const OPRY = 'Kentucky Opry Theater'
const LEAD_DAYS = 10
type Contact = { id: string; name: string; role: string | null; phone: string | null; email: string | null }

// Weekend = Friday–Sunday around the show (Thu counts with the following weekend; Mon–Wed stand alone).
const weekendKey = (iso: string) => {
  const d = new Date(iso + 'T12:00:00'), dow = d.getDay()
  const toSat = dow === 0 ? -1 : 6 - dow
  if (dow >= 1 && dow <= 3) return iso
  d.setDate(d.getDate() + toSat)
  return d.toISOString().slice(0, 10)
}

// Walmart order owner. KY Opry-only weekend → the day-of-show lead. A CCP show at an outside venue the same weekend → the office admin does both.
export function walmartOwner(event: Event, events: Event[]): { who: string; why: string } {
  if (!event.event_date) return { who: 'Not set', why: 'Show has no date yet.' }
  const key = weekendKey(event.event_date)
  const outside = events.filter(e => e.id !== event.id && e.event_date && weekendKey(e.event_date) === key
    && e.business_unit === 'CCP' && e.venue?.name !== OPRY)
  const opry = events.filter(e => e.event_date && weekendKey(e.event_date) === key && e.venue?.name === OPRY)
  if (event.venue?.name === OPRY && outside.length === 0) return { who: 'the day-of-show lead', why: 'Kentucky Opry-only weekend.' }
  if (event.venue?.name === OPRY || (event.business_unit === 'CCP' && opry.length > 0))
    return { who: 'the office admin', why: `Same weekend as ${[...outside, ...opry].filter(e => e.id !== event.id).map(e => e.title).join(', ')} — the office admin does the Walmart orders for both locations.` }
  return { who: 'the office admin', why: 'CCP show at an outside venue — confirm who shops for it.' }
}

export const packetDue = (event: Event) => {
  if (!event.event_date) return null
  const d = new Date(event.event_date + 'T12:00:00'); d.setDate(d.getDate() - LEAD_DAYS)
  return d.toISOString().slice(0, 10)
}

const fact = (facts: ShowFact[], field: string) => facts.find(f => f.field === field)?.value?.trim() || ''
const items = (list: string) => list.split('\n').flatMap(line => {
  const m = line.match(/^([A-Z][A-Z ()×0-9]+):\s*(.*)$/)
  const head = m ? m[1] : null, rest = m ? m[2] : line
  return [{ head, things: rest.split('•').map(s => s.trim()).filter(Boolean) }]
})

function sheetText(event: Event, facts: ShowFact[], owner: { who: string; why: string }, team: Contact[]) {
  const f = (k: string) => fact(facts, k)
  const lines = [
    `DAY-OF-SHOW SHEET — ${event.title}`,
    `${fmtDate(event.event_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${event.doors_at ? ` · doors ${fmtTime(event.doors_at)}` : ''}${event.starts_at ? ` · show ${fmtTime(event.starts_at)}` : ''}`,
    `${event.venue?.name ?? ''}`, '',
    'TIMES', ...['Arrival', 'Load-in', 'Soundcheck', 'Meal times'].map(k => `  ${k}: ${f(k) || '—'}`), '',
    'THEIR CONTACT', `  ${f('Tour manager / production contact') || '— not on file yet'}`, '',
    `WALMART ORDER — ${owner.who} (${owner.why})`, `  ${f('Walmart list') || '— no list yet: check the rider'}`, '',
    'MEALS', `  ${f('Rider: meals') || f('Food: buyout or catering') || '—'}`,
    f('Rider: allergies & no-gos') && `  ALLERGIES / NO: ${f('Rider: allergies & no-gos')}`,
    f('Rider: after show') && `  After show: ${f('Rider: after show')}`, '',
    'PEOPLE, ROOMS & HELP', `  ${f('Rider: people & rooms') || '—'}`,
    ...['Runner', 'Stagehands', 'Security', 'Merch seller', 'Backline', 'Hotel', 'Advance notes'].filter(k => f(k)).map(k => `  ${k}: ${f(k)}`), '',
    'OUR TEAM', ...team.map(c => `  ${c.name}${c.phone ? ` — ${c.phone}` : ''}`),
  ]
  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

// Text message link that works on iPhone and Android (Messages opens with the text filled in; you press Send).
export const smsHref = (phone: string, body: string) => `sms:${phone.split(',')[0].replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`

// Walmart list → a private phone checklist link (no sign-in) that the day-of-show lead can tick off in the store.
function PhoneList({ event, list, shopper, phone }: { event: Event; list: string; shopper: string; phone: string | null }) {
  const saved = useShowRows<{ id: string; token: string; items: unknown[]; checked: Record<string, string> }>('shopping_lists', event.id, 'id, token, items, checked', '').rows[0]
  const [link, setLink] = useState<string | null>(null)
  const { busy, err, run } = useAsync()
  const url = (token: string) => `${window.location.origin}/list/${token}`
  const make = () => run(async () => {
    const rows = items(list).flatMap(g => g.things.map(item => ({ group: g.head, item })))
    const { data, error } = await supabase!.from('shopping_lists').upsert({ event_id: event.id, title: `Walmart list — ${event.title}`, items: rows, checked: {}, shopper, updated_at: new Date().toISOString() }, { onConflict: 'event_id' }).select('token').single()
    if (error) throw error
    setLink(url(data.token))
  })
  const current = link ?? (saved ? url(saved.token) : null)
  const msg = current ? `Hi! Here's the Walmart list for ${event.title} (${fmtDate(event.event_date, { month: 'short', day: 'numeric' })}). Tap to check things off as you shop: ${current}` : ''
  return <div className="phonelist noprint">
    {current ? <>
      <small>{saved ? `${Object.keys(saved.checked ?? {}).length} of ${saved.items.length} checked` : 'Link ready'}</small>
      <button className="linkbtn" onClick={() => navigator.clipboard?.writeText(current)}>Copy link</button>
      {phone && <a className="btnlink small" href={smsHref(phone, msg)}><MessageSquare size={15}/> Text the link</a>}
      <button className="linkbtn" disabled={busy} onClick={make} title="Rebuild the list from the latest Walmart list (clears ticks)">Refresh list</button>
    </> : <button className="btnlink small" disabled={busy} onClick={make}><Smartphone size={15}/> Make a phone checklist</button>}
    {err && <p className="msg error">{err}</p>}
  </div>
}

export function DayOfShowSheet({ event, events, onBack }: { event: Event; events: Event[]; onBack: () => void }) {
  const facts = useShowRows<ShowFact>('show_facts', event.id, '*', 'field').rows
  const contacts = useTable<Contact>('contacts', 'id, name, role, phone, email', { column: 'name' }).rows
  const [copied, setCopied] = useState(false)
  const owner = walmartOwner(event, events)
  const team = ['the day-of-show lead', 'the office admin', 'office staff', 'Clay Campbell', 'Barbie', 'Jamie', 'Chris Rogers', 'Kentucky Opry office']
    .map(n => contacts.find(c => c.name === n)).filter(Boolean) as Contact[]
  const f = (k: string) => fact(facts, k)
  const ry = contacts.find(c => c.name === 'the day-of-show lead')
  const due = packetDue(event), dueIn = daysUntil(due)
  const list = f('Walmart list')
  const src = (k: string) => facts.find(x => x.field === k)?.source
  // Print just the shopping list (not the whole sheet) — body class limits what prints.
  const printList = () => {
    document.body.classList.add('print-shop')
    const done = () => { document.body.classList.remove('print-shop'); window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done); window.print()
  }
  const Row = ({ k, label }: { k: string; label?: string }) => f(k) ? <div><dt>{label ?? k}</dt><dd>{f(k)}</dd></div> : null

  return <div className="dos">
    <div className="wshead noprint"><button className="linkbtn" onClick={onBack}><ArrowLeft size={16}/> Back to the show</button></div>
    <section className="hero small">
      <p>DAY-OF-SHOW SHEET · FOR RACHEL YATES</p>
      <h1>{event.title}</h1>
      <span>{fmtDate(event.event_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        {event.doors_at && ` · doors ${fmtTime(event.doors_at)}`}{event.starts_at && ` · show ${fmtTime(event.starts_at)}`} · {event.venue?.name}</span>
      {due && <small className={'duechip' + (dueIn != null && dueIn < 0 ? ' late' : '')}>
        {dueIn != null && dueIn < 0 ? `Was due to the day-of-show lead ${fmtDate(due)} — send it now` : `Due to the day-of-show lead by ${fmtDate(due)}`}</small>}
      <div className="noprint dosbtns">
        <button onClick={() => window.print()}><Printer size={18}/> Print</button>
        <button onClick={() => { navigator.clipboard?.writeText(sheetText(event, facts, owner, team)); setCopied(true); setTimeout(() => setCopied(false), 2000) }}><Copy size={18}/> {copied ? 'Copied' : 'Copy to text or email'}</button>
        {ry?.phone && <a className="btnlink" href={smsHref(ry.phone, sheetText(event, facts, owner, team))}><MessageSquare size={18}/> Text it to the day-of-show lead</a>}
        <a className="btnlink" href={`mailto:${ry?.email ?? ''}?subject=${encodeURIComponent(`Day-of-Show: ${event.title} (${fmtDate(event.event_date, { month: 'short', day: 'numeric' })})`)}&body=${encodeURIComponent(sheetText(event, facts, owner, team))}`}><Mail size={18}/> Email it</a>
      </div>
      <p className="note noprint">These open your Messages or email app with everything filled in — nothing is sent until you press Send.</p>
    </section>

    <div className="shopwrap">
    <div className="printonly shophead"><b>Walmart list — {event.title}</b><span>{fmtDate(event.event_date, { weekday: 'long', month: 'long', day: 'numeric' })} · shopper: {owner.who}</span></div>
    <Panel kicker={`WALMART ORDER · ${owner.who.toUpperCase()}`} title="Shopping list" action={list ? <div className="shopbtns noprint">
      <button className="btnlink small" onClick={printList}><Printer size={15}/> Print shopping list</button>
      {SHOW_PHONE_LIST && <PhoneList event={event} list={list} shopper={owner.who} phone={owner.who === 'the day-of-show lead' ? ry?.phone ?? null : null}/>}
    </div> : undefined}>
      <p className="note noprint">{owner.why}</p>
      {list ? items(list).map((g, i) => <div key={i} className="shop">
        {g.head && <h3>{g.head}</h3>}
        <ul>{g.things.map(t => <li key={t}><label><input type="checkbox"/> {t}</label></li>)}</ul>
      </div>) : <Empty>No shopping list yet. On the show page, open Documents and press “Read this rider” — the list fills in here from the rider. You can also type it under Hospitality → “Walmart list”.</Empty>}
      {list && <p className="factsrc">From: {src('Walmart list')}</p>}
      {list && f('Rider: allergies & no-gos') && <p className="printonly shopallergy"><b>Allergies / do not buy:</b> {f('Rider: allergies & no-gos')}</p>}
    </Panel>
    </div>

    {f('Rider: allergies & no-gos') && <div className="allergy"><ShoppingCart size={20}/> <b>ALLERGIES / DO NOT SERVE:</b> {f('Rider: allergies & no-gos')}</div>}

    <Panel kicker="SHOW DAY" title="Times">
      <dl className="qi">
        <Row k="Arrival"/><Row k="Load-in"/><Row k="Soundcheck"/><Row k="Meal times"/>
        {event.doors_at && <div><dt>Doors</dt><dd>{fmtTime(event.doors_at)}</dd></div>}
        {event.starts_at && <div><dt>Show</dt><dd>{fmtTime(event.starts_at)}</dd></div>}
      </dl>
      {!['Arrival', 'Load-in', 'Soundcheck'].some(f) && <p className="note">Times aren’t on file yet — Tiffany confirms them in the advance (step P04, 14 days out).</p>}
    </Panel>

    <Panel kicker="FOOD" title="Meals & hospitality">
      <dl className="qi">
        <Row k="Rider: meals" label="What they need"/><Row k="Food: buyout or catering" label="Buyout or catering"/>
        <Row k="Caterer"/><Row k="Rider: after show" label="After the show"/>
      </dl>
      {!f('Rider: meals') && !f('Food: buyout or catering') && <Empty>No meal details yet.</Empty>}
    </Panel>

    <Panel kicker="PEOPLE" title="Their team, rooms & helpers">
      <dl className="qi">
        <Row k="Tour manager / production contact" label="Their contact"/>
        <Row k="Rider: people & rooms" label="People, rooms & help"/>
        <Row k="Hotel"/><Row k="Rooms × nights"/><Row k="Runner"/><Row k="Stagehands"/><Row k="Security"/>
        <Row k="Merch seller"/><Row k="Backline"/><Row k="Dressing rooms"/><Row k="Advance notes"/>
      </dl>
    </Panel>

    <Panel kicker="CALL" title="Our team">
      <dl className="qi">{team.map(c => <div key={c.id}><dt>{c.name}</dt><dd>{c.phone ? <a href={`tel:${c.phone.split(',')[0].replace(/[^\d+]/g, '')}`}>{c.phone}</a> : '—'} <small>{c.role}</small></dd></div>)}</dl>
    </Panel>
  </div>
}

// Report: which shows need a Day-of-Show packet, when, and whether the list is ready.
export function DayOfShowReport({ events, tasks, openSheet }: { events: Event[]; tasks: Task[]; openSheet: (id: string) => void }) {
  const facts = useTable<ShowFact>('show_facts', 'event_id, section, field, value, source, updated_at', { column: 'event_id' }).rows
  const upcoming = events.filter(e => { const d = daysUntil(e.event_date); return d != null && d >= 0 && d <= 60 })
    .sort((a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? ''))
  if (!upcoming.length) return <Empty>No shows in the next 60 days.</Empty>
  return <table className="dosreport">
    <thead><tr><th>Show</th><th>Packet due</th><th>Walmart</th><th>List</th><th>Sent?</th></tr></thead>
    <tbody>{upcoming.map(e => {
      const due = packetDue(e), dueIn = daysUntil(due), owner = walmartOwner(e, events)
      const hasList = facts.some(f => f.event_id === e.id && f.field === 'Walmart list' && f.value)
      const step = tasks.find(t => t.event_id === e.id && isShowStep(t) && t.source_rule_id === 'H04')
      const sent = step?.status === 'COMPLETE'
      return <tr key={e.id} className={!sent && dueIn != null && dueIn <= 0 ? 'late' : ''}>
        <td><button className="linkbtn" onClick={() => openSheet(e.id)}>{fmtDate(e.event_date)} — {e.title}</button></td>
        <td>{fmtDate(due)}{!sent && dueIn != null && (dueIn < 0 ? <b className="neg"> {-dueIn}d late</b> : dueIn === 0 ? <b> today</b> : <small> in {dueIn}d</small>)}</td>
        <td>{owner.who}</td>
        <td>{hasList ? '✓ ready' : <span className="flag">needs rider check</span>}</td>
        <td>{sent ? '✓ sent' : 'not yet'}</td>
      </tr>
    })}</tbody>
  </table>
}
