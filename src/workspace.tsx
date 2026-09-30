import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronRight, ExternalLink, Plus, ShoppingCart } from 'lucide-react'
import {
  addTask, BU_LABEL, byPriority, capacityOf, confirmCatchUp, daysUntil, fmtDate, fmtTime, HANDLING_LABEL, insertRow, isShowStep, money, saveRow, showState,
  SHOW_RENTALS, todayISO, updateEvent, updateTask, upsertFact, useShowRows, velocity,
  type Agreement, type AssetRequest, type Billing, type Doc, type Event, type MoneyLine, type Settlement, type ShowFact, type Snapshot, type Task,
} from './lib/data'
import { Empty, TaskRow, showColor, useAsync } from './components'
import { MarketingPanel } from './marketing'
import { CampaignPlan } from './campaign'
import { useCelebrate } from './celebrate'
import { VenueSheet } from './venuesheet'
import { STANDARD_TERMS } from './terms'
import { FACT_LINKS } from './links'
import { StaffProgress, floatNotes } from './motifs'
import { Detail } from './popup'
import { ROLE_SECTION, ROLES, roleOf, type Role } from './lib/roles'

// Sections in the order a show is worked, matching the paper Concert Checklist.
const SECTIONS = ['Artist & Contract', 'Money', 'Tickets', 'Marketing', 'Production', 'Hospitality', 'Wrap-up'] as const
type Section = typeof SECTIONS[number]

const open = (t: Task) => t.status !== 'COMPLETE' && t.status !== 'ARCHIVED'
const dueIn = (t: Task) => (t.due_at ? daysUntil(t.due_at.slice(0, 10)) : null)

function DueLabel({ task }: { task: Task }) {
  const d = dueIn(task)
  if (d == null || !open(task)) return null
  if (task.catch_up) return <span className="pill">Was due {fmtDate(task.due_at, { month: 'short', day: 'numeric' })}</span>
  if (d < 0) return <span className="pill red">Overdue {-d} day{d === -1 ? '' : 's'}</span>
  if (d === 0) return <span className="pill amber">Due today</span>
  if (d <= 7) return <span className="pill amber">Due in {d} day{d === 1 ? '' : 's'}</span>
  return <span className="pill">Due {fmtDate(task.due_at, { month: 'short', day: 'numeric' })}</span>
}

function WhoBadge({ task }: { task: Task }) {
  if (!task.handling || task.handling === 'RACHEL') return null
  const tone = task.handling === 'APPROVAL' ? 'violet' : task.handling === 'CLARIFY' ? 'amber' : ''
  return <span className={'pill ' + tone}>{HANDLING_LABEL[task.handling]}{task.approver ? `: ${task.approver}` : ''}</span>
}

// One checklist step: what, why, done-when, who — and tick it off.
export function StepRow({ task, compact }: { task: Task; compact?: boolean }) {
  const [openDetail, setOpen] = useState(false)
  const { busy, err, run } = useAsync()
  const done = task.status === 'COMPLETE', skipped = task.status === 'ARCHIVED'
  const set = (status: Task['status'], note: string) => run(() => updateTask(task, { status, catch_up: false }, note))
  return <div className={'step' + (done ? ' done' : '') + (skipped ? ' skipped' : '')}>
    <button className="check" aria-label={done ? 'Mark not done' : 'Mark done'} disabled={busy}
      onClick={e => { if (!done) floatNotes(e.currentTarget); set(done ? 'OPEN' : 'COMPLETE', done ? 'Reopened' : 'Done') }}>{done && <Check size={16}/>}</button>
    <div>
      <button className="tasktitle" onClick={() => setOpen(!openDetail)} aria-expanded={openDetail}>
        {openDetail ? <ChevronDown size={16}/> : <ChevronRight size={16}/>} <span>{task.title}</span>
      </button>
      {!compact && <div className="steptags"><DueLabel task={task}/><WhoBadge task={task}/>{skipped && <span className="pill">Not needed</span>}</div>}
      <Detail open={openDetail} title={task.title} kicker={task.section ? `CHECKLIST · ${task.section.toUpperCase()}` : 'CHECKLIST STEP'} onClose={() => setOpen(false)}><div className="taskdetail">
        {task.purpose && <p><b>Why it matters:</b> {task.purpose}</p>}
        {task.done_when && <p><b>Done when:</b> {task.done_when}</p>}
        {task.approver && <p><b>{task.handling === 'APPROVAL' ? 'Who approves' : task.handling === 'CLARIFY' ? 'Who to ask' : 'Who'}:</b> {task.approver}</p>}
        {task.due_at && <p><b>Target date:</b> {fmtDate(task.due_at, { weekday: 'long', month: 'long', day: 'numeric' })}</p>}
        {task.source_document && <p className="source">From: {task.source_document}</p>}
        <div className="actions">
          {!done && <button disabled={busy} onClick={() => set('COMPLETE', 'Done')}>Done</button>}
          {!skipped && !done && <button disabled={busy} onClick={() => set('ARCHIVED', 'Not needed for this show')}>Not needed for this show</button>}
          {(skipped || done) && <button disabled={busy} onClick={() => set('OPEN', 'Reopened')}>Reopen</button>}
        </div>
        {err && <p className="msg error">{err}</p>}
      </div></Detail>
    </div>
  </div>
}

function Card({ id, title, progress, children, defaultOpen = false }: { id?: string; title: string; progress?: string; children: ReactNode; defaultOpen?: boolean }) {
  return <details className="wcard" id={id} open={defaultOpen}>
    <summary><h2>{title}</h2>{progress && <span className="progress">{progress}</span>}</summary>
    <div className="wbody">{children}</div>
  </details>
}

// ---------- facts (production / hospitality / artist details) ----------
// Field names match Tiffany's OPRY Show Advance Sheet columns, so imported and typed values land in the same place.
const FACT_FIELDS: Record<string, string[]> = {
  'Artist & Contract': ['Booking agent (this show)', 'Artist fee (per contract)', 'Payable to'],
  Tickets: ['Etix status', 'Ticket prices (Etix)', 'Marketing holds', 'Promoter holds', 'Artist holds', 'Pre-sale codes'],
  Production: ['Tour manager / production contact', 'Arrival', 'Load-in', 'Soundcheck', 'Stagehands', 'Security', 'Runner', 'Backline', 'Merch seller',
    'Sound tech', 'Stage plot', 'Opening act', 'Transportation', 'Advance notes'],
  Hospitality: ['Walmart list', 'Rider: meals', 'Rider: allergies & no-gos', 'Rider: after show', 'Rider: people & rooms', 'Meal times', 'Food: buyout or catering', 'Caterer', 'Hotel', 'Rooms × nights', 'Dressing rooms'],
}
function Facts({ eventId, section, facts }: { eventId: string; section: string; facts: ShowFact[] }) {
  const { err, run } = useAsync()
  const fact = (f: string) => facts.find(x => x.section === section && x.field === f)
  const val = (f: string) => fact(f)?.value ?? ''
  const save = (f: string, v: string) => { if (v !== val(f)) run(() => upsertFact(eventId, section, f, v.trim())) }
  return <div className="facts">
    {FACT_FIELDS[section].map(f => { const long = val(f).length > 60 || f === 'Advance notes'
      return <label key={f} className={long ? 'wide' : undefined}>{f}
        {long ? <textarea defaultValue={val(f)} key={val(f)} rows={Math.min(6, Math.ceil(val(f).length / 70) + 1)} placeholder="—" onBlur={e => save(f, e.target.value)}/>
          : <input defaultValue={val(f)} key={val(f)} placeholder="—" onBlur={e => save(f, e.target.value)}/>}
        {fact(f)?.source && fact(f)!.source !== 'Entered in Opry Ops' && <small className="factsrc">from {fact(f)!.source}</small>}
        {FACT_LINKS[f] && <a className="factlink" href={FACT_LINKS[f][1]} target="_blank" rel="noreferrer">{FACT_LINKS[f][0]} <ExternalLink size={12}/></a>}
      </label> })}
    {err && <p className="msg error">{err}</p>}
  </div>
}

// ---------- Jamie's proforma: the PLAN, always labeled as one ----------
export type Proforma = {
  event_id: string; source_file: string | null; source_url: string | null; source_modified: string | null; proforma_date: string | null; show_time: string | null
  capacity: number | null; sellout_pct: number | null; projected_tickets: number | null; tiers: { tier: string; seats: number; price: number }[]
  gross_potential: number | null; gross_projected: number | null; guarantees: { payee: string; amount: number }[]; bonus_total: number | null; bonus_terms: string | null
  expenses: { item: string; amount: number }[]; presenter_profit: number | null; total_expenses: number | null; total_revenues: number | null
  net_revenue: number | null; net_is_computed: boolean | null; artist_walkout: number | null; radius_terms: string | null; other_terms: string | null; flags: string | null
}
// Break-even from the plan: tickets needed at the plan's average projected price to cover the plan's total expenses.
export function planBreakEven(p: Proforma) {
  if (!p.total_expenses || !p.gross_projected || !p.projected_tickets) return null
  return Math.ceil(p.total_expenses / (p.gross_projected / p.projected_tickets))
}
function PlanNote({ p }: { p: Proforma }) {
  return <p className="plannote">JAMIE’S PLAN (proforma) — an estimate, not actuals.{p.source_url && <> <a href={p.source_url} target="_blank" rel="noreferrer">Open the proforma <ExternalLink size={12}/></a></>}
    {p.source_modified && <> · saved {fmtDate(p.source_modified, { month: 'short', day: 'numeric', year: 'numeric' })}</>}</p>
}
function PlanFlags({ p }: { p: Proforma }) {
  return p.flags ? <p className="health bad inline"><b>Check with Jamie:</b> {p.flags}</p> : null
}
function PlanDeal({ p }: { p: Proforma }) {
  return <div className="plan">
    <PlanNote p={p}/><PlanFlags p={p}/>
    <div className="kpis">
      {p.guarantees.map(g => <div key={g.payee}><small>Guarantee — {g.payee}</small><b>{money(g.amount)}</b></div>)}
      {p.bonus_total ? <div><small>Bonus potential</small><b>{money(p.bonus_total)}</b></div> : null}
      {p.artist_walkout ? <div><small>Artist walkout</small><b>{money(p.artist_walkout)}</b></div> : null}
    </div>
    {p.bonus_terms && <p className="note"><b>Bonus terms:</b> {p.bonus_terms}</p>}
    {p.radius_terms && <p className="note"><b>Radius:</b> {p.radius_terms}</p>}
  </div>
}
function PlanMoney({ p, sold, gross }: { p: Proforma; sold: number | null; gross: number | null }) {
  const be = planBreakEven(p)
  return <div className="plan">
    <PlanNote p={p}/><PlanFlags p={p}/>
    <table className="money">
      <thead><tr><th>Plan line</th><th>Plan</th></tr></thead>
      <tbody>
        {p.guarantees.map(g => <tr key={g.payee}><td>Guarantee — {g.payee}</td><td>{money(g.amount)}</td></tr>)}
        {p.expenses.filter(x => x.amount).map(x => <tr key={x.item}><td>{x.item}</td><td>{money(x.amount)}</td></tr>)}
        {p.presenter_profit ? <tr><td>Presenter profit (built into plan)</td><td>{money(p.presenter_profit)}</td></tr> : null}
        <tr className="total"><td>Total expenses (plan)</td><td>{money(p.total_expenses)}</td></tr>
      </tbody>
    </table>
    <div className="kpis">
      <div><small>Projected gross (plan)</small><b>{money(p.gross_projected)}</b><small>{p.projected_tickets} tickets = {p.sellout_pct}% “sold out”</small></div>
      <div><small>Projected net (plan)</small><b className={(p.net_revenue ?? 0) < 0 ? 'neg' : ''}>{money(p.net_revenue)}</b>{p.net_is_computed && <small>worked out from the sheet</small>}</div>
      <div><small>Break-even (plan)</small><b>{be ? `${be} tickets` : '—'}</b>{be && sold != null && <small>{sold >= be ? `✓ passed — ${sold} sold` : `${be - sold} more to go (${sold} sold)`}</small>}</div>
      <div><small>Etix gross so far (actual)</small><b>{money(gross)}</b>{p.gross_projected && gross != null && <small>{Math.round(gross / p.gross_projected * 100)}% of the plan’s projected gross</small>}</div>
    </div>
  </div>
}
function PlanTiers({ p }: { p: Proforma }) {
  return <div className="plan">
    <h3 className="minihead">Planned price tiers (proforma)</h3>
    <table className="money"><thead><tr><th>Tier</th><th>Seats</th><th>Price</th><th>Gross if sold</th></tr></thead>
      <tbody>{p.tiers.map(t => <tr key={t.tier}><td>{t.tier}</td><td>{t.seats}</td><td>{money(t.price)}</td><td>{money(t.seats * t.price)}</td></tr>)}
        <tr className="total"><td>All seats</td><td>{p.tiers.reduce((s, t) => s + t.seats, 0)}</td><td></td><td>{money(p.gross_potential)}</td></tr></tbody></table>
    {p.other_terms && <p className="note">{p.other_terms}</p>}
  </div>
}

// ---------- contracts ----------
const AGREEMENT_STEPS = ['NOT_STARTED', 'NEGOTIATING', 'REQUESTED', 'RECEIVED', 'REVIEWED', 'WITH_CLAY', 'SIGNED', 'SENT_BACK', 'FULLY_EXECUTED', 'NOT_NEEDED']
const AGREEMENT_LABEL: Record<string, string> = { NOT_STARTED: 'Not started', NEGOTIATING: 'Deal / advance being negotiated', REQUESTED: 'Contract requested', RECEIVED: 'Contract received', REVIEWED: 'Rach checked (struck & updated)', WITH_CLAY: 'Flagged — set aside for Clay to review & sign', SIGNED: 'Clay signed', SENT_BACK: 'Sent back', FULLY_EXECUTED: 'Fully executed ✓', NOT_NEEDED: 'Not needed' }
const KIND_LABEL: Record<string, string> = { ARTIST_CONTRACT: 'Artist contract', RIDER: 'Rider', VENUE_AGREEMENT: 'Venue agreement', INSURANCE_COI: 'Insurance certificate', PROFORMA: 'Proforma' }
function Agreements({ event, rows }: { event: Event; rows: Agreement[] }) {
  const { busy, err, run } = useAsync()
  const kinds = ['PROFORMA', 'ARTIST_CONTRACT', 'RIDER']
  const today = todayISO()
  const setStatus = (kind: string, status: string) => run(async () => {
    const row = rows.find(r => r.kind === kind)
    const dates: Record<string, string> = {}
    if (status === 'RECEIVED') dates.received_at = today
    if (status === 'SIGNED') { dates.signed_at = today; dates.signed_by = 'Clay' }
    if (status === 'SENT_BACK') dates.sent_back_at = today
    if (status === 'FULLY_EXECUTED') dates.fully_executed_at = today
    if (row) await saveRow('agreements', { id: row.id }, { status, ...dates }, `${KIND_LABEL[kind]}: ${AGREEMENT_LABEL[status]}`, event.id)
    else await insertRow('agreements', { event_id: event.id, artist_id: event.artist_id, venue_id: event.venue_id, kind, status, ...dates }, `${KIND_LABEL[kind]}: ${AGREEMENT_LABEL[status]}`, event.id)
  })
  const setField = (kind: string, field: string, value: string) => run(async () => {
    const row = rows.find(r => r.kind === kind)
    if (row) await saveRow('agreements', { id: row.id }, { [field]: value || null }, `${KIND_LABEL[kind]}: ${field}`, event.id)
    else await insertRow('agreements', { event_id: event.id, artist_id: event.artist_id, venue_id: event.venue_id, kind, [field]: value || null }, `${KIND_LABEL[kind]}: ${field}`, event.id)
  })
  const contract = rows.find(r => r.kind === 'ARTIST_CONTRACT')
  return <div className="agreements">
    <details className="terms noprint">
      <summary>Our standard terms — check the contract against these</summary>
      <dl>{STANDARD_TERMS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </details>
    {kinds.map(k => { const r = rows.find(x => x.kind === k); return <div key={k} className="agrow">
      <b>{KIND_LABEL[k]}</b>
      <select value={r?.status ?? 'NOT_STARTED'} disabled={busy} onChange={e => setStatus(k, e.target.value)} aria-label={`${KIND_LABEL[k]} status`}>
        {AGREEMENT_STEPS.filter(s => k !== 'PROFORMA' || !['SIGNED', 'SENT_BACK', 'FULLY_EXECUTED'].includes(s)).map(s => <option key={s} value={s}>{AGREEMENT_LABEL[s]}</option>)}
      </select>
      <small>{[r?.received_at && `received ${fmtDate(r.received_at, { month: 'short', day: 'numeric' })}`, r?.signed_at && `signed ${fmtDate(r.signed_at, { month: 'short', day: 'numeric' })}${r.signed_by ? ` by ${r.signed_by}` : ''}`, r?.fully_executed_at && `executed ${fmtDate(r.fully_executed_at, { month: 'short', day: 'numeric' })}`].filter(Boolean).join(' · ')}</small>
    </div> })}
    <div className="facts">
      <label>100-mile radius clause<input defaultValue={contract?.radius_clause ?? ''} key={contract?.radius_clause ?? ''} placeholder="What the contract says" onBlur={e => e.target.value !== (contract?.radius_clause ?? '') && setField('ARTIST_CONTRACT', 'radius_clause', e.target.value)}/></label>
      <label>Merch fee<input defaultValue={contract?.merch_fee ?? ''} key={contract?.merch_fee ?? ''} placeholder="e.g. none / 20% soft" onBlur={e => e.target.value !== (contract?.merch_fee ?? '') && setField('ARTIST_CONTRACT', 'merch_fee', e.target.value)}/></label>
      <label>Ticket holds<input defaultValue={contract?.ticket_holds ?? ''} key={contract?.ticket_holds ?? ''} placeholder="Handbook: mark down to 10" onBlur={e => e.target.value !== (contract?.ticket_holds ?? '') && setField('ARTIST_CONTRACT', 'ticket_holds', e.target.value)}/></label>
    </div>
    {err && <p className="msg error">{err}</p>}
  </div>
}

// ---------- money ----------
const MONEY_CATEGORIES = ['Artist fee', 'Artist deposit', 'Sound', 'Hospitality / catering', 'Hotel', 'Marketing / ads', 'Insurance', 'Venue rent', 'Venue deposit', 'Other']
function Money({ event, lines, snapshot }: { event: Event; lines: MoneyLine[]; snapshot: { sold: number | null; gross: number | null } }) {
  const [cat, setCat] = useState(MONEY_CATEGORIES[0]); const [amt, setAmt] = useState(''); const [due, setDue] = useState(''); const [payee, setPayee] = useState('')
  const { busy, err, run } = useAsync()
  const add = (e: FormEvent) => { e.preventDefault(); run(async () => {
    await insertRow('financial_obligations', { event_id: event.id, business_unit: event.business_unit, obligation_type: cat, category: cat, payee: payee || null, direction: 'EXPENSE', estimated_amount: amt ? Number(amt) : null, due_at: due ? `${due}T12:00:00-05:00` : null, status: 'OPEN' }, `Money line added: ${cat}`, event.id)
    setAmt(''); setDue(''); setPayee('')
  }) }
  const best = (l: MoneyLine) => l.actual_amount ?? l.estimated_amount ?? 0
  const expenses = lines.filter(l => l.direction === 'EXPENSE').reduce((s, l) => s + best(l), 0)
  const anyEstimate = lines.some(l => l.actual_amount == null && l.estimated_amount != null)
  const avgPrice = snapshot.sold && snapshot.gross ? snapshot.gross / snapshot.sold : null
  const breakEven = avgPrice && expenses ? Math.ceil(expenses / avgPrice) : null
  const cap = capacityOf(event)
  return <>
    {lines.length > 0 ? <table className="money">
      <thead><tr><th>What</th><th>Estimate</th><th>Actual</th><th>Due</th><th>Paid</th></tr></thead>
      <tbody>{lines.map(l => <tr key={l.id}>
        <td>{l.category ?? l.obligation_type}{l.payee && <small> · {l.payee}</small>}</td>
        <td>{money(l.estimated_amount)}</td>
        <td><input className="num" defaultValue={l.actual_amount ?? ''} key={l.actual_amount ?? ''} inputMode="decimal" aria-label={`Actual ${l.category}`} placeholder="—"
          onBlur={e => { const v = e.target.value.trim(); if (v !== String(l.actual_amount ?? '')) run(() => saveRow('financial_obligations', { id: l.id }, { actual_amount: v ? Number(v) : null }, `Actual amount: ${l.category}`, event.id)) }}/></td>
        <td>{l.due_at ? fmtDate(l.due_at, { month: 'short', day: 'numeric' }) : '—'}</td>
        <td>{l.status === 'PAID' ? <span className="pill green">Paid {l.paid_at ? fmtDate(l.paid_at, { month: 'short', day: 'numeric' }) : ''}</span>
          : <button className="mini" disabled={busy} onClick={() => run(() => saveRow('financial_obligations', { id: l.id }, { status: 'PAID', paid_at: new Date().toISOString() }, `Marked paid: ${l.category}`, event.id))}>Mark paid</button>}</td>
      </tr>)}</tbody>
    </table> : <Empty>No costs entered yet. Add the artist fee and other costs to see profit and break-even.</Empty>}
    <div className="kpis">
      <div><small>Etix gross (actual, to date)</small><b>{money(snapshot.gross)}</b></div>
      <div><small>Costs {anyEstimate ? '(some estimated)' : ''}</small><b>{lines.length ? money(expenses) : '—'}</b></div>
      <div><small>Profit so far {anyEstimate ? '(estimate)' : ''}</small><b>{lines.length && snapshot.gross != null ? money(snapshot.gross - expenses) : '—'}</b></div>
      <div><small>Break-even (estimate)</small><b>{breakEven ? `${breakEven} tickets` : '—'}</b>{breakEven && cap ? <small>{Math.round(breakEven / cap * 100)}% of {cap} seats</small> : null}</div>
    </div>
    <p className="note">Profit uses actual Etix gross only — never ad-attributed revenue. Break-even uses the average ticket price so far.</p>
    <form className="addform" onSubmit={add}>
      <label>Cost<select value={cat} onChange={e => setCat(e.target.value)}>{MONEY_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Estimate $<input value={amt} onChange={e => setAmt(e.target.value)} inputMode="decimal" placeholder="0"/></label>
      <label>Paid to<input value={payee} onChange={e => setPayee(e.target.value)} placeholder="optional"/></label>
      <label>Due<input type="date" value={due} onChange={e => setDue(e.target.value)}/></label>
      <button className="primary" disabled={busy || !amt}><Plus size={16}/> Add cost</button>
    </form>
    {err && <p className="msg error">{err}</p>}
  </>
}

// ---------- marketing assets ----------
const ASSET_NEXT: Record<string, string> = { MISSING: 'REQUESTED', REQUESTED: 'RECEIVED', WAITING: 'RECEIVED', RECEIVED: 'APPROVED', APPROVED: 'MISSING', NOT_NEEDED: 'MISSING' }
const ASSET_LOOK: Record<string, [string, string]> = { MISSING: ['⚠', 'Missing'], REQUESTED: ['⏳', 'Requested'], WAITING: ['⏳', 'Waiting on artist'], RECEIVED: ['✓', 'Received'], APPROVED: ['✓✓', 'Approved'], NOT_NEEDED: ['–', 'Not needed'] }
function Assets({ eventId, rows }: { eventId: string; rows: AssetRequest[] }) {
  const { busy, err, run } = useAsync()
  return <>
    <div className="assets">{rows.map(a => { const [icon, label] = ASSET_LOOK[a.status] ?? ['?', a.status]; return (
      <button key={a.id} className={'asset a-' + a.status.toLowerCase()} disabled={busy} title="Click to move to the next step"
        onClick={() => run(() => saveRow('asset_requests', { id: a.id }, { status: ASSET_NEXT[a.status], ...(ASSET_NEXT[a.status] === 'APPROVED' ? { approved_at: todayISO(), approved_by: 'Artist team' } : {}) }, `Asset ${a.asset_type}: ${ASSET_NEXT[a.status]}`, eventId))}>
        <span className="aicon">{icon}</span><b>{a.asset_type}</b><small>{label}</small>
      </button>) })}</div>
    <p className="note">Click an item to move it along: missing → requested → received → approved by the artist team.</p>
    {err && <p className="msg error">{err}</p>}
  </>
}

// ---------- tickets ----------
function EnterSales({ event }: { event: Event }) {
  const [sold, setSold] = useState(''); const [gross, setGross] = useState('')
  const { busy, err, run } = useAsync()
  const save = (e: FormEvent) => { e.preventDefault(); run(async () => {
    await updateEvent(event, { tickets_sold: Number(sold), ticket_revenue: gross ? Number(gross.replace(/[$,]/g, '')) : event.ticket_revenue,
      last_refreshed_at: new Date().toISOString(), external_source: 'Etix (entered by Rach)' }, 'Ticket count entered from Etix')
    setSold(''); setGross('') }) }
  return <form className="addform salesentry" onSubmit={save}>
    <label>Tickets sold (from Etix)<input inputMode="numeric" value={sold} onChange={e => setSold(e.target.value)} placeholder={event.tickets_sold != null ? String(event.tickets_sold) : 'e.g. 312'}/></label>
    <label>Ticket money $<input inputMode="decimal" value={gross} onChange={e => setGross(e.target.value)} placeholder={event.ticket_revenue != null ? String(Math.round(event.ticket_revenue)) : 'e.g. 14,250'}/></label>
    <button className="primary" disabled={busy || !sold.trim() || isNaN(Number(sold))}>Save today’s numbers</button>
    {err && <p className="msg error">{err}</p>}
  </form>
}

function Tickets({ event, snaps }: { event: Event; snaps: Snapshot[] }) {
  const { err, run } = useAsync()
  const v = velocity(snaps)
  const field = (label: string, key: 'announce_date' | 'on_sale_date' | 'ticket_url', type = 'date') =>
    <label>{label}<input type={type} defaultValue={event[key] ?? ''} key={event[key] ?? ''} onBlur={e => { if (e.target.value !== (event[key] ?? '')) run(() => updateEvent(event, { [key]: e.target.value || null }, label)) }}/></label>
  return <>
    <div className="facts">{field('Announce date', 'announce_date')}{field('On-sale date', 'on_sale_date')}{field('Ticket link', 'ticket_url', 'url')}</div>
    {event.ticket_url && <a className="linkbtn" href={event.ticket_url} target="_blank" rel="noreferrer">Open ticket page <ExternalLink size={14}/></a>}
    <h3 className="minihead">Enter today’s Etix numbers</h3>
    <EnterSales event={event}/>
    <h3 className="minihead">Sales history</h3>
    {snaps.length ? <ul className="snaps">{[...snaps].reverse().slice(0, 8).map(s => <li key={s.id}>
      <b>{fmtDate(s.captured_at, { month: 'short', day: 'numeric' })}</b> {s.tickets_sold ?? '—'} sold · {money(s.gross)} <small>{s.source}</small>
    </li>)}</ul> : <Empty>No ticket counts recorded yet.</Empty>}
    <p className="note">{v ? `${v.sold >= 0 ? '+' : ''}${v.sold} tickets in the last ${v.days} days.` : 'Sales pace appears after the next ticket refresh — history started Sept 28.'}</p>
    {err && <p className="msg error">{err}</p>}
  </>
}

// ---------- settlement ----------
function Wrap({ event, s, house }: { event: Event; s?: Settlement; house?: boolean }) {
  const { err, run } = useAsync()
  const save = (field: keyof Settlement, raw: string, numeric = false) => run(() =>
    saveRow('settlements', { event_id: event.id }, { [field]: raw === '' ? null : numeric ? Number(raw) : raw }, `Settlement: ${String(field)}`, event.id))
  const num = (label: string, f: keyof Settlement) => <label>{label}<input inputMode="decimal" defaultValue={(s?.[f] as number | null) ?? ''} key={String(s?.[f] ?? '')} onBlur={e => e.target.value !== String(s?.[f] ?? '') && save(f, e.target.value.trim(), true)}/></label>
  const profit = s?.final_gross != null && s?.total_expenses != null ? s.final_gross - s.total_expenses : null
  const text = (label: string, f: keyof Settlement, wide = false) => <label className={wide ? 'wide' : undefined}>{label}<input defaultValue={(s?.[f] as string | null) ?? ''} key={String(s?.[f] ?? '')} onBlur={e => e.target.value !== String(s?.[f] ?? '') && save(f, e.target.value.trim())}/></label>
  const extras = <div className="facts">
    {num('Concessions sales', 'concessions_gross')}{text('Concessions notes', 'concessions_notes')}
    {house && SHOW_RENTALS && <>{num('Rental fee', 'rental_fee')}{text('Rented by (or “free night”)', 'renter')}</>}
  </div>
  if (house) return <>{extras}{err && <p className="msg error">{err}</p>}</>
  return <>
    {extras}
    <div className="facts">
      {num('Final tickets', 'final_tickets')}{num('Final gross (box office)', 'final_gross')}{num('Total expenses', 'total_expenses')}{num('Marketing spend (actual)', 'marketing_spend')}
      <label>Box-office report link<input type="url" defaultValue={s?.box_office_report_url ?? ''} key={s?.box_office_report_url ?? ''} onBlur={e => e.target.value !== (s?.box_office_report_url ?? '') && save('box_office_report_url', e.target.value.trim())}/></label>
      <label>Check to partners<input defaultValue={s?.check_to_partners ?? ''} key={s?.check_to_partners ?? ''} onBlur={e => e.target.value !== (s?.check_to_partners ?? '') && save('check_to_partners', e.target.value.trim())}/></label>
    </div>
    <label className="grow">Lessons for next time<textarea defaultValue={s?.lessons ?? ''} key={s?.lessons ?? ''} rows={3} onBlur={e => e.target.value !== (s?.lessons ?? '') && save('lessons', e.target.value.trim())}/></label>
    <div className="kpis"><div><small>Profit (from settlement)</small><b>{profit == null ? '—' : money(profit)}</b></div>
      <div><small>Final sell-through</small><b>{s?.final_tickets != null && capacityOf(event) ? `${Math.round(s.final_tickets / capacityOf(event)! * 100)}%` : '—'}</b></div></div>
    {err && <p className="msg error">{err}</p>}
  </>
}

// ---------- documents ----------
// Rider reader: Claude reads the rider (it can open Drive) and fills in meals, allergies, hotel and the Walmart list.
function ReadRider({ event, url }: { event: Event; url: string }) {
  const reqs = useShowRows<{ id: string; status: string; url: string | null; done_at: string | null }>('refresh_requests', event.id, 'id, status, url, done_at', '').rows.filter(r => r.url === url)
  const { busy, err, run } = useAsync()
  const pending = reqs.find(r => r.status === 'PENDING'), done = reqs.find(r => r.status === 'DONE')
  const ask = () => run(async () => { const id = crypto.randomUUID(); await insertRow('refresh_requests', { id, kind: 'READ_RIDER', event_id: event.id, url }, `Rider read requested: ${event.title}`, id) })
  return <span className="readrider">
    {pending ? <small className="pill amber">Reading soon — at the next check</small>
      : <button className="linkbtn" disabled={busy} onClick={ask}>{done ? 'Read it again' : 'Read this rider'}</button>}
    {done && !pending && <small className="pill green">Read {fmtDate(done.done_at, { month: 'short', day: 'numeric' })}</small>}
    {err && <small className="msg error">{err}</small>}
  </span>
}

function Documents({ event, docs }: { event: Event; docs: Doc[] }) {
  const [title, setTitle] = useState(''); const [url, setUrl] = useState(''); const [type, setType] = useState('Contract')
  const { busy, err, run } = useAsync()
  const add = (e: FormEvent) => { e.preventDefault(); run(async () => {
    await insertRow('documents', { title: title.trim(), url: url.trim(), document_type: type, event_id: event.id, artist_id: event.artist_id, venue_id: event.venue_id, business_unit: event.business_unit, source: 'Google Drive link' }, `Document linked: ${title}`, event.id)
    setTitle(''); setUrl('')
  }) }
  return <>
    {docs.length ? <ul className="docs">{docs.map(d => <li key={d.id}><span className="pill">{d.document_type ?? 'File'}</span> {d.url ? <a href={d.url} target="_blank" rel="noreferrer">{d.title} <ExternalLink size={13}/></a> : d.title}
      {d.url && /rider|contract/i.test(`${d.document_type} ${d.title}`) && <ReadRider event={event} url={d.url}/>}</li>)}</ul>
      : <Empty>No documents linked yet. Paste Drive links to the contract, rider, stage plot, insurance certificate or settlement.</Empty>}
    <form className="addform" onSubmit={add}>
      <label>Type<select value={type} onChange={e => setType(e.target.value)}>{['Contract', 'Rider', 'Stage plot', 'Venue agreement', 'Insurance certificate', 'Advance sheet', 'Marketing', 'Box-office report', 'Settlement', 'Other'].map(t => <option key={t}>{t}</option>)}</select></label>
      <label className="grow">Name<input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Gene Watson contract (signed)"/></label>
      <label className="grow">Drive link<input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://drive.google.com/…"/></label>
      <button className="primary" disabled={busy || !title.trim()}><Plus size={16}/> Link</button>
    </form>
    {err && <p className="msg error">{err}</p>}
  </>
}

// ---------- the workspace ----------
export function ShowWorkspace({ event, tasks, onBack, onSheet }: { event: Event; tasks: Task[]; onBack: () => void; onSheet?: () => void }) {
  const agreements = useShowRows<Agreement>('agreements', event.id)
  const moneyLines = useShowRows<MoneyLine>('financial_obligations', event.id)
  const facts = useShowRows<ShowFact>('show_facts', event.id, '*', 'field')
  const assets = useShowRows<AssetRequest>('asset_requests', event.id, '*', 'asset_type')
  const settlement = useShowRows<Settlement>('settlements', event.id, '*', '')
  const docs = useShowRows<Doc>('documents', event.id)
  const snaps = useShowRows<Snapshot>('ticket_snapshots', event.id, '*', 'captured_at')
  const billing = useShowRows<Billing>('event_artists', event.id, 'event_id, billing, artist:artists(id, name, agent:contacts!artists_agent_contact_fk(name, email, phone))', '')
  const plan = useShowRows<Proforma>('proformas', event.id, '*', '').rows[0]
  const [showCatchUp, setShowCatchUp] = useState(false)
  const { busy, err, run } = useAsync()

  const house = event.show_type === 'HOUSE' || event.show_type === 'RENTAL'
  const steps = tasks.filter(t => t.event_id === event.id && isShowStep(t))
  const extra = tasks.filter(t => t.event_id === event.id && !isShowStep(t) && open(t)).sort(byPriority)
  const extraIn = (s: Section) => extra.filter(t => ROLE_SECTION[roleOf(t)] === s)
  const other = extra.filter(t => !ROLE_SECTION[roleOf(t)] || !SECTIONS.includes(ROLE_SECTION[roleOf(t)] as Section))
  // Most important first: open before done, then Critical → Low, then soonest due.
  const byImportance = (a: Task, b: Task) => Number(!open(a)) - Number(!open(b)) || byPriority(a, b)
  const live = steps.filter(t => !t.catch_up).sort(byImportance)
  const catchUp = steps.filter(t => t.catch_up && open(t))
  const bySection = useMemo(() => Object.fromEntries(SECTIONS.map(s => [s, live.filter(t => t.section === s)])) as Record<Section, Task[]>, [live])
  const progress = (s: Section) => { const l = [...bySection[s], ...steps.filter(t => t.catch_up && t.section === s)]; return `${l.filter(t => !open(t)).length} of ${l.length} done` }
  const now = live.filter(t => open(t) && (dueIn(t) ?? 99) <= 7).sort(byPriority)

  const d = daysUntil(event.event_date), cap = capacityOf(event), sold = event.tickets_sold
  const pct = cap && sold != null ? Math.round(sold / cap * 100) : null
  const state = showState(event), v = velocity(snaps.rows)
  const doneCount = steps.filter(t => !open(t)).length
  const confirmAll = () => { if (confirm(`Mark all ${catchUp.length} earlier steps as handled? Only do this if they really were done before Opry Ops started.`)) run(() => confirmCatchUp(event.id)) }
  const [tab, setTab] = useState<'before' | 'plan' | 'day' | 'after'>(d == null || d > 2 ? 'before' : d >= 0 ? 'day' : 'after')
  const sellout = pct != null && pct >= 85
  const allDone = steps.length > 0 && steps.every(t => !open(t))
  useCelebrate(event.id, sellout ? 'sellout' : null); useCelebrate(event.id, allDone ? 'checklist' : null)

  return <div className="showpage" style={{ ['--sc' as string]: showColor(event.id) }}>
    <div className="wshead">
      <button className="linkbtn" onClick={onBack}><ArrowLeft size={16}/> All shows</button>
      {onSheet && !house && <button className="bigbtn" onClick={onSheet}><ShoppingCart size={18}/> Day-of-Show sheet & Walmart list</button>}
    </div>
    <section className={'hero show-hero' + (event.image_url ? ' withphoto' : '')} style={{ ['--sc' as string]: showColor(event.id), ['--photo' as string]: event.image_url ? `url("${event.image_url}")` : 'none' }}>
      <div>
        <p>{BU_LABEL[event.business_unit].toUpperCase()} · {event.venue?.name ?? 'Venue not set'}</p>
        <h1>{event.title}{sellout && <span className="soldstar" title={`${pct}% sold`}>★ {pct}% sold</span>}</h1>
        <span>{[fmtDate(event.event_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), event.starts_at && fmtTime(event.starts_at), event.doors_at && `doors ${fmtTime(event.doors_at)}`].filter(Boolean).join(' · ')}</span>
        {billing.rows.length > 0 && <small className="billing">{billing.rows.map(b => `${b.artist?.name}${b.artist?.agent ? ` (agent: ${b.artist.agent.name})` : ''}`).join(' + ')}</small>}
        <label className="kindsel noprint">What kind of night?
          <select value={event.show_type ?? 'ARTIST'} disabled={busy} onChange={e => run(() => updateEvent(event, { show_type: e.target.value }, `Show type → ${e.target.value}`))}>
            <option value="ARTIST">Artist show</option><option value="HOUSE">Free house night (Gospel / Bluegrass / Country)</option>{(SHOW_RENTALS || event.show_type === 'RENTAL') && <option value="RENTAL">Building rental</option>}
          </select></label>
      </div>
      <div className="bigdays stub">{d == null ? '' : d < 0 ? <>Played<small>{fmtDate(event.event_date, { month: 'short', day: 'numeric' })}</small></> : d === 0 ? <>Tonight<small>showtime</small></> : <>{d}<small>day{d === 1 ? '' : 's'} to showtime</small></>}</div>
    </section>
    <nav className="printlinks noprint" aria-label="Documents to print">
      <b>Print</b>
      {([['Contract', /contract/i], ['Rider', /rider/i], ['Proforma', /proforma/i]] as const).map(([label, re]) => {
        const d = docs.rows.find(x => x.url && re.test(`${x.document_type ?? ''} ${x.title}`))
        return d ? <a key={label} href={d.url!} target="_blank" rel="noreferrer">{label} <ExternalLink size={13}/></a> : <span key={label} className="missing" title="Not linked yet — add it under Documents">{label}: not linked</span>
      })}
      {onSheet && !house && <button type="button" onClick={onSheet}>Day-of-Show sheet</button>}
    </nav>

    {house ? <p className="health good"><b>{event.show_type === 'RENTAL' ? 'Building rental' : 'Free house night'}.</b> No talent to advance — just concessions. (ProPresenter already has a standing loop for free nights.) The artist checklist is switched off.</p>
    : <div className="stats">
      <div><small>Sold</small><b>{sold ?? '—'}</b>{cap && <small>of {cap} seats{pct != null ? ` · ${pct}%` : ''}</small>}</div>
      <div><small>Seats left</small><b>{cap && sold != null ? cap - sold : '—'}</b></div>
      <div><small>Etix gross (actual)</small><b>{money(event.ticket_revenue)}</b></div>
      <div><small>Last 7 days</small><b>{v ? `${v.sold >= 0 ? '+' : ''}${v.sold}` : '—'}</b><small>{v ? 'tickets' : 'pace starts after next refresh'}</small></div>
      <div><small>Checklist</small><b>{doneCount}/{steps.length}</b><StaffProgress done={doneCount} total={steps.length}/></div>
      {plan && (() => { const be = planBreakEven(plan); return be ? <div><small>Break-even (Jamie’s plan)</small><b>{be}</b><small>{sold != null ? (sold >= be ? '✓ passed' : `${be - sold} more tickets`) : 'tickets'}</small></div> : null })()}
    </div>}
    {!house && state && <p className={'health ' + state.tone}><b>{state.label}.</b> {state.why}.</p>}
    {event.known_issue && <p className="health bad"><b>Data note:</b> {event.known_issue}</p>}

    <section className="panel">
      <div className="panelhead"><div><small>THIS SHOW, NEXT 7 DAYS</small><h2>{now.length ? `${now.length} thing${now.length === 1 ? '' : 's'} to do now` : 'Nothing due this week'}</h2></div></div>
      {now.map(t => <StepRow key={t.id} task={t}/>)}
      {now.length === 0 && <Empty>You’re caught up on this show for the week. ★</Empty>}
    </section>

    {catchUp.length > 0 && <section className="panel catchup">
      <div className="panelhead"><div><small>CATCH-UP · CONFIRM WHAT’S ALREADY DONE</small><h2>{catchUp.length} earlier steps to confirm</h2></div>
        <button className="linkbtn" onClick={() => setShowCatchUp(!showCatchUp)}>{showCatchUp ? 'Hide' : 'Review'}</button></div>
      <p className="note">This checklist started on Sept 28, after these dates had passed. They aren’t counted as overdue — tick what was done, or mark “not needed”.</p>
      {showCatchUp && <>{catchUp.map(t => <StepRow key={t.id} task={t}/>)}
        <div className="actions"><button disabled={busy} onClick={confirmAll}>All of these were done</button></div></>}
      {err && <p className="msg error">{err}</p>}
    </section>}

    {house ? <div className="wgrid">
      <Card title={SHOW_RENTALS ? 'Money: rental & concessions' : 'Concessions'} progress={progress('Money')} defaultOpen>
        <Wrap event={event} s={settlement.rows[0]} house/>
        {bySection.Money.map(t => <StepRow key={t.id} task={t}/>)}{extraIn('Money').map(t => <TaskRow key={t.id} task={t}/>)}
      </Card>
      <Card title="Before & after the night" progress={progress('Wrap-up')} defaultOpen>
        {[...bySection.Marketing, ...bySection.Tickets, ...bySection['Wrap-up']].map(t => <StepRow key={t.id} task={t}/>)}
        {[...extraIn('Marketing'), ...extraIn('Wrap-up')].map(t => <TaskRow key={t.id} task={t}/>)}
      </Card>
      <Card title="Documents" progress={`${docs.rows.length} linked`}><Documents event={event} docs={docs.rows}/></Card>
    </div>
    : <>
      <div className="pagetabs showtabs" role="tablist">{([['before', 'Before the show'], ['plan', 'Campaign plan'], ['day', 'Show day'], ['after', 'After the show']] as const).map(([k, label]) =>
        <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}</div>
      {tab === 'before' && <div className="wgrid">
      <Card title="Artist & Contract" defaultOpen progress={progress('Artist & Contract')}>
        {plan && <PlanDeal p={plan}/>}
        <Agreements event={event} rows={agreements.rows}/>
        <Facts eventId={event.id} section="Artist & Contract" facts={facts.rows}/>
        {bySection['Artist & Contract'].map(t => <StepRow key={t.id} task={t}/>)}{extraIn('Artist & Contract').map(t => <TaskRow key={t.id} task={t}/>)}
      </Card>
      <Card title="Money" progress={progress('Money')}>
        {plan ? <PlanMoney p={plan} sold={sold} gross={event.ticket_revenue}/> : <p className="note">No proforma from Jamie linked for this show yet.</p>}
        <h3 className="minihead">Actual costs &amp; deposits</h3>
        <Money event={event} lines={moneyLines.rows} snapshot={{ sold, gross: event.ticket_revenue }}/>
        {bySection.Money.map(t => <StepRow key={t.id} task={t}/>)}{extraIn('Money').map(t => <TaskRow key={t.id} task={t}/>)}
      </Card>
      <Card title="Tickets" progress={progress('Tickets')}>
        <Tickets event={event} snaps={snaps.rows}/>
        {plan && <PlanTiers p={plan}/>}
        <Facts eventId={event.id} section="Tickets" facts={facts.rows}/>
        {bySection.Tickets.map(t => <StepRow key={t.id} task={t}/>)}{extraIn('Tickets').map(t => <TaskRow key={t.id} task={t}/>)}
      </Card>
      <Card title="Marketing" progress={progress('Marketing')}>
        <button className="bigbtn planlink" onClick={() => setTab('plan')}>Open the campaign plan: every post, email, ad &amp; church step →</button>
        <MarketingPanel event={event}/>
        <h3 className="minihead">Asset package</h3>
        <Assets eventId={event.id} rows={assets.rows}/>
        {bySection.Marketing.map(t => <StepRow key={t.id} task={t}/>)}{extraIn('Marketing').map(t => <TaskRow key={t.id} task={t}/>)}
      </Card>
      </div>}
      {tab === 'plan' && <CampaignPlan event={event}/>}
      {tab === 'day' && <div className="wgrid">
      <div className="dayactions">
        {onSheet && <button className="bigbtn daysheet" onClick={onSheet}><ShoppingCart size={18}/> Day-of-Show sheet &amp; Walmart list</button>}
        <VenueSheet event={event} facts={facts.rows}/>
      </div>
      <Card title="Production & advancing" defaultOpen progress={progress('Production')}>
        <Facts eventId={event.id} section="Production" facts={facts.rows}/>
        {bySection.Production.map(t => <StepRow key={t.id} task={t}/>)}{extraIn('Production').map(t => <TaskRow key={t.id} task={t}/>)}
      </Card>
      <Card title="Hospitality & show day" defaultOpen progress={progress('Hospitality')}>
        <Facts eventId={event.id} section="Hospitality" facts={facts.rows}/>
        {bySection.Hospitality.map(t => <StepRow key={t.id} task={t}/>)}{extraIn('Hospitality').map(t => <TaskRow key={t.id} task={t}/>)}
      </Card>
      </div>}
      {tab === 'after' && <div className="wgrid">
      <Card title="After the show" defaultOpen progress={progress('Wrap-up')}>
        <Wrap event={event} s={settlement.rows[0]}/>
        {bySection['Wrap-up'].map(t => <StepRow key={t.id} task={t}/>)}{extraIn('Wrap-up').map(t => <TaskRow key={t.id} task={t}/>)}
      </Card>
      </div>}
      <div className="wgrid">
      <Card title="Documents" progress={`${docs.rows.length} linked`}>
        <Documents event={event} docs={docs.rows}/>
      </Card>
      </div>
    </>}
    <section className="panel">
      <div className="panelhead"><div><small>ADD TO THIS SHOW</small><h2>{other.length ? `${other.length} other to-do${other.length === 1 ? '' : 's'}` : 'Add a to-do'}</h2></div></div>
      {other.map(t => <TaskRow key={t.id} task={t}/>)}
      <AddShowTask event={event}/>
      <p className="note">To-dos you add here go into the section that matches their job (Marketing, Production …) and show on the To-Do page under this show.</p>
    </section>
  </div>
}

function AddShowTask({ event }: { event: Event }) {
  const [title, setTitle] = useState(''); const [job, setJob] = useState<Role>('Production')
  const { busy, err, run } = useAsync()
  const add = (e: FormEvent) => { e.preventDefault(); run(async () => {
    await addTask({ title: title.trim(), event_id: event.id, artist_id: event.artist_id, business_unit: event.business_unit,
      category: job === 'Office' ? 'Admin' : 'Show & Artist Operations', section: ROLE_SECTION[job] ?? 'Admin' }); setTitle('') }) }
  return <form className="addform" onSubmit={add}>
    <label className="grow">Add a to-do for this show<input value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs doing?"/></label>
    <label>Job<select value={job} onChange={e => setJob(e.target.value as Role)}>{ROLES.filter(r => r !== 'Systems & web').map(r => <option key={r}>{r}</option>)}</select></label>
    <button className="primary" disabled={busy || !title.trim()}><Plus size={16}/> Add</button>
    {err && <p className="msg error">{err}</p>}
  </form>
}
