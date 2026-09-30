import { ExternalLink, Mail, Phone } from 'lucide-react'
import { fmtDate, useTable, type Decision, type Event, type ShowFact, type Task } from './lib/data'
import type { Page } from './screens'

// Search everything: shows, people, riders & advance details, documents, tasks and approvals — one box, every screen.
type Contact = { id: string; name: string; organization: string | null; role: string | null; email: string | null; phone: string | null }
type Artist = { id: string; name: string }
type Doc = { id: string; title: string; url: string | null; event_id: string | null; document_type: string | null }
type Hit = { key: string; kind: string; title: string; detail?: string; onClick?: () => void; href?: string; contact?: Contact }

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase()
const snippet = (text: string, q: string) => {
  const i = norm(text).indexOf(q); if (i < 0) return text.slice(0, 110)
  const start = Math.max(0, i - 40)
  return (start > 0 ? '…' : '') + text.slice(start, i + q.length + 70) + (i + q.length + 70 < text.length ? '…' : '')
}

export function GlobalSearch({ q, events, tasks, decisions, openShow, go, close }: {
  q: string; events: Event[]; tasks: Task[]; decisions: Decision[]
  openShow: (id: string) => void; go: (p: Page) => void; close: () => void
}) {
  const contacts = useTable<Contact>('contacts', 'id, name, organization, role, email, phone', { column: 'name' }).rows
  const artists = useTable<Artist>('artists', 'id, name', { column: 'name' }).rows
  const facts = useTable<ShowFact>('show_facts', 'event_id, section, field, value, source, updated_at', { column: 'event_id' }).rows
  const docs = useTable<Doc>('documents', 'id, title, url, event_id, document_type', { column: 'title' }).rows
  const s = q.trim().toLowerCase()
  const show = (id: string | null) => events.find(e => e.id === id)
  const hit = (...xs: (string | null | undefined)[]) => xs.some(x => norm(x).includes(s))
  const pick = (fn: () => void) => () => { fn(); close() }

  const groups: [string, Hit[]][] = [
    ['Shows', events.filter(e => hit(e.title, e.notes, e.venue?.name, e.event_date)).slice(0, 6).map(e => ({
      key: e.id, kind: 'Show', title: e.title, detail: `${fmtDate(e.event_date, { month: 'short', day: 'numeric', year: 'numeric' })} · ${e.venue?.name ?? ''}`, onClick: pick(() => openShow(e.id)) }))],
    ['People', contacts.filter(c => hit(c.name, c.organization, c.role, c.email, c.phone)).slice(0, 6).map(c => ({
      key: c.id, kind: 'Person', title: c.name, detail: [c.role, c.organization].filter(Boolean).join(' · '), contact: c }))],
    ['Artists', artists.filter(a => hit(a.name)).slice(0, 4).map(a => {
      const next = events.filter(e => e.artist_id === a.id).sort((x, y) => (x.event_date ?? '').localeCompare(y.event_date ?? ''))[0]
      return { key: a.id, kind: 'Artist', title: a.name, detail: next ? `Show: ${fmtDate(next.event_date)}` : 'No show on file', onClick: pick(() => next ? openShow(next.id) : go('Artists & Venues')) }
    })],
    ['Show details (advance sheets, riders, proformas)', facts.filter(f => hit(f.value, f.field)).slice(0, 8).map(f => ({
      key: f.event_id + f.field, kind: f.section, title: `${show(f.event_id)?.title ?? 'Show'} — ${f.field}`, detail: snippet(f.value ?? '', s), onClick: pick(() => openShow(f.event_id)) }))],
    ['Documents', docs.filter(d => hit(d.title, d.document_type)).slice(0, 6).map(d => ({
      key: d.id, kind: d.document_type ?? 'Document', title: d.title, detail: show(d.event_id)?.title, href: d.url ?? undefined }))],
    ['To-Do', tasks.filter(t => t.status !== 'COMPLETE' && hit(t.title, t.description, t.next_action)).slice(0, 6).map(t => ({
      key: t.id, kind: 'Task', title: t.title, detail: [show(t.event_id)?.title, t.due_at && `due ${fmtDate(t.due_at.slice(0, 10))}`].filter(Boolean).join(' · '),
      onClick: pick(() => t.event_id ? openShow(t.event_id) : go('To-Do')) }))],
    ['Approvals', decisions.filter(d => hit(d.title, d.why, d.recommendation)).slice(0, 4).map(d => ({
      key: d.id, kind: d.status, title: d.title, detail: d.approver ? `Approver: ${d.approver}` : undefined, onClick: pick(() => go('Approvals')) }))],
  ]
  const total = groups.reduce((n, [, h]) => n + h.length, 0)

  return <div className="gsearch" role="region" aria-label="Search results">
    <div className="gshead"><b>{total ? `${total} match${total === 1 ? '' : 'es'} for “${q.trim()}”` : `Nothing found for “${q.trim()}”`}</b>
      <button className="linkbtn" onClick={close}>Close ✕</button></div>
    {!total && <p className="note">Try fewer letters — a last name, an artist, or a word like “hotel” or “pizza”.</p>}
    {groups.filter(([, h]) => h.length).map(([label, hits]) => <div key={label} className="gsgroup">
      <small>{label.toUpperCase()}</small>
      {hits.map(h => h.contact ? <div key={h.key} className="gshit"><span className="gskind">{h.kind}</span><div><strong>{h.title}</strong><small>{h.detail}</small>
          <span className="reach">{h.contact.phone && <a href={`tel:${h.contact.phone.split(',')[0].replace(/[^\d+]/g, '')}`}><Phone size={14}/> {h.contact.phone}</a>}
            {h.contact.email && <a href={`mailto:${h.contact.email.split(',')[0].trim()}`}><Mail size={14}/> {h.contact.email}</a>}</span></div></div>
        : h.href ? <a key={h.key} className="gshit" href={h.href} target="_blank" rel="noreferrer"><span className="gskind">{h.kind}</span><div><strong>{h.title} <ExternalLink size={13}/></strong><small>{h.detail}</small></div></a>
        : <button key={h.key} className="gshit" onClick={h.onClick}><span className="gskind">{h.kind}</span><div><strong>{h.title}</strong><small>{h.detail}</small></div></button>)}
    </div>)}
  </div>
}
