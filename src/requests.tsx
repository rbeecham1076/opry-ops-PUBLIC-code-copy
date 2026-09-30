import { useMemo, useState, type FormEvent } from 'react'
import { Copy, Plus, Send } from 'lucide-react'
import { addDecision, capacityOf, daysUntil, fmtDate, insertRow, money, saveRow, showState, todayISO, useTable, type BusinessUnit, type Event } from './lib/data'
import { whoLabel } from './lib/data'
import { CopyBox, Empty, Panel, useAsync } from './components'

// ---------- Ask for something (plain English, mostly filled in) ----------
// Clay and Barbie are old-school, Jamie knows a little marketing: every request says what, why, what it should do,
// and how we'll know it worked — in everyday words. Rach adds a short note. Nothing is sent: copy it, or save it to Approvals.

type Kind = 'BUDGET' | 'PURCHASE' | 'TOOL' | 'PROCESS' | 'QUESTION' | 'OTHER'
const TYPES: { kind: Kind; label: string; who: string; hint: string }[] = [
  { kind: 'BUDGET', label: 'Ad money for a show', who: 'Jamie', hint: 'Pick the show — how it’s selling fills in for you.' },
  { kind: 'PURCHASE', label: 'Something to buy', who: 'Barbie', hint: 'Supplies, equipment, signs, a one-time cost.' },
  { kind: 'TOOL', label: 'A new tool or service', who: 'Owners / Jamie', hint: 'A program, app or service that saves time.' },
  { kind: 'PROCESS', label: 'A better way to do something', who: 'Owners / Jamie', hint: 'Changing how we handle a job.' },
  { kind: 'QUESTION', label: 'Just a question', who: 'Owners / Jamie', hint: 'You need an answer, not money.' },
]
const WHO = ['Jamie', 'Clay', 'Barbie', 'Owners / Jamie']
const GREET: Record<string, string> = { Jamie: 'Jamie', Clay: 'Clay', Barbie: 'Barbie', 'Owners / Jamie': 'Clay, Barbie and Jamie' }
const addDays = (n: number) => { const d = new Date(todayISO() + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

function salesLine(e: Event) {
  const cap = capacityOf(e), sold = e.tickets_sold, d = daysUntil(e.event_date)
  if (sold == null || !cap) return `${e.title} is ${d} days away. I don’t have a ticket count yet.`
  const slow = showState(e)?.tone === 'bad'
  return `${e.title} has ${sold} of ${cap} seats sold (${Math.round(sold / cap * 100)}%) with ${d} days to go${slow ? ' — that’s slower than it should be' : ''}.`
}
function fill(kind: Kind, e?: Event) {
  const cap = e ? capacityOf(e) : null, sold = e?.tickets_sold ?? null
  const more = cap && sold != null ? Math.max(0, Math.round(cap * 0.8) - sold) : null
  switch (kind) {
    case 'BUDGET': return {
      title: e ? `Ad money for ${e.title}` : 'Ad money for a show',
      why: e ? salesLine(e) : '',
      goal: more ? `Sell about ${more} more tickets before show night (that gets us to 80% full).` : 'Keep ticket sales moving right up to show night.',
      measure: 'I’ll compare ticket sales in Etix before and after the ads start, and tell you what the ads cost for each ticket sold.',
      check: e?.event_date ? (() => { const d = new Date(e.event_date + 'T12:00:00'); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10) })() : addDays(14) }
    case 'PURCHASE': return { title: '', why: '', goal: '', measure: 'I’ll keep the receipt with the show file and tell you whether it did the job.', check: addDays(30) }
    case 'TOOL': return { title: '', why: 'Right now this takes about __ hours a week by hand.', goal: 'Save time and cut down on mistakes.',
      measure: 'I’ll track how long the job takes for a month before and after, and tell you the hours saved.', check: addDays(30) }
    case 'PROCESS': return { title: '', why: '', goal: '', measure: 'I’ll try it for 4 weeks, compare it to how things went before, and tell you honestly whether it helped.', check: addDays(28) }
    default: return { title: '', why: '', goal: '', measure: '', check: '' }
  }
}

export function letterText(f: { who: string; note: string; title: string; amount: string; why: string; goal: string; measure: string; check: string; kind: Kind }) {
  const ask = f.kind === 'QUESTION' ? 'My question' : 'What I’m asking for'
  return [`Hi ${GREET[f.who] ?? f.who},`, f.note.trim() && ['', f.note.trim()].join('\n'), '',
    `${ask}: ${f.title.trim() || '—'}${f.amount ? ` — ${money(Number(f.amount))}` : ''}`,
    f.why.trim() && `Why: ${f.why.trim()}`,
    f.goal.trim() && `What it should do: ${f.goal.trim()}`,
    f.measure.trim() && `How we’ll know it worked: ${f.measure.trim()}`,
    f.check && f.kind !== 'QUESTION' && `I’ll report back by ${fmtDate(f.check, { weekday: 'long', month: 'long', day: 'numeric' })}.`,
    '', 'Thank you,', 'Rach'].filter((l): l is string => typeof l === 'string').join('\n').replace(/\n{3,}/g, '\n\n')
}

export function RequestBuilder({ events }: { events: Event[] }) {
  const upcoming = useMemo(() => events.filter(e => (daysUntil(e.event_date) ?? -1) >= 0), [events])
  const [kind, setKind] = useState<Kind>('BUDGET')
  const [eventId, setEventId] = useState('')
  const ev = events.find(e => e.id === eventId)
  const [f, setF] = useState(() => ({ who: 'Jamie', note: '', amount: '', ...fill('BUDGET') }))
  const [copied, setCopied] = useState(false)
  const { busy, err, run } = useAsync()
  const [saved, setSaved] = useState(false)
  const pick = (k: Kind, e?: Event) => { const t = TYPES.find(x => x.kind === k)!; setKind(k); setSaved(false); setF(p => ({ ...p, who: t.who, ...fill(k, e) })) }
  const set = (k: keyof typeof f) => (v: string) => { setSaved(false); setF(p => ({ ...p, [k]: v })) }
  const text = letterText({ ...f, kind })
  const save = (e: FormEvent) => { e.preventDefault(); run(async () => {
    await addDecision({ title: f.title.trim(), kind, approver: f.who, why: f.why.trim() || null, goal: f.goal.trim() || null,
      success_measure: f.measure.trim() || null, check_on: kind === 'QUESTION' ? null : f.check || null, note: f.note.trim() || null,
      recommendation: kind === 'QUESTION' ? null : f.goal.trim() || f.title.trim(), recommended_amount: f.amount ? Number(f.amount) : null,
      event_id: ev?.id ?? null, business_unit: (ev?.business_unit ?? 'SHARED') as BusinessUnit, source: 'Request from Rach (Opry Ops)' })
    setSaved(true)
  }) }
  return <form className="request" onSubmit={save}>
    <div className="rolechips" role="group" aria-label="What kind of request">
      {TYPES.map(t => <button type="button" key={t.kind} className={kind === t.kind ? 'on' : ''} onClick={() => pick(t.kind, ev)}>{t.label}</button>)}
    </div>
    <p className="note">{TYPES.find(t => t.kind === kind)?.hint} Everything below is filled in for you — change anything you like.</p>
    <div className="addform">
      <label>Show (optional)<select value={eventId} onChange={e => { setEventId(e.target.value); pick(kind, events.find(x => x.id === e.target.value)) }}>
        <option value="">—</option>{upcoming.map(e => <option key={e.id} value={e.id}>{fmtDate(e.event_date, { month: 'short', day: 'numeric' })} {e.title}</option>)}</select></label>
      <label>Who decides<select value={f.who} onChange={e => set('who')(e.target.value)}>{WHO.map(w => <option key={w} value={w}>{whoLabel(w)}</option>)}</select></label>
      {kind !== 'QUESTION' && <label>Amount $<input value={f.amount} onChange={e => set('amount')(e.target.value)} inputMode="decimal" placeholder="optional"/></label>}
      <label className="grow">{kind === 'QUESTION' ? 'Your question' : 'What you’re asking for'}<input value={f.title} onChange={e => set('title')(e.target.value)} placeholder={kind === 'PURCHASE' ? 'e.g. A second merch table' : 'In one line'}/></label>
    </div>
    <div className="reqgrid">
      <label>Why<textarea rows={2} value={f.why} onChange={e => set('why')(e.target.value)} placeholder="The problem, in a sentence"/></label>
      {kind !== 'QUESTION' && <label>What it should do<textarea rows={2} value={f.goal} onChange={e => set('goal')(e.target.value)} placeholder="The result you expect"/></label>}
      {kind !== 'QUESTION' && <label>How we’ll know it worked<textarea rows={2} value={f.measure} onChange={e => set('measure')(e.target.value)}/></label>}
      {kind !== 'QUESTION' && <label>I’ll report back by<input type="date" value={f.check} onChange={e => set('check')(e.target.value)}/></label>}
      <label className="wide">A short note from you (optional)<input value={f.note} onChange={e => set('note')(e.target.value)} placeholder="e.g. I think this is worth a try because…"/></label>
    </div>
    <h3 className="minihead">What they’ll read</h3>
    <pre className="recap letter">{text}</pre>
    <div className="actions">
      <button type="button" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}><Copy size={15}/> {copied ? 'Copied' : 'Copy to text or email'}</button>
      <button className="primary" disabled={busy || !f.title.trim() || saved}><Send size={15}/> {saved ? 'Saved to Approvals ✓' : 'Save to Approvals'}</button>
    </div>
    <p className="note">Saving doesn’t send anything. When they answer, record it on the Approvals page — an approved request starts its own entry on the Improvements page so you can report back.</p>
    {err && <p className="msg error">{err}</p>}
  </form>
}

// ---------- Improvements: what changed, when, and how it turned out ----------
export type Improvement = { id: string; title: string; area: string | null; started_on: string; why: string | null; what_changed: string | null; goal: string | null
  measure: string | null; baseline: string | null; check_on: string | null; result: string | null; result_on: string | null; status: string; share_with_owners: boolean; event_id: string | null }
const STATUS: Record<string, string> = { PLANNED: 'Planned', IN_PLACE: 'In place — checking', WORKED: 'Worked', MIXED: 'Partly worked', DIDNT_WORK: 'Didn’t work', STOPPED: 'Stopped' }
const AREAS = ['Tickets', 'Ads', 'Show day', 'Office', 'Money', 'Systems']
const dueCheck = (i: Improvement) => !!i.check_on && i.check_on <= todayISO() && (i.status === 'IN_PLACE' || i.status === 'PLANNED')

function ImprovementCard({ i }: { i: Improvement }) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState(i.result ?? ''); const [status, setStatus] = useState(i.status)
  const { busy, err, run } = useAsync()
  const save = () => run(() => saveRow('improvements', { id: i.id }, { result: result.trim() || null, status, result_on: result.trim() && !i.result_on ? todayISO() : i.result_on }, `Improvement result: ${i.title}`, i.id))
  return <div className={'impr s-' + i.status.toLowerCase()}>
    <div className="dtop"><span className="pill">{i.area ?? 'Office'}</span><span className="pill">Started {fmtDate(i.started_on, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      <span className={'pill ' + (i.status === 'WORKED' ? 'green' : i.status === 'DIDNT_WORK' ? 'red' : i.status === 'MIXED' ? 'amber' : '')}>{STATUS[i.status]}</span>
      {dueCheck(i) && <span className="pill amber">Time to check the result</span>}</div>
    <strong>{i.title}</strong>
    {i.why && <small><b>Why:</b> {i.why}</small>}
    {i.what_changed && <small><b>What changed:</b> {i.what_changed}</small>}
    {i.result ? <small className="res"><b>Result{i.result_on ? ` (${fmtDate(i.result_on, { month: 'short', day: 'numeric' })})` : ''}:</b> {i.result}</small>
      : i.goal && <small><b>Goal:</b> {i.goal}</small>}
    <button className="linkbtn" onClick={() => setOpen(!open)}>{open ? 'Close' : i.result ? 'Details / update' : 'Record the result'}</button>
    {open && <div className="taskdetail">
      {i.goal && <p><b>What it should do:</b> {i.goal}</p>}{i.measure && <p><b>How we’ll know:</b> {i.measure}</p>}
      {i.baseline && <p><b>Before:</b> {i.baseline}</p>}{i.check_on && <p><b>Check back:</b> {fmtDate(i.check_on, { month: 'long', day: 'numeric', year: 'numeric' })}</p>}
      <div className="addform">
        <label className="grow">What happened (numbers if you have them)<input value={result} onChange={e => setResult(e.target.value)} placeholder="e.g. Sold 42 more tickets; ads cost $6 per ticket"/></label>
        <label>How did it go?<select value={status} onChange={e => setStatus(e.target.value)}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <button className="primary" type="button" disabled={busy} onClick={save}>Save</button>
      </div>
      {err && <p className="msg error">{err}</p>}
    </div>}
  </div>
}

function AddImprovement() {
  const blank = { title: '', area: 'Office', why: '', what_changed: '', goal: '', measure: '', baseline: '', check_on: addDays(30) }
  const [f, setF] = useState(blank)
  const { busy, err, run } = useAsync()
  const add = (e: FormEvent) => { e.preventDefault(); run(async () => {
    const id = crypto.randomUUID()
    await insertRow('improvements', { id, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])), title: f.title.trim(), started_on: todayISO(), status: 'IN_PLACE' }, `Improvement logged: ${f.title}`, id)
    setF(blank) }) }
  const inp = (k: keyof typeof f, label: string, ph = '') => <label className="grow">{label}<input value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} placeholder={ph}/></label>
  return <form className="addform" onSubmit={add}>
    {inp('title', 'What did you improve?', 'e.g. Started texting ticket holders the day before')}
    <label>Area<select value={f.area} onChange={e => setF({ ...f, area: e.target.value })}>{AREAS.map(a => <option key={a}>{a}</option>)}</select></label>
    {inp('why', 'Why', 'The problem it fixes')}{inp('what_changed', 'What you changed')}{inp('goal', 'What it should do')}
    {inp('measure', 'How you’ll know it worked')}{inp('baseline', 'How it was before', 'a number if you have one')}
    <label>Check back on<input type="date" value={f.check_on} onChange={e => setF({ ...f, check_on: e.target.value })}/></label>
    <button className="primary" disabled={busy || !f.title.trim()}><Plus size={16}/> Add</button>
    {err && <p className="msg error">{err}</p>}
  </form>
}

export function ownersSummary(list: Improvement[]) {
  const shared = list.filter(i => i.share_with_owners)
  const line = (i: Improvement) => `• ${fmtDate(i.started_on, { month: 'short', day: 'numeric' })} — ${i.title}.${i.result ? ` Result: ${i.result}` : i.goal ? ` Goal: ${i.goal}` : ''}`
  return ['What I’ve changed, and how it’s going', '',
    'WORKED', ...(shared.filter(i => i.status === 'WORKED').map(line).concat(shared.some(i => i.status === 'WORKED') ? [] : ['• Nothing measured yet.'])), '',
    'IN PLACE — CHECKING RESULTS', ...(shared.filter(i => i.status === 'IN_PLACE').map(line).concat(shared.some(i => i.status === 'IN_PLACE') ? [] : ['• Nothing right now.'])),
    ...(shared.some(i => i.status === 'MIXED' || i.status === 'DIDNT_WORK') ? ['', 'DIDN’T WORK AS HOPED (AND WHAT WE LEARNED)', ...shared.filter(i => i.status === 'MIXED' || i.status === 'DIDNT_WORK').map(line)] : []),
    ...(shared.some(i => i.status === 'PLANNED') ? ['', 'PLANNED', ...shared.filter(i => i.status === 'PLANNED').map(line)] : []),
  ].join('\n')
}

export function Improvements() {
  const list = useTable<Improvement>('improvements', '*', { column: 'started_on', ascending: false }).rows
  const [area, setArea] = useState('ALL')
  const shown = list.filter(i => area === 'ALL' || i.area === area)
  const due = shown.filter(dueCheck)
  const groups: [string, Improvement[]][] = [['Time to check the result', due], ['In place — checking', shown.filter(i => i.status === 'IN_PLACE' && !dueCheck(i))],
    ['Planned', shown.filter(i => i.status === 'PLANNED' && !dueCheck(i))], ['Worked', shown.filter(i => i.status === 'WORKED')],
    ['Partly worked / didn’t work', shown.filter(i => i.status === 'MIXED' || i.status === 'DIDNT_WORK')], ['Stopped', shown.filter(i => i.status === 'STOPPED')]]
  return <>
    <section className="hero small"><p>IMPROVEMENTS</p><h1>What you’ve changed — and whether it worked</h1>
      <span>A dated record of every improvement: why, what changed, and the result. Approved requests land here on their own.</span></section>
    <Panel title="Improvements" action={<div className="rolechips">{['ALL', ...AREAS].map(a => <button key={a} className={area === a ? 'on' : ''} onClick={() => setArea(a)}>{a === 'ALL' ? `All (${list.length})` : a}</button>)}</div>}>
      {groups.filter(([, g]) => g.length).map(([label, g]) => <div key={label} className="group"><h3>{label} <span>{g.length}</span></h3>{g.map(i => <ImprovementCard key={i.id} i={i}/>)}</div>)}
      {!list.length && <Empty>Nothing logged yet — your first one goes right here.</Empty>}
    </Panel>
    <Panel kicker="LOG SOMETHING YOU DID" title="Add an improvement"><AddImprovement/></Panel>
    <Panel kicker="FOR CLAY, BARBIE & JAMIE" title="Plain-English summary"><CopyBox text={ownersSummary(list)}/></Panel>
  </>
}
