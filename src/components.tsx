import { roleOf } from './lib/roles'
import { floatNotes } from './motifs'
import { Detail, OpenShow } from './popup'
import { RecordLabel } from './neon'
import { useContext, useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Clock3, Lightbulb, Plus } from 'lucide-react'
import { Copy as CopyIcon } from 'lucide-react'
import {
  addIdea, addTask, BU_LABEL, insertRow, useTable, capacityOf, daysUntil, fmtDate, fmtTime, money, showState, STATUS_LABEL, todayISO, updateTask,
  type BusinessUnit, type Event, type Task, type TaskStatus,
} from './lib/data'

export function Panel({ kicker, title, action, children }: { kicker?: string; title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="panel">
    <div className="panelhead"><div>{kicker && <small>{kicker}</small>}<h2>{title}</h2></div>{action}</div>
    {children}
  </section>
}

export function Empty({ children }: { children: ReactNode }) { return <div className="empty"><RecordLabel size={30}/><p>{children}</p></div> }

export function useAsync() {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null)
    try { await fn() } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong. Try again.') }
    setBusy(false)
  }
  return { busy, err, run }
}

function dueLabel(t: Task) {
  if (!t.due_at) return null
  const d = daysUntil(t.due_at.slice(0, 10))
  if (d == null) return null
  if (d < 0) return <span className="pill red"><AlertTriangle size={13}/> Overdue {fmtDate(t.due_at)}</span>
  if (d === 0) return <span className="pill amber">Due today</span>
  return <span className="pill">Due {fmtDate(t.due_at)}</span>
}

export function TaskRow({ task, event, hideShow }: { task: Task; event?: Event; hideShow?: boolean }) {
  const [open, setOpen] = useState(false)
  const [waitingOn, setWaitingOn] = useState(task.waiting_on ?? '')
  const { busy, err, run } = useAsync()
  const [cheer, setCheer] = useState(false)
  const setStatus = (status: TaskStatus, extra: Partial<Task> = {}) => {
    if (status === 'COMPLETE') { setCheer(true); setTimeout(() => setCheer(false), 1600) }
    return run(() => updateTask(task, { status, ...extra }, `Status: ${STATUS_LABEL[task.status]} → ${STATUS_LABEL[status]}`))
  }
  const done = task.status === 'COMPLETE'

  return <div className={'task' + (done ? ' done' : '') + (cheer ? ' cheer' : '')}>
    <button className="check" aria-label={done ? 'Mark not done' : 'Mark done'} disabled={busy}
      onClick={e => { if (!done) floatNotes(e.currentTarget); setStatus(done ? 'OPEN' : 'COMPLETE') }}>{done && <Check size={16}/>}</button>
    <div>
      {event && !hideShow && <ShowTag event={event}/>}
      <button className="tasktitle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>} <strong>{task.title}</strong>
      </button>
      <small>{[BU_LABEL[task.business_unit], roleOf(task), task.execution_system && `Where: ${task.execution_system}`].filter(Boolean).join(' · ')}</small>
      {task.next_action && !open && <small className="next">Next: {task.next_action}</small>}
      {task.link_url && <a className="tasklink" href={task.link_url} target="_blank" rel="noreferrer">{task.link_label ?? 'Open the file'} ↗</a>}
      <Detail open={open} title={task.title} kicker={event ? `${event.title} · ${fmtDate(event.event_date, { month: 'short', day: 'numeric' })}` : 'TASK'} onClose={() => setOpen(false)}><div className="taskdetail">
        {event && <OpenShowLink event={event}/>}
        {task.next_action && <p><b>Next step:</b> {task.next_action}</p>}
        {task.waiting_on && <p><b>Waiting on / blocked by:</b> {task.waiting_on}</p>}
        {task.description && <p className="pre">{task.description}</p>}
        <div className="actions">
          {task.status !== 'IN_PROGRESS' && !done && <button onClick={() => setStatus('IN_PROGRESS')} disabled={busy}>Start</button>}
          {!done && <span className="waitbox">
            <input value={waitingOn} onChange={e => setWaitingOn(e.target.value)} placeholder="Waiting on who / what?" aria-label="Waiting on"/>
            <button onClick={() => setStatus('WAITING', { waiting_on: waitingOn || task.waiting_on })} disabled={busy}>Mark waiting</button>
          </span>}
          {task.status === 'WAITING' && <button onClick={() => setStatus('OPEN')} disabled={busy}>Back to my list</button>}
          {done && <button onClick={() => setStatus('OPEN')} disabled={busy}>Reopen</button>}
        </div>
        {err && <p className="msg error">{err}</p>}
      </div></Detail>
    </div>
    <div className="taskmeta">
      {cheer && <span className="pill green">Nice — done ✓</span>}
      {dueLabel(task)}
      {task.priority && ['Critical', 'High'].includes(task.priority) && !done && <span className={'pill ' + (task.priority === 'Critical' ? 'red' : 'amber')}>{task.priority}</span>}
      <span className={'status s-' + task.status.toLowerCase()}>{STATUS_LABEL[task.status]}</span>
    </div>
  </div>
}

export function AddTask({ events, onDone }: { events?: Event[]; onDone?: () => void }) {
  const [title, setTitle] = useState(''); const [priority, setPriority] = useState('Medium')
  const [bu, setBu] = useState<BusinessUnit>('SHARED'); const [due, setDue] = useState(''); const [eventId, setEventId] = useState('')
  const { busy, err, run } = useAsync()
  const submit = (e: FormEvent) => {
    e.preventDefault(); if (!title.trim()) return
    run(async () => {
      await addTask({ title: title.trim(), priority, business_unit: bu, due_at: due ? `${due}T12:00:00-05:00` : null, event_id: eventId || null })
      setTitle(''); setDue(''); setEventId(''); onDone?.()
    })
  }
  const upcoming = (events ?? []).filter(e => (e.event_date ?? '') >= todayISO())
  return <form className="addform" onSubmit={submit}>
    <label className="grow">New task<input value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs doing?" autoFocus/></label>
    <label>Priority<select value={priority} onChange={e => setPriority(e.target.value)}>{['Critical', 'High', 'Medium', 'Low'].map(p => <option key={p}>{p}</option>)}</select></label>
    <label>For<select value={bu} onChange={e => setBu(e.target.value as BusinessUnit)}>{Object.entries(BU_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    <label>Due<input type="date" value={due} onChange={e => setDue(e.target.value)}/></label>
    {upcoming.length > 0 && <label>Show<select value={eventId} onChange={e => setEventId(e.target.value)}><option value="">—</option>{upcoming.map(ev => <option key={ev.id} value={ev.id}>{fmtDate(ev.event_date, { month: 'short', day: 'numeric' })} {ev.title}</option>)}</select></label>}
    <button className="primary" disabled={busy || !title.trim()}><Plus size={17}/> Add task</button>
    {err && <p className="msg error">{err}</p>}
  </form>
}

export function IdeaDrop() {
  const [text, setText] = useState(''); const [wed, setWed] = useState(false); const [saved, setSaved] = useState(false)
  const { busy, err, run } = useAsync()
  const save = () => run(async () => { await addIdea(text.trim(), wed); setText(''); setWed(false); setSaved(true); setTimeout(() => setSaved(false), 2500) })
  return <section className="idea">
    <div><small><Lightbulb size={13}/> PERSONAL IDEA DROP</small><h2>Got a thought? Drop it here.</h2><p>Don’t organize it. You can sort it later on the Ideas page — the original is always kept.</p></div>
    <div>
      <div className="ideaform">
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Try a comedy night… ask Jamie about… video idea…" aria-label="Idea"/>
        <button disabled={busy || !text.trim()} onClick={save}>{saved ? 'Saved ✓' : 'Drop idea'}</button>
      </div>
      <label className="check-label"><input type="checkbox" checked={wed} onChange={e => setWed(e.target.checked)}/> Bring this up at Wednesday’s meeting</label>
      {err && <p className="msg error">{err}</p>}
    </div>
  </section>
}

// Every show gets its own color + date so its name never blends into the list around it.
const SHOW_COLORS = ['#1d4a60', '#b35c00', '#2f7a4f', '#8c2f5a', '#3e5fa8', '#7a5a12', '#0f766e', '#9a3412', '#5b4b8a', '#a1611a']
// Colors go out in show-date order, so shows that sit next to each other on any list never share one.
// (Palette alternates warm / cool. Falls back to a hash for an id that hasn't been ranked yet.)
const rank = new Map<string, string>()
export function assignShowColors(events: { id: string; event_date: string | null }[]) {
  rank.clear()
  ;[...events].sort((a, b) => (a.event_date ?? '9999').localeCompare(b.event_date ?? '9999') || a.id.localeCompare(b.id))
    .forEach((e, i) => rank.set(e.id, SHOW_COLORS[i % SHOW_COLORS.length]))
}
export function showColor(id: string) { if (rank.has(id)) return rank.get(id)!; let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return SHOW_COLORS[h % SHOW_COLORS.length] }
export function ShowTag({ event, onClick }: { event: Event; onClick?: () => void }) {
  const openShow = useContext(OpenShow)
  const go = onClick ?? (openShow ? () => openShow(event.id) : undefined)
  const Tag = go ? 'button' : 'span'
  return <Tag className="showtag" style={{ ['--sc' as string]: showColor(event.id) }} onClick={go}
    title={go ? `Open ${event.title}: details, checklist, rider, tickets and files` : undefined} type={go ? 'button' : undefined}>
    <b>{fmtDate(event.event_date, { month: 'short', day: 'numeric' })}</b><span>{event.title}</span></Tag>
}

// "Everything about this show" link for task details.
export function OpenShowLink({ event }: { event: Event }) {
  const openShow = useContext(OpenShow)
  if (!openShow) return null
  return <button type="button" className="linkbtn openshow" onClick={() => openShow(event.id)}>Everything about {event.title} →</button>
}

export function ShowCard({ event, tasks = [], onOpen }: { event: Event; tasks?: Task[]; onOpen?: () => void }) {
  const cap = capacityOf(event)
  const sold = event.tickets_sold
  const pct = cap && sold != null ? Math.min(100, Math.round((sold / cap) * 100)) : null
  const d = daysUntil(event.event_date)
  const past = d != null && d < 0
  const tone = pct == null ? '' : pct >= 80 ? 'good' : pct >= 40 ? 'ok' : 'low'
  const steps = tasks.filter(t => t.source_rule_id)
  const stepsDone = steps.filter(t => t.status === 'COMPLETE' || t.status === 'ARCHIVED').length
  const dueSoon = tasks.filter(t => t.status !== 'COMPLETE' && t.status !== 'ARCHIVED' && !t.catch_up && t.due_at && (daysUntil(t.due_at.slice(0, 10)) ?? 99) <= 7).length
  const state = showState(event)
  const Tag = onOpen ? 'button' : 'div'
  return <Tag className={'show' + (past ? ' past' : '') + (onOpen ? ' clickable' : '')} onClick={onOpen} aria-label={onOpen ? `Open ${event.title}` : undefined} style={{ ['--sc' as string]: showColor(event.id) }}>
    <div className="showdate">{event.image_url && <img src={event.image_url} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }}/>}<div><b>{fmtDate(event.event_date, { month: 'short' })}</b><span>{fmtDate(event.event_date, { day: 'numeric' })}</span></div></div>
    <div className="showbody">
      <strong>{event.title}</strong>
      {state && <span className={'pill ' + (state.tone === 'good' ? 'green' : 'red')} title={state.why}>{state.label} · {state.why}</span>}
      <small>{[fmtDate(event.event_date, { weekday: 'long' }), event.starts_at && fmtTime(event.starts_at), event.doors_at && `doors ${fmtTime(event.doors_at)}`, event.venue?.name, event.business_unit !== 'KY_OPRY' && BU_LABEL[event.business_unit]].filter(Boolean).join(' · ')}</small>
      {sold != null ? <>
        <div className={'bar ' + tone} aria-label={pct != null ? `${pct}% sold` : undefined}><span style={{ width: `${pct ?? 0}%` }}/></div>
        <small><b>{sold}</b>{cap ? ` of ${cap} seats (${pct}%)` : ' sold'} · {money(event.ticket_revenue)}</small>
      </> : <small>{event.ticketing_system ?? 'No ticket data'}</small>}
      {steps.length > 0 && <small className="stepline"><b>Checklist {stepsDone}/{steps.length}</b>{dueSoon > 0 && <span className="pill amber">{dueSoon} due this week</span>}</small>}
      {event.last_refreshed_at && <small className="source"><Clock3 size={12}/> Sales updated {fmtDate(event.last_refreshed_at, { month: 'short', day: 'numeric' })}{event.external_source?.startsWith('Etix') ? '' : ` · from ${event.external_source ?? 'unknown'}`}</small>}
    </div>
    <div className="showdays stubend">{d == null ? <small>No date</small> : past ? <><b>Played</b><small>{fmtDate(event.event_date, { month: 'short', day: 'numeric' })}</small></> : d === 0 ? <><b>Tonight</b><small>it’s showtime</small></> : <><b>{d}</b><small>day{d > 1 ? 's' : ''} to showtime</small></>}{onOpen && <span className="openhint">Open ›</span>}</div>
  </Tag>
}

export function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return <>
    <pre className="recap">{text}</pre>
    <button className="linkbtn" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}><CopyIcon size={15}/> {copied ? 'Copied' : 'Copy to paste into an email'}</button>
  </>
}

// Ticket sales come from Cymbal via Claude routines: a full refresh every weekday at 7:47 AM Central, and hourly checks
// for "Refresh now" requests during Rach's office hours (Tue, Wed, Fri 11 AM–2 PM).
type RefreshReq = { id: string; status: string; requested_at: string; done_at: string | null }
export function RefreshSales({ events }: { events: Event[] }) {
  const reqs = useTable<RefreshReq>('refresh_requests', 'id, status, requested_at, done_at', { column: 'requested_at', ascending: false }).rows
  const pending = reqs.find(r => r.status === 'PENDING')
  const last = events.map(e => e.last_refreshed_at).filter((x): x is string => !!x).sort().pop()
  const { busy, err, run } = useAsync()
  const ask = () => run(async () => { const id = crypto.randomUUID(); await insertRow('refresh_requests', { id, kind: 'TICKET_SALES' }, 'Ticket sales refresh requested', id) })
  const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' })
  return <div className="refreshbar">
    <span><b>Ticket sales</b> last updated {last ? when(last) : '—'}</span>
    <button onClick={ask} disabled={busy || !!pending}>{pending ? 'Refresh requested ✓' : 'Refresh now'}</button>
    {pending && <small>Asked {when(pending.requested_at)}. It’s picked up at the next check — hourly on Tue, Wed & Fri, 11 AM–2 PM, and every weekday at 7:47 AM. Need it this minute? Type the Etix numbers on the show’s Tickets card.</small>}
    {err && <p className="msg error">{err}</p>}
  </div>
}
