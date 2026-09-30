import { useState, type FormEvent } from 'react'
import { Copy, ExternalLink, Plus } from 'lucide-react'
import {
  BU_LABEL, capacityOf, daysUntil, fmtDate, insertRow, isWaiting, money, saveRow, showState, useTable,
  type BusinessUnit, type Decision, type Event, type Task,
} from './lib/data'
import { whoLabel } from './lib/data'
import { CopyBox, Empty, Panel, useAsync } from './components'
import { ACTION_LABEL, marketingPhase, recommendAction } from './marketing'
import { DayOfShowReport } from './dayofshow'
import { ownersSummary, type Improvement } from './requests'
import { Envelope } from './envelope'

type Campaign = { id: string; event_id: string | null; platform: string; name: string; status: string; notes: string | null
  snaps: { captured_at: string; spend: number | null; link_clicks: number | null; attributed_tickets: number | null; attributed_revenue: number | null; source: string | null; data_confidence: string | null; known_issue: string | null }[] }
type Settlement = { event_id: string; final_tickets: number | null; final_gross: number | null; total_expenses: number | null; lessons: string | null }
const last = (c: Campaign) => [...(c.snaps ?? [])].sort((a, b) => b.captured_at.localeCompare(a.captured_at))[0]
const pct = (n: number | null, d: number | null) => (n != null && d ? `${Math.round(n / d * 100)}%` : '—')

// Plain-English show report: what happened, what worked, what didn't, money, tickets, revenue, what next.
function showReport(e: Event, camps: Campaign[], s: Settlement | undefined, decisions: Decision[]) {
  const cap = capacityOf(e), d = daysUntil(e.event_date), past = d != null && d < 0
  const tickets = s?.final_tickets ?? e.tickets_sold, gross = s?.final_gross ?? e.ticket_revenue
  const spend = camps.reduce((x, c) => x + (last(c)?.spend ?? 0), 0), attr = camps.reduce((x, c) => x + (last(c)?.attributed_tickets ?? 0), 0)
  const rec = recommendAction(e, camps), state = showState(e)
  const approved = decisions.filter(x => x.event_id === e.id && x.status === 'APPROVED')
  const lines = [
    `${e.title} — ${fmtDate(e.event_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} (${BU_LABEL[e.business_unit]}, ${e.venue?.name ?? 'venue not set'})`, '',
    'WHAT HAPPENED',
    `• Tickets: ${tickets ?? 'not recorded'}${cap ? ` of ${cap} seats (${pct(tickets, cap)})` : ''}${past ? '' : ` so far, ${d} days to go`}.`,
    `• Ticket revenue (${s?.final_gross != null ? 'box office' : 'Etix'}, actual): ${money(gross)}.${e.data_confidence === 'UNCERTAIN' ? ' Not yet reconciled with a box-office report.' : ''}`,
    camps.length ? `• Ads: ${money(spend)} spent. Facebook says the ads led to about ${attr} ticket sales — their count runs high, so treat it as a rough guide, not total sales.` : '• Ads: none recorded.',
    s?.total_expenses != null && gross != null ? `• Profit: ${money(gross - s.total_expenses)} after ${money(s.total_expenses)} in expenses.` : '• Profit: not known until the costs and the settlement are entered.', '',
    'WHAT WENT WELL / WHAT DIDN’T',
    state ? `• ${state.label}: ${state.why}.` : `• Sales look ${tickets != null && cap && tickets / cap >= 0.6 ? 'healthy' : 'steady'} for the time left.`,
    spend && attr ? `• Rough ad cost per ticket: ${money(spend / attr)}.` : spend ? '• No tickets credited to the ads yet — the ad picture/video, or who sees it, may need to change.' : '',
    s?.lessons ? `• Lessons: ${s.lessons}` : '', '',
    'WHAT WAS DECIDED',
    ...(approved.length ? approved.map(a => `• ${a.decided_by} approved${a.approved_amount != null ? ` ${money(a.approved_amount)}` : ''}: ${a.title}`) : ['• None recorded for this show.']), '',
    'WHAT’S NEXT',
    past ? '• Finish the settlement and write down what we learned, so we can compare the next show to this one.' : rec ? `• My suggestion (not approved yet): ${ACTION_LABEL[rec.action] ?? rec.action} — ${rec.why}` : '• Keep going with the current plan.',
  ]
  return lines.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n')
}

// Weekly update for Clay, Barbie and Jamie. They see ticket sales every day, so it leads with what needs them:
// questions waiting on an answer, what's coming in the next two weeks, and shows that need a look. Sales are kept at
// the bottom, for the record.
type Weekly = {
  bu: BusinessUnit; date: string
  ask: { title: string; who: string; days: number | null; show: string | null }[]
  soon: { when: string; title: string; open: number; late: number; waiting: number; note: string | null }[]
  look: { title: string; why: string; suggest: string | null }[]
  done: { count: number; highlights: string[] }
  decided: { title: string; what: string; who: string | null }[]
  sales: { when: string; title: string; sold: string; pct: string; gross: string }[]
}
const clip = (t: string, n = 140) => (t.length > n ? t.slice(0, n - 1) + '…' : t)
function weeklyData(bu: BusinessUnit, events: Event[], camps: Campaign[], decisions: Decision[], tasks: Task[]): Weekly {
  const mine = (x: { business_unit: BusinessUnit }) => x.business_unit === bu || x.business_unit === 'SHARED'
  const up = events.filter(e => e.business_unit === bu && (daysUntil(e.event_date) ?? -1) >= 0 && e.show_status !== 'HOLD' && e.show_status !== 'CANCELLED')
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const today = new Date().toISOString().slice(0, 10)
  const title = (id: string | null) => events.find(e => e.id === id)?.title ?? null
  const short = (d: string | null) => fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })
  const open = (t: Task) => t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'WAITING'
  const done = tasks.filter(t => t.completed_at && t.completed_at >= weekAgo && mine(t))
  return {
    bu, date: fmtDate(today, { month: 'long', day: 'numeric', year: 'numeric' }),
    ask: decisions.filter(d => isWaiting(d) && mine(d)).map(d => ({ title: d.title, who: whoLabel(d.approver ?? 'Owners'),
      days: d.created_at ? Math.max(0, Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000)) : null, show: title(d.event_id) })),
    soon: up.filter(e => (daysUntil(e.event_date) ?? 99) <= 14).map(e => { const t = tasks.filter(k => k.event_id === e.id && open(k))
      const st = showState(e)
      return { when: short(e.event_date), title: e.title, open: t.length, late: t.filter(k => !k.catch_up && k.due_at && k.due_at.slice(0, 10) < today).length,
        waiting: t.filter(k => k.status === 'WAITING').length, note: st && st.tone === 'bad' ? st.why : null } }),
    look: up.flatMap(e => { const st = showState(e); if (!st || st.tone !== 'bad') return []
      const r = recommendAction(e, camps.filter(c => c.event_id === e.id))
      return [{ title: `${short(e.event_date)} ${e.title}`, why: st.why, suggest: r ? `${ACTION_LABEL[r.action] ?? r.action} (suggestion, not approved)` : null }] }),
    done: { count: done.length, highlights: done.filter(t => !t.source_rule_id).slice(0, 6).map(t => clip(t.title, 90)) },
    decided: decisions.filter(d => d.decided_at && d.decided_at >= weekAgo && mine(d)).map(d => ({ title: d.title,
      what: clip(d.decision?.startsWith(d.title) ? d.decision.slice(d.title.length).replace(/^[\s:—-]+/, '') : d.decision ?? d.status)
        + (d.approved_amount != null ? ` (${money(d.approved_amount)})` : ''), who: d.decided_by })),
    sales: up.map(e => { const cap = capacityOf(e)
      return { when: fmtDate(e.event_date, { month: 'short', day: 'numeric', year: '2-digit' }), title: e.title,
        sold: e.tickets_sold != null ? `${e.tickets_sold}${cap ? ` / ${cap}` : ''}` : '—', pct: pct(e.tickets_sold, cap), gross: e.ticket_revenue != null ? money(e.ticket_revenue) : '—' } }),
  }
}
function weeklyText(w: Weekly) {
  const soonLine = (s: Weekly['soon'][number]) => `• ${s.when} — ${s.title}: ${s.open ? `${s.open} steps left${s.late ? `, ${s.late} past due` : ''}${s.waiting ? `, ${s.waiting} waiting on someone` : ''}` : 'all set'}${s.note ? `. Sales: ${s.note}` : ''}.`
  return [`${BU_LABEL[w.bu]} — weekly update, ${w.date}`, '',
    `NEEDS YOUR ANSWER (${w.ask.length})`, ...(w.ask.length ? w.ask.map(a => `• ${a.title} — ${a.who}${a.show ? ` (${a.show})` : ''}${a.days ? `, waiting ${a.days} day${a.days === 1 ? '' : 's'}` : ''}`) : ['• Nothing waiting on you.']), '',
    'NEXT 2 WEEKS', ...(w.soon.length ? w.soon.map(soonLine) : ['• No shows in the next two weeks.']), '',
    ...(w.look.length ? ['SHOWS THAT NEED A LOOK', ...w.look.map(l => `• ${l.title}: ${l.why}.${l.suggest ? ` ${l.suggest}.` : ''}`), ''] : []),
    'DONE THIS WEEK', `• ${w.done.count} task${w.done.count === 1 ? '' : 's'} finished.`, ...w.done.highlights.map(h => `• ${h}`), '',
    ...(w.decided.length ? ['DECIDED THIS WEEK', ...w.decided.map(d => `• ${d.title}: ${clip(d.what, 90)}`), ''] : []),
    'FOR THE RECORD — TICKET SALES', ...w.sales.map(s => `• ${s.when} ${s.title}: ${s.sold} (${s.pct}), ${s.gross}`),
  ].join('\n')
}
function WeeklyUpdate({ w }: { w: Weekly }) {
  const [copied, setCopied] = useState(false)
  return <div className="weekly">
    <p className="wk-date">Week of {w.date}</p>
    <section className="wk-block ask"><h3>Needs your answer <b>{w.ask.length}</b></h3>
      {w.ask.length ? <ul>{w.ask.map((a, i) => <li key={i}><strong>{a.title}</strong><small>{a.who}{a.show ? ` · ${a.show}` : ''}{a.days ? ` · waiting ${a.days} day${a.days === 1 ? '' : 's'}` : ''}</small></li>)}</ul> : <p className="note">Nothing waiting on you.</p>}</section>
    <section className="wk-block"><h3>Next 2 weeks</h3>
      {w.soon.length ? <ul>{w.soon.map((s, i) => <li key={i}><strong>{s.when} · {s.title}</strong>
        <small>{s.open ? <>{s.open} steps left{s.late ? <em className="bad"> · {s.late} past due</em> : null}{s.waiting ? ` · ${s.waiting} waiting on someone` : ''}</> : 'All set'}{s.note ? <em className="bad"> · sales: {s.note}</em> : null}</small></li>)}</ul>
        : <p className="note">No shows in the next two weeks.</p>}</section>
    {w.look.length > 0 && <section className="wk-block look"><h3>Shows that need a look</h3>
      <ul>{w.look.map((l, i) => <li key={i}><strong>{l.title}</strong><small>{l.why}{l.suggest ? ` · ${l.suggest}` : ''}</small></li>)}</ul></section>}
    <section className="wk-block"><h3>Done this week <b>{w.done.count}</b></h3>
      {w.done.highlights.length ? <ul className="plain">{w.done.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul> : <p className="note">{w.done.count ? `${w.done.count} show checklist steps finished.` : 'Nothing marked done yet this week.'}</p>}</section>
    {w.decided.length > 0 && <details className="wk-block record"><summary>Decided this week ({w.decided.length})</summary>
      <ul className="wk-inner">{w.decided.map((d, i) => <li key={i}><strong>{d.title}</strong><small>{d.what}{d.who ? ` — ${d.who}` : ''}</small></li>)}</ul></details>}
    <details className="wk-block record"><summary>For the record: ticket sales ({w.sales.length} shows)</summary>
      <table className="wk-sales"><thead><tr><th>Date</th><th>Show</th><th>Sold</th><th>%</th><th>Gross</th></tr></thead>
        <tbody>{w.sales.map((s, i) => <tr key={i}><td>{s.when}</td><td>{s.title}</td><td>{s.sold}</td><td>{s.pct}</td><td>{s.gross}</td></tr>)}</tbody></table></details>
    <button className="linkbtn" onClick={() => { navigator.clipboard?.writeText(weeklyText(w)); setCopied(true); setTimeout(() => setCopied(false), 2000) }}><Copy size={15}/> {copied ? 'Copied' : 'Copy to paste into an email'}</button>
  </div>
}


export function Reports({ events, decisions, tasks, openSheet }: { events: Event[]; decisions: Decision[]; tasks: Task[]; openSheet: (id: string) => void }) {
  const camps = useTable<Campaign>('campaigns', '*, snaps:campaign_snapshots(*)', { column: 'created_at' })
  const settlements = useTable<Settlement>('settlements', '*', { column: 'event_id' })
  const improvements = useTable<Improvement>('improvements', '*', { column: 'started_on', ascending: false })
  const [bu, setBu] = useState<BusinessUnit>('KY_OPRY')
  const [rtab, setRtab] = useState<'weekly' | 'showday' | 'one' | 'changed'>('weekly')
  const [showId, setShowId] = useState(events.find(e => (daysUntil(e.event_date) ?? -1) >= 0)?.id ?? events[0]?.id ?? '')
  const ev = events.find(e => e.id === showId)
  return <>
    <section className="hero small"><p>REPORTS</p><h1>Plain-English updates for Clay and Barbie</h1>
      <span>Built from the same data as the rest of Opry Ops. Kentucky Opry and CCP are reported separately. Your private Role & Impact log is never included.</span></section>
    <div className="pagetabs" role="tablist">{([['weekly', 'Weekly update'], ['showday', 'Show-day sheets'], ['one', 'One show'], ['changed', 'What I’ve changed']] as const).map(([k, label]) =>
      <button key={k} role="tab" aria-selected={rtab === k} className={rtab === k ? 'on' : ''} onClick={() => setRtab(k)}>{label}</button>)}</div>
    {rtab === 'weekly' && <>
      <Panel kicker="WEEKLY UPDATE · FOR CLAY, BARBIE & JAMIE" title={`${BU_LABEL[bu]}: what needs you this week`} action={<div className="tabs">{(['KY_OPRY', 'CCP'] as BusinessUnit[]).map(b => <button key={b} className={bu === b ? 'on' : ''} onClick={() => setBu(b)}>{BU_LABEL[b]}</button>)}</div>}>
        {events.some(e => e.business_unit === bu && (daysUntil(e.event_date) ?? -1) >= 0) ? <WeeklyUpdate w={weeklyData(bu, events, camps.rows, decisions, tasks)}/> : <Empty>No upcoming {BU_LABEL[bu]} shows in Opry Ops yet.</Empty>}
      </Panel>
    </>}
    {rtab === 'showday' && <>
      <Panel kicker="FOR RACHEL YATES · 10 DAYS BEFORE EACH SHOW" title="Day-of-Show sheets & Walmart lists">
        <p className="note">the day-of-show lead runs show day and is the artist’s runner. Walmart: the day-of-show lead on Kentucky Opry-only weekends; the office admin does both when a CCP outside-venue show is the same weekend. Tap a show to open its sheet.</p>
        <DayOfShowReport events={events} tasks={tasks} openSheet={openSheet}/>
      </Panel>
    </>}
    {rtab === 'one' && <>
      <Panel kicker="SHOW REPORT" title="One show, start to finish" action={<select className="bucketsel" value={showId} onChange={e => setShowId(e.target.value)} aria-label="Show">
        {events.map(e => <option key={e.id} value={e.id}>{fmtDate(e.event_date, { month: 'short', day: 'numeric', year: '2-digit' })} {e.title}</option>)}</select>}>
        {ev ? <CopyBox text={showReport(ev, camps.rows.filter(c => c.event_id === ev.id), settlements.rows.find(s => s.event_id === ev.id), decisions)}/> : <Empty>Pick a show.</Empty>}
      </Panel>
    </>}
    {rtab === 'changed' && <>
      <Panel kicker="FOR CLAY, BARBIE & JAMIE" title="What I’ve changed, and how it’s going"><CopyBox text={ownersSummary(improvements.rows)}/></Panel>
    </>}
  </>
}

// ---------- My Role (private) ----------
type Entry = { id: string; entry_date: string; area: string | null; work: string; need: string | null; what_i_did: string | null; evidence_or_result: string | null
  business_impact: string | null; hours: number | null; status: string | null; next: string | null; include_in_owner_report: boolean }
type TimeEntry = { started_at: string; ended_at: string | null }
export function MyRole() {
  const entries = useTable<Entry>('role_impact_entries', '*', { column: 'entry_date', ascending: false })
  const time = useTable<TimeEntry>('time_entries', 'started_at, ended_at', { column: 'started_at', ascending: false })
  const [work, setWork] = useState(''); const [did, setDid] = useState(''); const [result, setResult] = useState(''); const [impact, setImpact] = useState(''); const [area, setArea] = useState('Systems')
  const { busy, err, run } = useAsync()
  const hours = (days: number) => time.rows.filter(t => new Date(t.started_at).getTime() > Date.now() - days * 86400000)
    .reduce((h, t) => h + ((t.ended_at ? new Date(t.ended_at).getTime() : Date.now()) - new Date(t.started_at).getTime()) / 3600000, 0)
  const add = (e: FormEvent) => { e.preventDefault(); run(async () => {
    await insertRow('role_impact_entries', { area, work: work.trim(), what_i_did: did.trim() || null, evidence_or_result: result.trim() || null, business_impact: impact.trim() || null, status: 'Done', source: 'Opry Ops' }, 'Role & Impact entry added', '00000000-0000-0000-0000-000000000000')
    setWork(''); setDid(''); setResult(''); setImpact('')
  }) }
  return <>
    <section className="hero small"><p>MY ROLE & IMPACT · PRIVATE</p><h1>What you’ve built and what it changed</h1>
      <span>Not a task list. Systems built, problems solved and results — so the value of the role is on record. Only you can see this.</span></section>
    <div className="stats three"><div><small>Clocked this week</small><b>{hours(7).toFixed(1)} h</b></div><div><small>Clocked last 30 days</small><b>{hours(30).toFixed(1)} h</b></div><div><small>Impact entries</small><b>{entries.rows.length}</b></div></div>
    <Panel kicker="ADD AN ENTRY" title="Something worth recording">
      <form className="addform" onSubmit={add}>
        <label>Area<select value={area} onChange={e => setArea(e.target.value)}>{['Systems', 'Marketing', 'Ticketing', 'CRM', 'Show operations', 'Reporting', 'Admin', 'Revenue'].map(a => <option key={a}>{a}</option>)}</select></label>
        <label className="grow">What you built or solved<input value={work} onChange={e => setWork(e.target.value)} placeholder="e.g. Show Workspace with automatic checklists"/></label>
        <label className="grow">What you did<input value={did} onChange={e => setDid(e.target.value)}/></label>
        <label className="grow">Evidence / result<input value={result} onChange={e => setResult(e.target.value)} placeholder="numbers if you have them"/></label>
        <label className="grow">Why it matters to the business<input value={impact} onChange={e => setImpact(e.target.value)}/></label>
        <button className="primary" disabled={busy || !work.trim()}><Plus size={16}/> Add</button>
      </form>
      {err && <p className="msg error">{err}</p>}
    </Panel>
    <Panel title="Log">
      {entries.rows.map(r => <div className="mitem" key={r.id}>
        <strong>{r.work}</strong>
        <small>{[fmtDate(r.entry_date, { month: 'short', day: 'numeric', year: 'numeric' }), r.area, r.status, r.hours && `${r.hours} h`].filter(Boolean).join(' · ')}</small>
        {r.what_i_did && <small><b>Did:</b> {r.what_i_did}</small>}
        {r.evidence_or_result && <small><b>Result:</b> {r.evidence_or_result}</small>}
        {r.business_impact && <small><b>Impact:</b> {r.business_impact}</small>}
        <label className="inline-check"><input type="checkbox" checked={r.include_in_owner_report} onChange={e => run(() => saveRow('role_impact_entries', { id: r.id }, { include_in_owner_report: e.target.checked }, 'Owner-report visibility', r.id).catch(() => {}))}/> OK to share with Clay and Barbie</label>
      </div>)}
      {entries.rows.length === 0 && <Empty>No entries yet. This log is just for you.</Empty>}
    </Panel>
  </>
}

// ---------- Inbox (Communications) ----------
type Comm = { id: string; subject: string | null; from_address: string | null; snippet: string | null; last_message_at: string | null; state: string | null; last_from_me: boolean | null; view_url: string | null; event_id: string | null; urgency: string | null; urgency_reason: string | null; suggested_action: string | null; is_unread: boolean | null }
type Sync = { system: string; status: string | null; last_success_at: string | null; metadata: Record<string, unknown> }
const STATES: [string, string][] = [['NEEDS_REPLY', 'Needs my reply'], ['WAITING', 'Waiting on them'], ['STALE', 'Follow up (no reply 2+ days)'], ['FYI', 'Just for reference (no reply needed)'], ['RESOLVED', 'Resolved']]
export function Inbox({ events }: { events: Event[] }) {
  const comms = useTable<Comm>('communications', '*', { column: 'last_message_at', ascending: false })
  const sync = useTable<Sync>('integration_sync_status', '*', { column: 'system' })
  const [tab, setTab] = useState('NEEDS_REPLY')
  const { run } = useAsync()
  // Sent and no answer: amber at 2 days, red at 5. (Emails waiting on a person/task we already track still show their age.)
  const waitDays = (c: Comm) => c.last_message_at ? Math.floor((Date.now() - new Date(c.last_message_at).getTime()) / 86400000) : 0
  const stale = (c: Comm) => c.state === 'WAITING' && waitDays(c) >= 2
  const inTab = (c: Comm) => tab === 'STALE' ? stale(c) : c.state === tab
  const gmail = sync.rows.find(s => s.system.startsWith('Gmail'))
  // Same ranking as everywhere: mail about the soonest show first (mail not tied to a show counts as "now"), then urgency.
  const URGS = ['URGENT', 'TODAY', 'THIS_WEEK', 'FYI'], now = new Date().toLocaleDateString('en-CA')
  const whenOf = (c: Comm) => (c.event_id && events.find(e => e.id === c.event_id)?.event_date) || now
  const byShowThenUrgency = (a: Comm, b: Comm) => whenOf(a).localeCompare(whenOf(b)) || URGS.indexOf(a.urgency ?? 'THIS_WEEK') - URGS.indexOf(b.urgency ?? 'THIS_WEEK')
  const setState = (c: Comm, state: string) => run(() => saveRow('communications', { id: c.id }, { state, needs_reply: state === 'NEEDS_REPLY', state_set_by: 'RACHEL' }, `Email marked ${state}`, c.id))
  return <>
    <section className="hero small"><p>INBOX · WORK EMAIL</p><h1>Email that needs you</h1>
      <span>Opry Ops reads and sorts; it never sends. Replies are written in Gmail and you press Send.</span></section>
    <div className="modebar"><div className="tabs">{STATES.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} ({comms.rows.filter(c => k === 'STALE' ? stale(c) : c.state === k).length})</button>)}</div></div>
    <Panel title={STATES.find(s => s[0] === tab)?.[1] ?? ''}>
      <div className="envgrid">{comms.rows.filter(inTab).sort(byShowThenUrgency).map(c => <Envelope key={c.id} subject={c.subject} from={c.from_address}
        when={c.last_message_at ? fmtDate(c.last_message_at, { month: 'short', day: 'numeric' }) : null} urgency={c.urgency} reason={c.state === 'WAITING' && waitDays(c) >= 2 ? `${waitDays(c) >= 5 ? '⚠ ' : ''}No reply in ${waitDays(c)} days — time to follow up. ${c.urgency_reason ?? c.snippet ?? ''}` : (c.urgency_reason ?? c.snippet)}
        next={c.suggested_action} unread={c.is_unread} show={c.event_id ? events.find(e => e.id === c.event_id)?.title : null}>
        {c.view_url && <a className="btn primary" href={c.view_url} target="_blank" rel="noreferrer">Open / reply in Gmail <ExternalLink size={15}/></a>}
        {STATES.filter(([k]) => k !== 'STALE' && k !== c.state).map(([k, l]) => <button key={k} className="btn secondary small" onClick={() => setState(c, k)}>{l}</button>)}
      </Envelope>)}</div>
      {comms.rows.filter(inTab).length === 0 && <Empty>Nothing here — inbox zero for this tab. ★</Empty>}
    </Panel>
    <Panel kicker="CONNECTION" title="Where this comes from">
      {gmail ? <p className="note">Gmail (person@example.com and person@example.com are both read; an email that reaches both shows once) — last checked {fmtDate(gmail.last_success_at, { month: 'short', day: 'numeric' })}. {String(gmail.metadata?.note ?? '')}</p> : <Empty>Gmail hasn’t been synced yet.</Empty>}
      <p className="note">person@example.com still needs its own connection — see Open Questions. Ask Claude to “sync my work email” to refresh.</p>
    </Panel>
  </>
}
