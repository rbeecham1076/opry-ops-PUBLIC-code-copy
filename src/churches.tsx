import { useState, type FormEvent } from 'react'
import { Mail, Phone, Plus } from 'lucide-react'
import { supabase } from './lib/supabase'
import { daysUntil, fmtDate, logChange, todayISO, useTable, type Event } from './lib/data'
import { Empty, Panel, useAsync } from './components'
import { DetailPopup } from './popup'

// ---------- Church & Faith Partner Network ----------
// A reusable list of churches (and faith groups) we can ask to share Christian & Gospel shows. Each church keeps its
// outreach history per show: what we sent, who we talked to, whether they shared, and tickets we can trace to them.
// Nothing here sends anything — it's the list and the log. Churches are NOT added to Cymbal fan lists.

export type Church = {
  id: string; name: string; city: string | null; state: string | null; county: string | null; drive_minutes: number | null
  denomination: string | null; association: string | null; approx_size: string | null; music_fit: string
  has_youth: boolean | null; has_college: boolean | null; has_womens: boolean | null
  website: string | null; facebook: string | null; instagram: string | null; office_email: string | null; office_phone: string | null
  pastor: string | null; pastor_email: string | null; worship_leader: string | null; worship_email: string | null
  youth_leader: string | null; youth_email: string | null; comms_contact: string | null; comms_email: string | null
  womens_contact: string | null; womens_email: string | null; preferred_contact: string | null
  status: string; source: string | null; last_contact: string | null; follow_up_on: string | null; notes: string | null
}
type Outreach = { id: string; partner_id: string; event_id: string | null; contacted_on: string | null; channel: string | null; contact_person: string | null
  what_sent: string | null; response: string; shared_how: string | null; promo_code: string | null; tickets_attributed: number | null; follow_up_on: string | null; notes: string | null }

export const FIT: Record<string, string> = { CONTEMPORARY: 'Contemporary worship', SOUTHERN_GOSPEL: 'Southern Gospel', BOTH: 'Contemporary + Southern Gospel', TRADITIONAL: 'Traditional hymns', UNKNOWN: 'Not sure yet' }
const STATUS: Record<string, [string, string]> = { PROSPECT: ['Not contacted', ''], CONTACTED: ['Contacted', 'amber'], FRIENDLY: ['Friendly', 'ok'], PARTNER: ['Partner ★', 'ok'], DO_NOT_CONTACT: ['Do not contact', 'red'] }
const RESPONSE: Record<string, string> = { NONE: 'No answer yet', REPLIED: 'Replied', WILL_SHARE: 'Will share', SHARED: 'Shared it ✓', DECLINED: 'Said no' }
const DENOMS = ['Baptist (SBC)', 'Baptist (other)', 'Non-denominational', 'Methodist', 'Wesleyan', 'Nazarene', 'Assembly of God', 'Pentecostal / Full Gospel', 'Church of Christ', 'Christian Church', 'Presbyterian', 'Catholic', 'Campus ministry', 'Homeschool group', 'Other']
const has = (q: string, ...f: (string | null | undefined)[]) => !q || f.some(x => x?.toLowerCase().includes(q.toLowerCase()))

const People = ({ c }: { c: Church }) => <div className="chpeople">
  {([['Pastor', c.pastor, c.pastor_email], ['Worship', c.worship_leader, c.worship_email], ['Youth', c.youth_leader, c.youth_email],
    ['Announcements', c.comms_contact, c.comms_email], ['Women’s', c.womens_contact, c.womens_email]] as const).filter(([, n, e]) => n || e).map(([role, n, e]) =>
    <small key={role}><b>{role}:</b> {n}{e && <a href={`mailto:${e}`}> <Mail size={12}/> {e}</a>}</small>)}
  {(c.office_email || c.office_phone) && <small><b>Office:</b>{c.office_email && <a href={`mailto:${c.office_email}`}> <Mail size={12}/> {c.office_email}</a>}
    {c.office_phone && <a href={`tel:${c.office_phone.replace(/[^\d+]/g, '')}`}> <Phone size={12}/> {c.office_phone}</a>}</small>}
</div>

export function Churches({ events, q }: { events: Event[]; q: string }) {
  const churches = useTable<Church>('church_partners', '*', { column: 'name' })
  const outreach = useTable<Outreach>('partner_outreach', '*', { column: 'contacted_on', ascending: false })
  const [fit, setFit] = useState('ALL'); const [status, setStatus] = useState('ALL'); const [dueOnly, setDueOnly] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null); const [adding, setAdding] = useState(false)
  const today = todayISO()
  const due = (c: Church) => !!c.follow_up_on && c.follow_up_on <= today && c.status !== 'DO_NOT_CONTACT'
  const list = churches.rows.filter(c => (fit === 'ALL' || c.music_fit === fit || (fit !== 'UNKNOWN' && c.music_fit === 'BOTH' && fit !== 'TRADITIONAL'))
    && (status === 'ALL' || c.status === status) && (!dueOnly || due(c)) && has(q, c.name, c.city, c.county, c.denomination, c.pastor, c.worship_leader, c.youth_leader, c.notes))
  const dueCount = churches.rows.filter(due).length
  const open = churches.rows.find(c => c.id === openId)
  const shared = (id: string) => outreach.rows.filter(o => o.partner_id === id && o.response === 'SHARED').length
  const christianShows = events.filter(e => (daysUntil(e.event_date) ?? -1) >= 0)

  return <>
    <Panel kicker="CHURCH & FAITH PARTNER NETWORK" title={`${churches.rows.length} churches & faith groups`} action={<button onClick={() => setAdding(true)}><Plus size={16}/> Add a church</button>}>
      <p className="note">Churches we can ask to share Christian &amp; Gospel shows. Match the show to the church: <b>contemporary</b> acts (Tenth Avenue North, Cochren &amp; Co.) → contemporary-worship churches, youth and college groups; <b>Southern Gospel</b> acts (Ernie Haase, Jason Crabb) → Southern Gospel and traditional churches. Always send one at a time, and honor “do not contact”.</p>
      <div className="modebar chfilters">
        <select value={fit} onChange={e => setFit(e.target.value)} aria-label="Music fit"><option value="ALL">Any music</option>{Object.entries(FIT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="ALL">Any status</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        <label className="chk"><input type="checkbox" checked={dueOnly} onChange={e => setDueOnly(e.target.checked)}/> Follow-up due ({dueCount})</label>
      </div>
      <div className="chgrid">{list.map(c => { const [sl, tone] = STATUS[c.status] ?? [c.status, '']; return <button type="button" key={c.id} className={'chcard' + (due(c) ? ' due' : '')} onClick={() => setOpenId(c.id)}>
        <strong>{c.name}</strong>
        <small>{[c.city, c.county && `${c.county} Co.`].filter(Boolean).join(' · ')}{c.drive_minutes ? ` · ${c.drive_minutes} min` : ''}</small>
        <span className="steptags"><span className="pill">{FIT[c.music_fit] ?? c.music_fit}</span><span className={'pill ' + tone}>{sl}</span>
          {c.denomination && <span className="pill">{c.denomination}</span>}{shared(c.id) > 0 && <span className="pill ok">Shared {shared(c.id)}×</span>}</span>
        {c.follow_up_on && <small className={due(c) ? 'flag' : ''}>Follow up {fmtDate(c.follow_up_on, { month: 'short', day: 'numeric' })}</small>}
      </button> })}</div>
      {churches.rows.length === 0 && <Empty>No churches yet. The Tenth Avenue North plan starts this list on Oct 5 — add them here as you find them.</Empty>}
      {churches.rows.length > 0 && list.length === 0 && <Empty>No churches match these filters.</Empty>}
      {churches.error && <p className="msg error">{churches.error}</p>}
    </Panel>
    {adding && <DetailPopup title="Add a church" kicker="CHURCH & FAITH PARTNER NETWORK" onClose={() => setAdding(false)}><ChurchForm onDone={() => setAdding(false)}/></DetailPopup>}
    {open && <DetailPopup title={open.name} kicker={[open.city, FIT[open.music_fit]].filter(Boolean).join(' · ')} onClose={() => setOpenId(null)}>
      <ChurchDetail c={open} log={outreach.rows.filter(o => o.partner_id === open.id)} events={christianShows} allEvents={events}/>
    </DetailPopup>}
  </>
}

function ChurchDetail({ c, log, events, allEvents }: { c: Church; log: Outreach[]; events: Event[]; allEvents: Event[] }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <ChurchForm c={c} onDone={() => setEditing(false)}/>
  const title = (id: string | null) => allEvents.find(e => e.id === id)?.title ?? 'General'
  return <>
    <span className="steptags"><span className="pill">{(STATUS[c.status] ?? [c.status])[0]}</span>{c.denomination && <span className="pill">{c.denomination}</span>}
      {c.approx_size && <span className="pill">{c.approx_size} people</span>}{c.has_youth && <span className="pill">Youth group</span>}{c.has_college && <span className="pill">College group</span>}{c.has_womens && <span className="pill">Women’s ministry</span>}</span>
    <People c={c}/>
    {c.preferred_contact && <p><b>Best way to reach them:</b> {c.preferred_contact}</p>}
    <p className="chlinks">{c.website && <a href={c.website} target="_blank" rel="noreferrer">Website</a>}{c.facebook && <a href={c.facebook} target="_blank" rel="noreferrer">Facebook</a>}{c.instagram && <a href={c.instagram} target="_blank" rel="noreferrer">Instagram</a>}</p>
    {c.association && <p><b>Association:</b> {c.association}</p>}
    {c.notes && <p className="note">{c.notes}</p>}
    {c.source && <small className="muted">Found via: {c.source}</small>}
    <div className="actions"><button className="linkbtn" onClick={() => setEditing(true)}>Edit church</button></div>
    <h3 className="minihead">Outreach by show</h3>
    {log.length ? <ul className="chlog">{log.map(o => <li key={o.id}><b>{fmtDate(o.contacted_on, { month: 'short', day: 'numeric' })} · {title(o.event_id)}</b>
      <span>{[o.channel, o.contact_person, o.what_sent].filter(Boolean).join(' · ')}</span>
      <span className="steptags"><span className={'pill ' + (o.response === 'SHARED' ? 'ok' : o.response === 'DECLINED' ? 'red' : '')}>{RESPONSE[o.response]}</span>
        {o.shared_how && <span className="pill">{o.shared_how}</span>}{o.promo_code && <span className="pill">Code {o.promo_code}</span>}{o.tickets_attributed != null && <span className="pill ok">{o.tickets_attributed} tickets</span>}</span>
      {o.notes && <small>{o.notes}</small>}</li>)}</ul> : <p className="note">Not contacted yet.</p>}
    {c.status !== 'DO_NOT_CONTACT' && <LogOutreach c={c} events={events}/>}
  </>
}

function LogOutreach({ c, events }: { c: Church; events: Event[] }) {
  const [f, setF] = useState({ event_id: events[0]?.id ?? '', channel: 'Email', contact_person: '', what_sent: 'Church media kit', response: 'NONE', shared_how: '', promo_code: '', tickets: '', follow_up_on: '', notes: '' })
  const { busy, err, run } = useAsync()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const save = (e: FormEvent) => { e.preventDefault(); run(async () => {
    const row = { partner_id: c.id, event_id: f.event_id || null, channel: f.channel, contact_person: f.contact_person || null, what_sent: f.what_sent || null, response: f.response,
      shared_how: f.shared_how || null, promo_code: f.promo_code || null, tickets_attributed: f.tickets ? Number(f.tickets) : null, follow_up_on: f.follow_up_on || null, notes: f.notes || null }
    const { error } = await supabase!.from('partner_outreach').insert(row); if (error) throw error
    const patch = { last_contact: todayISO(), follow_up_on: f.follow_up_on || null,
      status: f.response === 'SHARED' ? 'PARTNER' : f.response === 'WILL_SHARE' || f.response === 'REPLIED' ? (c.status === 'PARTNER' ? 'PARTNER' : 'FRIENDLY') : c.status === 'PROSPECT' ? 'CONTACTED' : c.status }
    const { error: e2 } = await supabase!.from('church_partners').update(patch).eq('id', c.id); if (e2) throw e2
    await logChange('church_partner', c.id, `Church outreach logged: ${c.name} (${RESPONSE[f.response]})`, null, row, 'KY_OPRY')
    setF({ ...f, contact_person: '', response: 'NONE', shared_how: '', promo_code: '', tickets: '', follow_up_on: '', notes: '' })
  }) }
  return <form className="addform chform" onSubmit={save}>
    <h3 className="minihead">Log a contact</h3>
    <label>Show<select value={f.event_id} onChange={set('event_id')}><option value="">General (no show)</option>{events.map(e => <option key={e.id} value={e.id}>{e.title} · {fmtDate(e.event_date, { month: 'short', day: 'numeric' })}</option>)}</select></label>
    <label>How<select value={f.channel} onChange={set('channel')}>{['Email', 'Phone', 'Visit', 'Facebook message', 'Mailed kit'].map(x => <option key={x}>{x}</option>)}</select></label>
    <label>Who we talked to<input value={f.contact_person} onChange={set('contact_person')}/></label>
    <label>What we sent<input value={f.what_sent} onChange={set('what_sent')}/></label>
    <label>Their answer<select value={f.response} onChange={set('response')}>{Object.entries(RESPONSE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    <label>How they shared<input value={f.shared_how} onChange={set('shared_how')} placeholder="slide, bulletin, pulpit, Facebook…"/></label>
    <label>Their ticket code<input value={f.promo_code} onChange={set('promo_code')}/></label>
    <label>Tickets from them<input type="number" min="0" value={f.tickets} onChange={set('tickets')}/></label>
    <label>Follow up on<input type="date" value={f.follow_up_on} onChange={set('follow_up_on')}/></label>
    <label className="grow">Notes<input value={f.notes} onChange={set('notes')}/></label>
    <button disabled={busy}>Save</button>
    {err && <p className="msg error">{err}</p>}
  </form>
}

const BLANK = { name: '', city: '', county: '', drive_minutes: '', denomination: '', association: '', approx_size: '', music_fit: 'UNKNOWN', has_youth: false, has_college: false, has_womens: false,
  website: '', facebook: '', instagram: '', office_email: '', office_phone: '', pastor: '', pastor_email: '', worship_leader: '', worship_email: '', youth_leader: '', youth_email: '',
  comms_contact: '', comms_email: '', womens_contact: '', womens_email: '', preferred_contact: '', status: 'PROSPECT', source: '', follow_up_on: '', notes: '' }
type Form = typeof BLANK

function ChurchForm({ c, onDone }: { c?: Church; onDone: () => void }) {
  const [f, setF] = useState<Form>(c ? Object.fromEntries(Object.keys(BLANK).map(k => [k, (c as Record<string, unknown>)[k] ?? (typeof BLANK[k as keyof Form] === 'boolean' ? false : '')])) as Form : BLANK)
  const { busy, err, run } = useAsync()
  const txt = (k: keyof Form, label: string, type = 'text') => <label>{label}<input type={type} value={String(f[k] ?? '')} onChange={e => setF({ ...f, [k]: e.target.value })}/></label>
  const box = (k: keyof Form, label: string) => <label className="chk"><input type="checkbox" checked={!!f[k]} onChange={e => setF({ ...f, [k]: e.target.checked })}/> {label}</label>
  const save = (e: FormEvent) => { e.preventDefault(); run(async () => {
    const row = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : k === 'drive_minutes' ? Number(v) : v]))
    const { error } = c ? await supabase!.from('church_partners').update({ ...row, updated_at: new Date().toISOString() }).eq('id', c.id) : await supabase!.from('church_partners').insert(row)
    if (error) throw error
    await logChange('church_partner', c?.id ?? f.name, c ? `Church updated: ${f.name}` : `Church added: ${f.name}`, c ?? null, row, 'KY_OPRY')
    onDone()
  }) }
  return <form className="chform" onSubmit={save}>
    <fieldset><legend>The church</legend>
      <label className="grow">Name<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })}/></label>
      {txt('city', 'Town')}{txt('county', 'County')}{txt('drive_minutes', 'Minutes from the Opry', 'number')}
      <label>Denomination<select value={f.denomination} onChange={e => setF({ ...f, denomination: e.target.value })}><option value="">—</option>{DENOMS.map(d => <option key={d}>{d}</option>)}</select></label>
      {txt('association', 'Association / district')}
      <label>About how big<select value={f.approx_size} onChange={e => setF({ ...f, approx_size: e.target.value })}><option value="">Not sure</option>{['Under 100', '100–300', '300–800', '800+'].map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Music<select value={f.music_fit} onChange={e => setF({ ...f, music_fit: e.target.value })}>{Object.entries(FIT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {box('has_youth', 'Youth group')}{box('has_college', 'College group')}{box('has_womens', 'Women’s ministry')}
    </fieldset>
    <fieldset><legend>Who to reach</legend>
      {txt('office_email', 'Office email', 'email')}{txt('office_phone', 'Office phone', 'tel')}
      {txt('pastor', 'Pastor')}{txt('pastor_email', 'Pastor email', 'email')}{txt('worship_leader', 'Worship / music leader')}{txt('worship_email', 'Worship email', 'email')}
      {txt('youth_leader', 'Youth leader')}{txt('youth_email', 'Youth email', 'email')}{txt('comms_contact', 'Announcements / communications')}{txt('comms_email', 'Communications email', 'email')}
      {txt('womens_contact', 'Women’s ministry')}{txt('womens_email', 'Women’s ministry email', 'email')}{txt('preferred_contact', 'Best way to reach them')}
    </fieldset>
    <fieldset><legend>Online &amp; notes</legend>
      {txt('website', 'Website', 'url')}{txt('facebook', 'Facebook page', 'url')}{txt('instagram', 'Instagram', 'url')}
      <label>Status<select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {txt('follow_up_on', 'Follow up on', 'date')}{txt('source', 'Where we found them')}
      <label className="grow">Notes<textarea rows={3} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })}/></label>
    </fieldset>
    <div className="actions"><button disabled={busy}>{c ? 'Save changes' : 'Add church'}</button><button type="button" className="linkbtn" onClick={onDone}>Cancel</button></div>
    {err && <p className="msg error">{err}</p>}
  </form>
}
