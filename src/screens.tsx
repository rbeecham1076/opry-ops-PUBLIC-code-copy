import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { AlarmClock, ArrowRight, CalendarDays, ClipboardCheck, PenLine, Copy, Flame, Hourglass, Lightbulb, Mail as MailIcon, Plus, RotateCcw, Scale, ShieldAlert, Stamp, Ticket, Printer, Megaphone } from 'lucide-react'
import {
  addMeetingItem, addTask, BU_LABEL, confirmCatchUp, useTable, byPriority, capacityOf, daysUntil, isWaiting, showState, paceTarget, needsAYes, isHoldOrCancelled, rankTasks, rankDecisions, fmtDate, fmtTime, nextWednesday, todayISO, updateIdea, updateMeetingItem,
  type DataIssue, type Decision, type Event, type Idea, type MeetingItem, type Task,
} from './lib/data'
import { DecisionCard, SignOffSlip } from './approvals'
import { StepRow } from './workspace'
import { LogIt } from './logit'
import { words } from './lib/logmatch'
import { PopupDetails } from './popup'
import { ShowCalendar } from './calendar'
import { NeonStar, SignCowboy } from './neon'
import { Envelope } from './envelope'
import { PrintSheet, printSheet } from './printsheet'
import { SignMarquee } from './letterboard'
import type { PlanItem } from './campaign'
import type { Church } from './churches'
import { useQuestions } from './questions'
import type { Improvement } from './requests'
import { ROLES, roleOf, type Role } from './lib/roles'
import { AddTask, Empty, IdeaDrop, Panel, RefreshSales, ShowCard, ShowTag, TaskRow, showColor, useAsync } from './components'

type Mail = { id: string; subject: string | null; from_address: string | null; snippet: string | null; urgency: string | null; urgency_reason: string | null; suggested_action: string | null; state: string | null; view_url: string | null; received_at: string | null; is_unread: boolean | null; event_id: string | null }
const URG = ['URGENT', 'TODAY', 'THIS_WEEK', 'FYI']
export type Data = { tasks: Task[]; events: Event[]; ideas: Idea[]; meeting: MeetingItem[]; decisions: Decision[]; issues: DataIssue[] }
// Show-checklist steps live in each Show Workspace; lists elsewhere only surface the ones due within a week.
const dueWithin = (t: Task, days: number) => !!t.due_at && t.due_at.slice(0, 10) <= new Date(Date.now() + days * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
const onMyList = (t: Task) => !t.catch_up && (!t.source_rule_id || dueWithin(t, 7))
// A catch-up step that is show prep (not booking/contract/money) for a show in the next 10 days.
const PREP = new Set(['Tickets', 'Marketing', 'Production', 'Hospitality'])
// Only steps meant for the last 3 weeks before the show (ushers, food…), not early on-sale work.
const isPrepCatchUp = (t: Task, e?: Event) => { const d = daysUntil(e?.event_date ?? null)
  if (!e?.event_date || !t.due_at || d == null || d < 0 || d > 10 || !PREP.has(t.section ?? '')) return false
  return new Date(e.event_date).getTime() - new Date(t.due_at.slice(0, 10)).getTime() <= 21 * 86400000 }
export type Page = 'Opry Story' | 'Contacts & Info' |'My Work' | 'Wednesday & Ideas' | 'Improvements' | 'My Day' | 'Shows' | 'Approvals' | 'To-Do' | 'Wednesday Meeting' | 'Ideas' | 'Artists & Venues' | 'Marketing' | 'Reports' | 'Inbox' | 'My Role' | 'Show Calendar' | 'Churches' | 'Open Questions'

const addDaysISO = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const matches = (q: string, ...fields: (string | null | undefined)[]) =>
  !q || fields.some(f => f?.toLowerCase().includes(q.toLowerCase()))
const isActive = (t: Task) => t.status === 'OPEN' || t.status === 'IN_PROGRESS'

// ---------------- My Day ----------------
// The software prioritizes, in the documented daily order: final-push shows → shows behind pace → approvals →
// overdue → this week → system issues → opportunities. Each bucket says why it's there.
type Bucket = { key: string; kicker: string; title: string; why: string; body: ReactNode[]; total?: number; action?: { label: string; onClick: () => void } }
// Each group gets its own look, borrowed from the building: red stage rug, gold plaque, envelope paper,
// green seat velvet, barnwood, slate. Items inside are tiles instead of a long list.
const LOOK: Record<string, { tone: string; icon: ReactNode }> = {
  approval: { tone: 'gallery', icon: <Stamp size={18}/> }, confirm: { tone: 'letters', icon: <ClipboardCheck size={18}/> }, mail: { tone: 'paper', icon: <MailIcon size={18}/> },
  overdue: { tone: 'floor', icon: <AlarmClock size={18}/> }, week: { tone: 'seat', icon: <CalendarDays size={18}/> },
  results: { tone: 'wood', icon: <RotateCcw size={18}/> }, ongoing: { tone: 'wood', icon: <Flame size={18}/> },
  plan: { tone: 'letters', icon: <Megaphone size={18}/> }, questions: { tone: 'gallery', icon: <Lightbulb size={18}/> }, system: { tone: 'slate', icon: <ShieldAlert size={18}/> }, opps: { tone: 'records', icon: <Lightbulb size={18}/> },
}
const countOf = (body: ReactNode[]) => body.filter(x => (x as { key?: string } | null)?.key !== 'more').length

export function Board({ b }: { b: Bucket }) {
  const look = LOOK[b.key] ?? { tone: 'wood', icon: null }
  return <section id={'b-' + b.key} className={'board ' + look.tone} aria-label={b.title}>
    <header className="boardhead"><span className="bh-icon" aria-hidden="true">{look.icon}</span>
      <div><small>{b.kicker}</small><h2>{b.title}</h2></div><span className="bh-count">{b.total ?? countOf(b.body)}</span></header>
    <p className="why">{b.why}</p>
    <PopupDetails.Provider value={true}><div className="tiles">{b.body}</div></PopupDetails.Provider>
    {b.action && <footer className="boardfoot"><button className="btn secondary" onClick={b.action.onClick}>{b.action.label} <ArrowRight size={16}/></button></footer>}
  </section>
}

// Four cards at the top. "Do now" is the starting point and is bigger; each card says what tapping it does.
type SumCard = { key: string; tone: string; n: number; label: string; sub: string; go: string; lead?: boolean }
function DaySummary({ cards }: { cards: SumCard[] }) {
  const jump = (k: string) => { const el = document.getElementById('b-' + k); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); el?.querySelector<HTMLElement>('button, a')?.focus({ preventScroll: true }) }
  return <div className="daysum" role="navigation" aria-label="Your day at a glance">{cards.map(c =>
    <button key={c.label} className={'dsum ' + c.tone + (c.lead ? ' lead' : '') + (c.n ? '' : ' zero')} onClick={() => c.n && jump(c.key)} aria-disabled={!c.n}>
      <span className="dsum-top"><b>{c.n}</b><span>{c.label}</span></span>
      <small>{c.n ? c.sub : 'Nothing right now'}</small>
      {c.n > 0 && <span className="dsum-go">{c.go} <ArrowRight size={16}/></span>}
    </button>)}</div>
}

// Show pulse: final-push and behind-pace shows as small ticket tiles instead of a long list.
function PulseStrip({ final, behind, openShow }: { final: Event[]; behind: Event[]; openShow: (id: string) => void }) {
  const rows = [...final.map(e => ({ e, hot: true })), ...behind.map(e => ({ e, hot: false }))]
  if (!rows.length) return null
  return <section id="b-pulse" className="board rug pulse" aria-label="Show pulse">
    <header className="boardhead"><span className="bh-icon" aria-hidden="true"><Ticket size={18}/></span>
      <div><small>TICKET SALES</small><h2>{final.length ? 'Shows to watch this week' : 'Shows selling slower than we’d like'}</h2></div><span className="bh-count">{rows.length}</span></header>
    <div className="pulsegrid">{rows.map(({ e, hot }, i) => { const cap = capacityOf(e), d = daysUntil(e.event_date) ?? 0
      const pct = cap && e.tickets_sold != null ? Math.round(e.tickets_sold / cap * 100) : null, st = showState(e), tgt = paceTarget(e)
      return <button key={e.id} className={'pulsetile' + (hot ? ' hot' : '')} style={{ ['--sc' as string]: showColor(e.id), ['--i' as string]: i }} onClick={() => openShow(e.id)}
        title={hot ? `Final push — ${cap && e.tickets_sold != null ? `${cap - e.tickets_sold} seats left` : 'seat count unknown'}. Decide on a last-chance push (Jamie).` : st?.why}>
        <span className="pt-tag">{hot ? (d === 0 ? 'Show is tonight' : `Show in ${d} day${d === 1 ? '' : 's'} · last chance to sell`) : `Selling slow · ${d} days to go`}</span>
        <b>{e.title}</b>
        <span className="pt-row"><span className="pt-pct">{pct != null ? `${pct}%` : '—'}</span><small>{e.tickets_sold ?? '?'}{cap ? ` of ${cap}` : ''} seats sold</small></span>
        <span className="pt-bar" aria-hidden="true"><i style={{ width: `${pct ?? 0}%` }}/>{tgt && cap && <em style={{ left: `${Math.round(tgt.seats / cap * 100)}%` }}/>}</span>
        {tgt && !hot && <small className="pt-target">Should have about {tgt.seats} sold by now · <b>{tgt.short} to go</b></small>}
        <span className="pt-next">{hot ? 'Next: decide on a last-chance push with Jamie' : 'Next: review ads and the plan'} <ArrowRight size={14}/></span>
      </button> })}</div>
  </section>
}

export function MyDay({ data, q, go, openShow }: { data: Data; q: string; go: (p: Page) => void; openShow: (id: string) => void }) {
  const [adding, setAdding] = useState(false); const [logging, setLogging] = useState(false)
  const eventsById = useMemo(() => new Map(data.events.map(e => [e.id, e])), [data.events])
  const today = todayISO()
  const upcoming = data.events.filter(e => { const d = daysUntil(e.event_date); return d != null && d >= 0 && !isHoldOrCancelled(e) })
  const soon = upcoming.filter(e => (daysUntil(e.event_date) ?? 99) <= 21)
  const mine = (t: Task) => isActive(t) && onMyList(t) && matches(q, t.title, t.next_action, t.category)
  const rank = rankTasks(data.events)
  const taskRow = (t: Task) => <TaskRow key={t.id} task={t} event={t.event_id ? eventsById.get(t.event_id) : undefined}/>
  // Tasks for the same show sit together under one show name (in the order they first appear); office tasks stay on their own.
  const byShow = (list: Task[]) => { const out: ReactNode[] = []; const seen = new Set<string>()
    for (const t of list) {
      const e = t.event_id ? eventsById.get(t.event_id) : undefined
      if (!e) { out.push(taskRow(t)); continue }
      if (seen.has(e.id)) continue
      seen.add(e.id)
      const same = list.filter(x => x.event_id === e.id)
      out.push(same.length === 1 ? taskRow(t) : <div key={'g' + e.id} className="tgroup"><ShowTag event={e}/><span className="tgroup-n">{same.length} for this show</span>
        <div className="tiles tgroup-tiles">{same.map(x => <TaskRow key={x.id} task={x} event={e} hideShow/>)}</div></div>)
    }
    return out }

  // 1. Needs attention now: shows within 48 hours that still have seats.
  const final = upcoming.filter(e => { const d = daysUntil(e.event_date)!, cap = capacityOf(e); return d <= 2 && (cap == null || e.tickets_sold == null || cap - e.tickets_sold > 0) })
  // 2. Sales problems: explained health says behind.
  const behind = upcoming.filter(e => !final.includes(e) && showState(e)?.tone === 'bad')
  // 3. Waiting for approval: open decisions + show sign-offs due this week.
  const yes = needsAYes(data.decisions, data.tasks)
  const waitingDecisions = yes.questions.filter(d => matches(q, d.title)).sort(rankDecisions(data.events))
  const signOffs = yes.signOffs.filter(t => matches(q, t.title, t.next_action)).sort(rank)
  // 3b. Show prep that came due before Opry Ops started (catch-up steps) for shows in the next 10 days —
  // ushers, stagehands, food… These are too close to the show to stay tucked away.
  const prepCheck = data.tasks.filter(t => t.catch_up && isActive(t) && t.event_id && isPrepCatchUp(t, eventsById.get(t.event_id)) && matches(q, t.title))
    .sort(rank)
  const prepShows = [...new Set(prepCheck.map(t => t.event_id!))].map(id => ({ e: eventsById.get(id)!, steps: prepCheck.filter(t => t.event_id === id) })).filter(g => g.e)
  // 4. Overdue and 5. this week (tasks only; other catch-up items live in each show).
  const overdue = data.tasks.filter(t => mine(t) && t.due_at && t.due_at.slice(0, 10) < today && t.handling !== 'APPROVAL').sort(rank)
  const week = data.tasks.filter(t => mine(t) && t.due_at && t.due_at.slice(0, 10) >= today && t.handling !== 'APPROVAL')
    .sort(rank)
  const ongoing = data.tasks.filter(t => mine(t) && !t.due_at && (t.priority === 'Critical' || t.status === 'IN_PROGRESS')).sort(rank)
  // 6. System issues and 7. opportunities.
  const issues = data.issues.filter(i => i.status === 'OPEN')
  const newIdeas = data.ideas.filter(i => i.status === 'NEW')
  const mail = useTable<Mail>('communications', 'id, subject, from_address, snippet, urgency, urgency_reason, suggested_action, state, view_url, received_at, is_unread, event_id', { column: 'received_at', ascending: false }).rows
  const toAnswer = mail.filter(m => m.state !== 'RESOLVED' && m.state !== 'FYI' && (m.state === 'NEEDS_REPLY' || m.urgency === 'URGENT' || m.urgency === 'TODAY'))
    .sort((a, b) => { const w = (m: Mail) => (m.event_id && eventsById.get(m.event_id)?.event_date) || today
      return w(a).localeCompare(w(b)) || URG.indexOf(a.urgency ?? 'THIS_WEEK') - URG.indexOf(b.urgency ?? 'THIS_WEEK') })
  // Campaign-plan steps (posts, emails, ad checks, church outreach) due in the next 7 days, and church follow-ups due.
  const planItems = useTable<PlanItem>('marketing_plan_items', 'id, event_id, run_on, run_time, channel, format, hook, job, status, sort', { column: 'run_on' }).rows
  const planDue = planItems.filter(i => i.status !== 'DONE' && i.status !== 'SKIPPED' && i.run_on && i.run_on <= addDaysISO(today, 7) && matches(q, i.hook, i.job, i.channel))
  const churches = useTable<Church>('church_partners', 'id, name, city, follow_up_on, status', { column: 'follow_up_on' }).rows
  const churchDue = churches.filter(c => c.follow_up_on && c.follow_up_on <= today && c.status !== 'DO_NOT_CONTACT')
  const questions = useQuestions().rows
  const qFound = questions.filter(x => x.status === 'ANSWER_FOUND'), qHigh = questions.filter(x => x.status === 'OPEN' && x.priority === 'High')
  const impr = useTable<Improvement>('improvements', 'id, title, check_on, status', { column: 'check_on' }).rows
  const toCheck = impr.filter(i => i.check_on && i.check_on <= today && (i.status === 'IN_PLACE' || i.status === 'PLANNED'))

  const buckets: Bucket[] = [
    { key: 'approval', kicker: 'NEEDS A YES', total: waitingDecisions.length + signOffs.length, title: 'Ask Clay, Barbie or Jamie', why: `${waitingDecisions.length} question${waitingDecisions.length === 1 ? '' : 's'} + ${signOffs.length} show sign-off${signOffs.length === 1 ? '' : 's'} due in the next 2 weeks — soonest show first. Tap “Record the answer” when you hear back.`,
      action: { label: 'Open Needs a yes', onClick: () => go('Approvals') },
      body: [...signOffs.slice(0, 2).map(t => <SignOffSlip key={t.id} due={t.due_at} who={t.approver}>{eventsById.get(t.event_id ?? '') && <ShowTag event={eventsById.get(t.event_id ?? '')!}/>}<StepRow task={t}/></SignOffSlip>),
        ...waitingDecisions.slice(0, 3 - Math.min(2, signOffs.length) + 1).map(d => <DecisionCard key={d.id} d={d} event={d.event_id ? eventsById.get(d.event_id) : undefined} compact/>),
        ...(waitingDecisions.length + signOffs.length > 4 ? [<button key="more" className="linkbtn more" onClick={() => go('Approvals')}>See all {waitingDecisions.length + signOffs.length} approvals →</button>] : [])] },
    { key: 'confirm', kicker: 'RUN SHEET · SHOW PREP CHECK', total: prepCheck.length, title: 'Was this handled?', why: 'Show prep for the next 10 days that was due before Opry Ops started. Tick what’s done; tap a step to mark it not needed.',
      action: prepCheck.length ? { label: 'Open the show’s checklist', onClick: () => openShow(prepCheck[0].event_id!) } : undefined,
      body: prepShows.map(({ e, steps }) => <div key={e.id} className="rs-group">
        <ShowTag event={e}/>
        {steps.slice(0, 5).map(t => <StepRow key={t.id} task={t}/>)}
        {steps.length > 5 && <button className="linkbtn more" onClick={() => openShow(e.id)}>{steps.length - 5} more for this show →</button>}
      </div>) },
    { key: 'mail', kicker: 'EMAIL', total: toAnswer.length, title: 'Emails to answer', why: 'Sorted each weekday morning. Tap one to open it in Gmail.',
      action: { label: 'Open all emails', onClick: () => go('Inbox') },
      body: [...toAnswer.slice(0, 5).map(m => <Envelope key={m.id} subject={m.subject} from={m.from_address} urgency={m.urgency} reason={m.urgency_reason}
          next={m.suggested_action} unread={m.is_unread} href={m.view_url} show={m.event_id ? eventsById.get(m.event_id)?.title : null}
          when={m.received_at ? fmtDate(m.received_at, { month: 'short', day: 'numeric' }) : null}/>),
        ...(toAnswer.length > 5 ? [<button key="more" className="linkbtn more" onClick={() => go('Inbox')}>See all {toAnswer.length} in Inbox →</button>] : [])] },
    { key: 'overdue', kicker: 'DO NOW · LATE', total: overdue.length, title: 'Past due — start here', why: 'Tick the box when it’s done. Tap a task to change the date or mark it waiting.',
      action: { label: 'See everything in To-Do', onClick: () => go('To-Do') }, body: [...byShow(overdue.slice(0, 5)), ...(overdue.length > 5 ? [<button key="more" className="linkbtn more" onClick={() => go('To-Do')}>See all {overdue.length} in To-Do →</button>] : [])] },
    { key: 'week', kicker: 'THIS WEEK', total: week.length, title: 'Due in the next 7 days', why: 'Your tasks and show checklist steps, soonest first.',
      action: { label: 'Plan the week in To-Do', onClick: () => go('To-Do') }, body: [...byShow(week.slice(0, 5)), ...(week.length > 5 ? [<button key="more" className="linkbtn more" onClick={() => go('To-Do')}>See all {week.length} in To-Do, grouped by show →</button>] : [])] },
    { key: 'plan', kicker: 'MARKETING · NEXT 7 DAYS', total: planDue.length + churchDue.length, title: 'Posts, emails & church outreach', why: 'From each show’s campaign plan, soonest first. Tap one to open the plan with the copy ready to use.',
      body: [...planDue.slice(0, 6).map(i => { const e = i.event_id ? eventsById.get(i.event_id) : undefined; const late = i.run_on! < today
        return <button key={i.id} className={'planmini' + (late ? ' late' : '')} onClick={() => e && openShow(e.id)}>
          <span className="pm-when"><b>{late ? 'Late' : i.run_on === today ? 'Today' : fmtDate(i.run_on, { weekday: 'short' })}</b><small>{fmtDate(i.run_on, { month: 'short', day: 'numeric' })}</small></span>
          <span className="pm-main"><small>{i.channel}{i.format ? ` · ${i.format}` : ''}{e ? ` · ${e.title}` : ''}</small><strong>{i.hook && i.hook !== '—' ? i.hook : i.job}</strong></span></button> }),
        ...(planDue.length > 6 ? [<p key="more" className="note">{planDue.length - 6} more in the shows’ campaign plans.</p>] : []),
        ...(churchDue.length ? [<button key="ch" className="attn" onClick={() => go('Churches')}><b>{churchDue.length} church follow-up{churchDue.length === 1 ? '' : 's'} due</b><span>{churchDue.slice(0, 3).map(c => c.name).join(' · ')}</span><small>Open Churches ›</small></button>] : [])] },
    { key: 'questions', kicker: 'OPEN QUESTIONS', total: qFound.length + qHigh.length, title: 'Answers found & big questions', why: 'Answers pulled from email and notes wait here for you to confirm.',
      body: [...(qFound.length ? [<button key="f" className="attn" onClick={() => go('Open Questions')}><b>{qFound.length} answer{qFound.length === 1 ? '' : 's'} found — check {qFound.length === 1 ? 'it' : 'them'}</b><span>{qFound[0].question.slice(0, 90)}</span><small>Open questions ›</small></button>] : []),
        ...(qHigh.length ? [<button key="h" className="attn" onClick={() => go('Open Questions')}><b>{qHigh.length} important question{qHigh.length === 1 ? '' : 's'} still open</b><span>{qHigh.map(x => x.question.slice(0, 50)).join(' · ')}</span><small>Open questions ›</small></button>] : [])] },
    { key: 'results', kicker: 'REPORT BACK', title: 'Did it work?', why: 'Changes you said you’d check on by now.',
      body: toCheck.length ? [<button key="r" className="attn" onClick={() => go('Improvements')}><b>{toCheck.length} improvement{toCheck.length === 1 ? '' : 's'} to check</b><span>{toCheck[0].title}</span><small>Open Improvements ›</small></button>] : [] },
    { key: 'ongoing', kicker: 'ONGOING', total: ongoing.length, title: 'Projects with no due date', why: 'Keep them moving when you have time.', body: [...byShow(ongoing.slice(0, 3)), ...(ongoing.length > 3 ? [<button key="more" className="linkbtn more" onClick={() => go('To-Do')}>{ongoing.length - 3} more in To-Do →</button>] : [])] },
    { key: 'system', kicker: 'DATA CHECKS', title: 'Numbers to double-check', why: 'Could affect budgets and reports until fixed.',
      body: issues.filter(i => /critical/i.test(i.severity ?? '')).slice(0, 3).map(i => <div className="waitrow" key={i.id}><span className={'pill ' + (/critical/i.test(i.severity ?? '') ? 'red' : 'amber')}>{i.severity}</span><div><b>{i.title}</b></div></div>) },
    { key: 'opps', kicker: 'IDEAS', title: 'Ideas to sort', why: 'Useful, not urgent.',
      body: newIdeas.length ? [<button key="i" className="attn" onClick={() => go('Ideas')}><b>{newIdeas.length} new idea{newIdeas.length === 1 ? '' : 's'}</b><span>{newIdeas[0].body.slice(0, 90)}</span><small>Open Ideas ›</small></button>] : [] },
  ]
  // The five things Rach acts on, in order; everything else waits in a drawer.
  const PRIMARY = ['overdue', 'confirm', 'mail', 'week', 'plan', 'approval']
  const primary = PRIMARY.map(k => buckets.find(b => b.key === k)!).filter(Boolean)
  const radar = buckets.filter(b => !PRIMARY.includes(b.key))
  const waitingCount = data.tasks.filter(t => t.status === 'WAITING').length
  const doNow = overdue.length + prepCheck.length
  const isWed = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'long' }) === 'Wednesday'
  const wedCount = data.meeting.filter(m => m.status === 'OPEN').length + data.ideas.filter(i => i.add_to_wednesday && i.status !== 'ARCHIVED').length

  return <>
    <section className="welcome" aria-label="Welcome">
      <NeonStar size={78} label="The Kentucky Opry's neon star"/>
      <div className="welcome-text">
        <h1 className="facade">Hey, Rach!</h1>
        <ul className="welcome-facts">
          {isWed && <li className="hot">Team meeting today</li>}
          <li>{soon.length ? `${soon.length} show${soon.length === 1 ? '' : 's'} in the next 3 weeks` : 'No shows in the next 3 weeks'}</li>
          {final.length > 0 && <li>{final.length} in the final push</li>}
        </ul>
      </div>
      <p className="welcome-date" aria-label={fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}>
        <small>{fmtDate(today, { weekday: 'long' })}</small><b>{fmtDate(today, { day: 'numeric' })}</b><span>{fmtDate(today, { month: 'long' })}</span></p>
      <span className="porchlights" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i}/>)}</span>
    </section>
    <DaySummary cards={[
      { key: prepCheck.length && !overdue.length ? 'confirm' : 'overdue', tone: 'rug', n: doNow, label: 'Do now', sub: `${overdue.length} past due · ${prepCheck.length} show prep to check`, go: 'Start here', lead: true },
      { key: 'mail', tone: 'paper', n: toAnswer.length, label: 'Emails', sub: 'waiting on your reply', go: 'Answer' },
      { key: 'week', tone: 'seat', n: week.length, label: 'This week', sub: 'due in the next 7 days', go: 'See them' },
      { key: 'approval', tone: 'slate', n: waitingDecisions.length + signOffs.length, label: 'Needs a yes', sub: 'questions + sign-offs, next 2 weeks', go: 'Ask' },
    ]}/>
    <TodayStrip isWed={isWed} wedCount={wedCount} go={go}/>
    <div className="quick">
      <button className="btn primary" onClick={() => { setLogging(!logging); setAdding(false) }} aria-expanded={logging}><PenLine/> Log what I did</button>
      <button className="btn secondary" onClick={() => { setAdding(!adding); setLogging(false) }} aria-expanded={adding}><Plus/> Add a task</button>
      <button className="btn secondary" onClick={() => document.getElementById('idea')?.focus()}><Lightbulb/> Drop an idea</button>
      <button className="btn secondary" onClick={() => printSheet('day')}><Printer/> Print my day</button>
    </div>
    <PrintSheet id="day"><DayPrint today={today} isWed={isWed} data={data} eventsById={eventsById} overdue={overdue} prep={prepCheck} week={week} mail={toAnswer}
      shows={upcoming.filter(e => (daysUntil(e.event_date) ?? 99) <= 7)} plan={planDue} churches={churchDue}/></PrintSheet>
    {logging && <LogIt tasks={data.tasks} events={data.events} onClose={() => setLogging(false)}/>}
    {adding && <section className="panel"><AddTask events={data.events} onDone={() => setAdding(false)}/></section>}
    <div className="two">
      <div>
        {primary.filter(b => b.body.length).map(b => <Board key={b.key} b={b}/>)}
        {primary.every(b => !b.body.length) && <Panel title="All clear"><div className="allclear"><SignCowboy size={64}/><p>Nothing needs you right now. Grab a coffee — the office is quiet.</p></div></Panel>}
        {(radar.some(b => b.body.length) || waitingCount > 0) && <details className="radar">
          <summary><b>More on your radar</b><span>{radar.filter(b => b.body.length).map(b => `${b.kicker.charAt(0) + b.kicker.slice(1).toLowerCase()} ${b.total ?? countOf(b.body)}`).concat(waitingCount ? [`Follow up ${waitingCount}`] : []).join(' · ')}</span><small>Not urgent — open when you have a minute</small></summary>
          {radar.filter(b => b.body.length).map(b => <Board key={b.key} b={b}/>)}
          <WaitingPanel tasks={data.tasks} events={data.events}/>
        </details>}
      </div>
      <div>
        <SignMarquee events={upcoming} onOpen={openShow}/>
        <PulseStrip final={final} behind={behind} openShow={openShow}/>
        <Panel kicker="COMING UP" title="Shows in the next 3 weeks" action={<button className="linkbtn" onClick={() => go('Shows')}>All shows <ArrowRight size={15}/></button>}>
          <div className="vtix">{soon.map(e => <ShowCard key={e.id} event={e} tasks={data.tasks.filter(t => t.event_id === e.id)} onOpen={() => openShow(e.id)}/>)}</div>
          {soon.length === 0 && <Empty>No shows in the next 3 weeks. A good stretch to get ahead on the next ones.</Empty>}
        </Panel>
        <section className="panel slim"><RefreshSales events={data.events}/></section>
      </div>
    </div>
    <div id="ideadrop"><IdeaDrop/></div>
  </>
}

// Today's strip: the Wednesday team meeting (flagged on Wednesdays, with a box for last-minute additions)
// and a few quick links to places Rach opens every day.
function TodayStrip({ isWed, wedCount, go }: { isWed: boolean; wedCount: number; go: (p: Page) => void }) {
  const [add, setAdd] = useState(''); const [saved, setSaved] = useState<string | null>(null)
  const { busy, err, run } = useAsync()
  const save = (e: FormEvent) => { e.preventDefault(); const t = add.trim(); if (!t) return
    run(async () => { await addMeetingItem({ title: t, item_type: BUCKETS[1] }); setSaved(t); setAdd('') }) }
  const wed = nextWednesday()
  return <div className="todaystrip">
    <section className={'meetcard' + (isWed ? ' today' : '')} aria-label="Wednesday team meeting">
      <div className="meet-head">{isWed && <span className="pill red">Today</span>}
        <div><small>TEAM MEETING · ~11:00 AM</small><h2>{isWed ? 'Wednesday meeting is today' : `Next meeting: ${fmtDate(wed, { weekday: 'long', month: 'short', day: 'numeric' })}`}</h2>
          <span>{wedCount} item{wedCount === 1 ? '' : 's'} on the agenda</span></div>
        <button className="btn secondary small" onClick={() => go('Wednesday Meeting')}>Open the agenda <ArrowRight size={15}/></button></div>
      <form className="meet-add" onSubmit={save}>
        <label htmlFor="lastminute">{isWed ? 'Last-minute addition for today' : 'Add something for the meeting'}</label>
        <div><input id="lastminute" value={add} onChange={e => { setAdd(e.target.value); setSaved(null) }} placeholder="e.g. Ask Jamie about the Isaacs box-office sale"/>
          <button className="btn primary small" disabled={busy || !add.trim()}><Plus size={16}/> Add</button></div>
        {saved && <p className="msg info" role="status">Added to the agenda: “{saved}”</p>}
        {err && <p className="msg error">{err}</p>}
      </form>
    </section>
    <nav className="quicklinks" aria-label="Quick links"><small>QUICK LINKS</small>
      <button onClick={() => go('Show Calendar')}><CalendarDays size={18}/> Show calendar</button>
      <button onClick={() => go('To-Do')}><ClipboardCheck size={18}/> Full to-do list</button>
      <button onClick={() => go('Inbox')}><MailIcon size={18}/> All emails</button>
      <a href="https://boxoffice.etix.com/ticket/" target="_blank" rel="noopener noreferrer"><Ticket size={18}/> Etix box office</a>
      <button onClick={() => go('Contacts & Info')}><PenLine size={18}/> Phone numbers</button>
    </nav>
  </div>
}

function WaitingPanel({ tasks, events }: { tasks: Task[]; events: Event[] }) {
  const [all, setAll] = useState(false)
  const waiting = tasks.filter(t => t.status === 'WAITING').sort(rankTasks(events))
  return <Panel kicker="FOLLOW UP" title={`${waiting.length} to nudge or ask about`}
    action={waiting.length > 4 ? <button className="linkbtn" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${waiting.length}`}</button> : undefined}>
    {(all ? waiting : waiting.slice(0, 4)).map(t => <div className="waitrow" key={t.id}><Hourglass size={15}/><div><b>{t.title}</b><small>Ask / waiting on: {t.waiting_on ?? 'someone'}</small></div></div>)}
    {waiting.length === 0 && <Empty>Nobody to chase right now. ★</Empty>}
  </Panel>
}

// ---------------- Tasks ----------------
const TABS = { Active: isActive, Waiting: (t: Task) => t.status === 'WAITING', Done: (t: Task) => t.status === 'COMPLETE', All: (_: Task) => true }
// Long groups show the first few; one tap shows the rest.
function Capped({ tasks, n = 6 }: { tasks: Task[]; n?: number }) {
  const [all, setAll] = useState(false)
  return <><div className="tiles">{(all ? tasks : tasks.slice(0, n)).map(t => <TaskRow key={t.id} task={t}/>)}</div>
    {tasks.length > n && <button className="linkbtn more" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show ${tasks.length - n} more`}</button>}</>
}
const byDue = (a: Task, b: Task) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999') || byPriority(a, b)

// To-Do: every task lives with its show (shows in date order), then office work not tied to a show.
// A "job" tag on each task (Marketing, Production …) lets you see one kind of work across all shows.
export function Tasks({ data, q, openShow }: { data: Data; q: string; openShow: (id: string) => void }) {
  const [tab, setTab] = useState<keyof typeof TABS>('Active'); const [bu, setBu] = useState('ALL'); const [allSteps, setAllSteps] = useState(false)
  const [role, setRole] = useState<Role | 'ALL'>('ALL')
  const eventsById = useMemo(() => new Map(data.events.map(e => [e.id, e])), [data.events])
  const visible = (t: Task) => allSteps || !t.source_rule_id || t.source_rule_id === 'SYNC' || (!t.catch_up && dueWithin(t, 14))
  const base = data.tasks.filter(t => TABS[tab](t) && visible(t) && (bu === 'ALL' || t.business_unit === bu) && matches(q, t.title, t.next_action, t.description, t.category))
  const list = base.filter(t => role === 'ALL' || roleOf(t) === role).sort(rankTasks(data.events))
  const hidden = data.tasks.filter(t => TABS[tab](t) && !visible(t)).length
  const shows = data.events.filter(e => list.some(t => t.event_id === e.id)).sort((a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? ''))
  const general = list.filter(t => !t.event_id || !eventsById.has(t.event_id))
  const byRole = general.reduce<Record<string, Task[]>>((g, t) => { (g[roleOf(t)] ??= []).push(t); return g }, {})
  const openCount = data.tasks.filter(t => TABS.Active(t) && visible(t)).length
  return <>
    <section className="hero small"><p>TO-DO · THE SET LIST</p><h1>{openCount} on the list</h1>
      <span>Grouped by show, soonest first. Tap a show’s name for everything about it; tap a task for its details.</span></section>
    <section className="panel"><AddTask events={data.events}/></section>
    <Panel title="To-Do" action={<div className="filters">
      <div className="tabs" role="tablist">{(Object.keys(TABS) as (keyof typeof TABS)[]).map(k =>
        <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{k} ({data.tasks.filter(t => TABS[k](t) && visible(t)).length})</button>)}</div>
      <select value={bu} onChange={e => setBu(e.target.value)} aria-label="Business unit"><option value="ALL">Everyone</option>{Object.entries(BU_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    </div>}>
      <div className="rolechips" role="group" aria-label="Kind of work">
        <button className={role === 'ALL' ? 'on' : ''} onClick={() => setRole('ALL')}>All ({base.length})</button>
        {ROLES.map(r => { const n = base.filter(t => roleOf(t) === r).length
          return n ? <button key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>{r} ({n})</button> : null })}
      </div>
      {shows.map(e => { const ts = list.filter(t => t.event_id === e.id), d = daysUntil(e.event_date)
        return <div key={e.id} className="group showgroup colored" style={{ ['--sc' as string]: showColor(e.id) }}>
          <h3><button className="linkbtn" onClick={() => openShow(e.id)}><span className="sgdate">{fmtDate(e.event_date, { weekday: 'short', month: 'short', day: 'numeric' })}</span> {e.title}</button>
            <span>{ts.length}</span>{d != null && <small>{d < 0 ? 'played' : d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`}</small>}</h3>
          <Capped tasks={ts}/>
        </div> })}
      {general.length > 0 && <div className="group showgroup">
        <h3>Office &amp; general <small>not tied to one show</small> <span>{general.length}</span></h3>
        {ROLES.filter(r => byRole[r]).map(r => <div key={r}><h4 className="rolehead">{r}</h4><Capped tasks={byRole[r]} n={4}/></div>)}
      </div>}
      {list.length === 0 && <Empty>All done here. Nice work. ★</Empty>}
      <p className="note">{allSteps ? 'Showing every show-checklist step. ' : hidden ? `${hidden} checklist steps due more than 2 weeks out stay tucked inside each show. ` : ''}
        <button className="linkbtn" onClick={() => setAllSteps(!allSteps)}>{allSteps ? 'Hide later checklist steps' : 'Show them all here'}</button></p>
    </Panel>
  </>
}

// ---------------- Shows ----------------
export function Shows({ data, q, openShow, initialMode = 'list' }: { data: Data; q: string; openShow: (id: string) => void; initialMode?: 'list' | 'calendar' }) {
  const [showPast, setShowPast] = useState(false); const [mode, setMode] = useState<'list' | 'calendar'>(initialMode)
  const { busy, err, run } = useAsync()
  const catchUps = data.tasks.filter(t => t.catch_up && t.status !== 'COMPLETE' && t.status !== 'ARCHIVED')
  const [showCatch, setShowCatch] = useState(false)
  const clearCatchUps = () => { if (confirm(`Mark all ${catchUps.length} earlier checklist steps as handled? These were due before Opry Ops started on Sept 28. Only do this if they were really taken care of.`)) run(() => confirmCatchUp()) }
  // Per show: how many earlier steps, plus the evidence (already on sale in Etix) that booking steps were done.
  const catchShows = data.events.filter(e => catchUps.some(t => t.event_id === e.id)).sort((a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? ''))
  const clearShow = (e: Event, n: number) => { if (confirm(`Mark ${n} earlier steps for ${e.title} as handled? Only if they really were taken care of.`)) run(() => confirmCatchUp(e.id)) }
  const list = data.events.filter(e => matches(q, e.title))
  const ahead = list.filter(e => (daysUntil(e.event_date) ?? 0) >= 0)
  const upcoming = ahead.filter(e => !isHoldOrCancelled(e))
  const holds = ahead.filter(e => e.show_status === 'HOLD')
  const [showHolds, setShowHolds] = useState(false)
  const past = list.filter(e => (daysUntil(e.event_date) ?? 0) < 0).reverse()
  const sold = upcoming.reduce((s, e) => s + (e.tickets_sold ?? 0), 0)
  return <>
    <section className="hero small"><p>SHOWS · THE BOX OFFICE WINDOW</p><h1>{upcoming.length} booked show{upcoming.length === 1 ? '' : 's'} coming up</h1>
      <span>{sold.toLocaleString()} tickets sold so far. Tap any ticket for everything about that show — checklist, rider, tickets and files.</span></section>
    <section className="panel slim"><RefreshSales events={data.events}/></section>
    {catchUps.length > 0 && <section className="panel slim catchall"><div className="refreshbar">
      <span><b>{catchUps.length} earlier checklist steps</b> are waiting to be confirmed across {catchShows.length} shows (due before Opry Ops started). Confirm them one show at a time.</span>
      <button className="linkbtn" onClick={() => setShowCatch(!showCatch)}>{showCatch ? 'Hide' : 'Go show by show'}</button></div>
      {showCatch && <div className="catchlist">
        {catchShows.map(e => { const ts = catchUps.filter(t => t.event_id === e.id), d = daysUntil(e.event_date), near = d != null && d >= 0 && d <= 10
          return <div key={e.id} className="catchrow" style={{ ['--sc' as string]: showColor(e.id) }}>
            <div><b>{e.title}</b><small>{fmtDate(e.event_date, { weekday: 'short', month: 'short', day: 'numeric' })} · {ts.length} step{ts.length === 1 ? '' : 's'}
              {e.show_type !== 'HOUSE' && e.tickets_sold ? ` · on sale in Etix, ${e.tickets_sold} sold — booking steps are almost certainly done` : ''}</small></div>
            {near ? <button onClick={() => openShow(e.id)}>Show is soon — review</button> : <button disabled={busy} onClick={() => clearShow(e, ts.length)}>All handled</button>}
          </div> })}
        <p className="note">Not sure about one? Open the show and tick steps one at a time. <button className="linkbtn" disabled={busy} onClick={clearCatchUps}>Everything before Sept 28 was handled</button></p>
      </div>}
      {err && <p className="msg error">{err}</p>}</section>}
    <Panel kicker={`${upcoming.length} BOOKED SHOWS · ${sold.toLocaleString()} TICKETS SOLD`} title="Shows" action={<div className="tabs" role="tablist">
      {(['list', 'calendar'] as const).map(m => <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m === 'list' ? 'List' : 'Calendar'}</button>)}</div>}>
      {mode === 'calendar' ? <ShowCalendar events={data.events} openShow={openShow}/> : <>
      {upcoming.map(e => <ShowCard key={e.id} event={e} tasks={data.tasks.filter(t => t.event_id === e.id)} onOpen={() => openShow(e.id)}/>)}
      {upcoming.length === 0 && <Empty>No shows on the books yet — the sign out front is waiting.</Empty>}
      <p className="note">Ticket numbers are real Etix sales (they reach us through Cymbal). Each card says when they were last updated.</p>
      </>}
    </Panel>
    {holds.length > 0 && <Panel kicker="NOT BOOKED YET" title={`Holds & pending deals (${holds.length})`} action={<button className="linkbtn" onClick={() => setShowHolds(!showHolds)}>{showHolds ? 'Hide' : 'Show'}</button>}>
      <p className="note">Dates we’re holding or deals still being worked out. They’re not counted as shows until they’re booked.</p>
      {showHolds && holds.map(e => <ShowCard key={e.id} event={e} tasks={data.tasks.filter(t => t.event_id === e.id)} onOpen={() => openShow(e.id)}/>)}
    </Panel>}
    <Panel title={`Past shows (${past.length})`} action={<button className="linkbtn" onClick={() => setShowPast(!showPast)}>{showPast ? 'Hide' : 'Show'}</button>}>
      {showPast && past.map(e => <ShowCard key={e.id} event={e} tasks={data.tasks.filter(t => t.event_id === e.id)} onOpen={() => openShow(e.id)}/>)}
    </Panel>
  </>
}

// ---------------- Wednesday Meeting ----------------
export const BUCKETS = ['Updates to give', 'Updates/questions needed', 'Decisions needed', 'Upcoming shows', 'Marketing & ticket sales', 'Ideas & opportunities', 'Problems / risks', 'Assignments / next steps']

function MeetingRow({ item }: { item: MeetingItem }) {
  const [decision, setDecision] = useState(''); const [open, setOpen] = useState(false)
  const { busy, err, run } = useAsync()
  const decide = () => run(() => updateMeetingItem(item, { decision, status: 'DECIDED', meeting_date: nextWednesday() }, 'Decision recorded'))
  const toTask = () => run(async () => {
    const t = await addTask({ title: item.title.replace(/^[^:]+:\s*/, '').slice(0, 140) || item.title, next_action: item.next_step, business_unit: item.business_unit, priority: 'High', description: `From Wednesday meeting item: ${item.title}${decision ? `\nDecision: ${decision}` : ''}` })
    await updateMeetingItem(item, { status: 'CONVERTED', next_step: `Task created: ${t.title}`, meeting_date: nextWednesday() }, 'Converted to task')
  })
  return <div className="mitem">
    <button className="tasktitle" onClick={() => setOpen(!open)} aria-expanded={open}><strong>{item.title}</strong></button>
    <small>{[item.owner && `Who decides: ${item.owner}`, item.next_step && `Next: ${item.next_step}`].filter(Boolean).join(' · ')}</small>
    {open && <div className="taskdetail">
      {item.detail && <p className="pre">{item.detail}</p>}
      <label className="grow">Answer / decision<input value={decision} onChange={e => setDecision(e.target.value)} placeholder="What was decided or answered?"/></label>
      <div className="actions">
        <button disabled={busy || !decision.trim()} onClick={decide}>Save answer</button>
        <button disabled={busy} onClick={toTask}>Turn into a task</button>
        <button disabled={busy} onClick={() => run(() => updateMeetingItem(item, { status: 'ARCHIVED' }, 'Removed from agenda'))}>Remove from agenda</button>
      </div>
      {err && <p className="msg error">{err}</p>}
    </div>}
  </div>
}

export function Wednesday({ data, q }: { data: Data; q: string }) {
  const [title, setTitle] = useState(''); const [bucket, setBucket] = useState(BUCKETS[1]); const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState(false); const [step, setStep] = useState(0)
  const { busy, err, run } = useAsync()
  const wed = nextWednesday()
  const open = data.meeting.filter(m => m.status === 'OPEN' && matches(q, m.title, m.detail))
  const done = data.meeting.filter(m => ['DECIDED', 'CONVERTED'].includes(m.status) && m.meeting_date === wed)
  const ideas = data.ideas.filter(i => i.add_to_wednesday && !['ARCHIVED', 'ROUTED_TASK'].includes(i.status))
  const waiting = data.tasks.filter(t => t.status === 'WAITING').sort(rankTasks(data.events))
  const shows = data.events.filter(e => { const d = daysUntil(e.event_date); return d != null && d >= 0 && d <= 45 })
  // Each owner question shows once (under Decisions needed). Meeting items and "Update on…" rows that restate one are hidden here.
  const asks = data.decisions.filter(isWaiting).map(d => new Set(words(d.title.replace(/[-/]/g, ' '))))
  const repeatsAsk = (text: string) => { const w = words(text.replace(/[-/]/g, ' ')); return asks.some(a => w.filter(x => a.has(x)).length >= 2) }
  const add = (e: FormEvent) => { e.preventDefault(); run(async () => { await addMeetingItem({ title: title.trim(), item_type: bucket }); setTitle('') }) }

  const recap = [`Wednesday team meeting — ${fmtDate(wed, { weekday: 'long', month: 'long', day: 'numeric' })}`, '',
    'DECISIONS / ANSWERS', ...done.filter(m => m.decision).map(m => `• ${m.title} — ${m.decision}`), '',
    'NEW TASKS', ...done.filter(m => m.status === 'CONVERTED').map(m => `• ${m.next_step?.replace('Task created: ', '')}`), '',
    'STILL OPEN (carry forward)', ...open.map(m => `• ${m.title}`)].join('\n')

  return <>
    <section className="hero small">
      <p>WEDNESDAY TEAM MEETING · ~11:00 AM</p>
      <h1>{fmtDate(wed, { weekday: 'long', month: 'long', day: 'numeric' })}</h1>
      <span>{open.length} questions/items · {ideas.length} ideas to raise · {waiting.length} things you’re waiting on · {shows.length} shows in the next 45 days</span>
    </section>
    <section className="panel">
      <form className="addform" onSubmit={add}>
        <label className="grow">Add a question or item<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ask Jamie about…"/></label>
        <label>Section<select value={bucket} onChange={e => setBucket(e.target.value)}>{BUCKETS.map(b => <option key={b}>{b}</option>)}</select></label>
        <button className="primary" disabled={busy || !title.trim()}><Plus size={17}/> Add</button>
      </form>
      {err && <p className="msg error">{err}</p>}
    </section>
    <div className="modebar"><button className="primary" onClick={() => { setMode(!mode); setStep(0) }}>{mode ? 'Exit Meeting Mode' : '▶ Start Meeting Mode'}</button>
      {mode && <span>One section at a time. Use Next / Back to move through the agenda.</span>}</div>
    {(() => { const sections = BUCKETS.map(b => {
      const items = open.filter(m => (m.item_type ?? BUCKETS[1]) === b && (b === 'Decisions needed' || !repeatsAsk(m.title)))
      const extra = b === 'Upcoming shows' ? shows.map(e => <div className="mitem auto" key={e.id}><strong>{e.title}</strong><small>{fmtDate(e.event_date)} {fmtTime(e.starts_at)} · {e.tickets_sold != null ? `${e.tickets_sold} sold${e.venue?.capacity ? ` of ${e.venue.capacity}` : ''}` : (e.ticketing_system ?? 'No ticket data')}</small></div>)
        : b === 'Ideas & opportunities' ? ideas.map(i => <div className="mitem auto" key={i.id}><strong>{i.body}</strong><small>From Idea Drop</small></div>)
        : b === 'Decisions needed' ? data.decisions.filter(isWaiting).map(d => <DecisionCard key={d.id} d={d} event={d.event_id ? data.events.find(e => e.id === d.event_id) : undefined} compact/>)
        : b === 'Updates/questions needed' ? waiting.filter(t => !repeatsAsk(t.title)).map(t => <div className="mitem auto" key={t.id}><strong>Update on: {t.title}</strong><small>Waiting on: {t.waiting_on ?? '—'}</small></div>)
        : []
      if (!items.length && !extra.length) return null
      return <Panel key={b} title={b}>{items.map(m => <MeetingRow key={m.id} item={m}/>)}{extra}</Panel>
    }).filter(Boolean)
    if (!mode) return sections
    const i = Math.min(step, sections.length - 1)
    return <div className="meetingmode">
      <div className="mmnav"><button disabled={i === 0} onClick={() => setStep(i - 1)}>← Back</button><b>Section {i + 1} of {sections.length}</b><button disabled={i === sections.length - 1} onClick={() => setStep(i + 1)}>Next →</button></div>
      {sections[i]}
    </div> })()}
    <Panel kicker="AFTER THE MEETING" title="Recap" action={<button className="linkbtn" onClick={() => { navigator.clipboard?.writeText(recap); setCopied(true) }}><Copy size={15}/> {copied ? 'Copied' : 'Copy recap'}</button>}>
      <pre className="recap">{recap}</pre>
    </Panel>
  </>
}

// ---------------- Ideas ----------------
const IDEA_STATUS: Record<string, string> = { NEW: 'New', RESEARCH: 'Researching', ROUTED_TASK: 'Became a task', ARCHIVED: 'Archived' }
function IdeaRow({ idea }: { idea: Idea }) {
  const { busy, err, run } = useAsync()
  const toTask = () => run(async () => {
    await addTask({ title: idea.body.replace(/^Idea:\s*/, '').split('\n')[0].slice(0, 140), description: `From idea: ${idea.body}`, business_unit: idea.business_unit, priority: 'Medium' })
    await updateIdea(idea, { status: 'ROUTED_TASK' }, 'Idea turned into a task (original kept)')
  })
  return <div className="mitem">
    <strong className="pre">{idea.body}</strong>
    <small>{[IDEA_STATUS[idea.status] ?? idea.status, idea.objective && `Goal: ${idea.objective}`, idea.add_to_wednesday && 'On Wednesday agenda', fmtDate(idea.created_at, { month: 'short', day: 'numeric' })].filter(Boolean).join(' · ')}</small>
    <div className="actions">
      <button disabled={busy} onClick={toTask}>Make a task</button>
      <button disabled={busy} onClick={() => run(() => updateIdea(idea, { add_to_wednesday: !idea.add_to_wednesday }, idea.add_to_wednesday ? 'Removed from Wednesday' : 'Added to Wednesday'))}>{idea.add_to_wednesday ? 'Take off Wednesday' : 'Bring to Wednesday'}</button>
      {idea.status !== 'RESEARCH' && <button disabled={busy} onClick={() => run(() => updateIdea(idea, { status: 'RESEARCH' }, 'Moved to research'))}>Research it</button>}
      <button disabled={busy} onClick={() => run(() => updateIdea(idea, { status: 'ARCHIVED', add_to_wednesday: false }, 'Archived'))}>Archive</button>
    </div>
    {err && <p className="msg error">{err}</p>}
  </div>
}

export function Ideas({ data, q }: { data: Data; q: string }) {
  const [showDone, setShowDone] = useState(false)
  const list = data.ideas.filter(i => matches(q, i.body, i.objective))
  const active = list.filter(i => ['NEW', 'RESEARCH'].includes(i.status))
  const done = list.filter(i => !['NEW', 'RESEARCH'].includes(i.status))
  return <>
    <IdeaDrop/>
    <Panel kicker="IDEAS & OPPORTUNITIES" title={`${active.length} to sort`}>
      {active.map(i => <IdeaRow key={i.id} idea={i}/>)}
      {active.length === 0 && <Empty>No ideas waiting. Use Idea Drop on My Day when one strikes.</Empty>}
    </Panel>
    <Panel title={`Sorted (${done.length})`} action={<button className="linkbtn" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'}</button>}>
      {showDone && done.map(i => <div className="mitem" key={i.id}><strong className="pre">{i.body}</strong><small>{IDEA_STATUS[i.status] ?? i.status}</small></div>)}
    </Panel>
  </>
}


// "Print my day": one page to keep on the desk — today's known to-dos with empty lines for more, a brain dump box,
// emails, shows this week, marketing steps, who we're waiting on, and (Wednesdays) the meeting.
function DayPrint({ today, isWed, data, eventsById, overdue, prep, week, mail, shows, plan, churches }: {
  today: string; isWed: boolean; data: Data; eventsById: Map<string, Event>; overdue: Task[]; prep: Task[]; week: Task[]; mail: Mail[]; shows: Event[]; plan: PlanItem[]; churches: Church[]
}) {
  const show = (id: string | null) => (id && eventsById.get(id)?.title) || ''
  const line = (t: Task) => <li key={t.id}><span className="box"/>{t.title}{show(t.event_id) && <em> — {show(t.event_id)}</em>}{t.due_at && <small> (due {fmtDate(t.due_at, { month: 'short', day: 'numeric' })})</small>}</li>
  const dueToday = week.filter(t => t.due_at?.slice(0, 10) === today), later = week.filter(t => t.due_at?.slice(0, 10) !== today)
  const waiting = data.tasks.filter(t => t.status === 'WAITING').slice(0, 8)
  const agenda = data.meeting.filter(m => m.status === 'OPEN')
  const blanks = (n: number) => Array.from({ length: n }, (_, i) => <li key={'b' + i} className="blank"><span className="box"/></li>)
  return <article className="sheet daysheet">
    <div className="sheethead"><div><small>KENTUCKY OPRY · MY DAY</small><h1>{fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h1>
      <p>{isWed ? 'Team meeting today (~11:00 AM)' : `Next team meeting: ${fmtDate(nextWednesday(), { weekday: 'long', month: 'short', day: 'numeric' })}`}</p></div></div>
    <div className="sheetcols">
      <section><h2>To do today</h2><ul className="todo">{[...overdue, ...prep, ...dueToday].slice(0, 14).map(line)}{blanks(6)}</ul>
        {later.length > 0 && <><h2>Later this week</h2><ul className="todo">{later.slice(0, 8).map(line)}</ul></>}
        {plan.length > 0 && <><h2>Marketing (campaign plans)</h2><ul className="todo">{plan.slice(0, 8).map(i => <li key={i.id}><span className="box"/>{fmtDate(i.run_on, { weekday: 'short', month: 'short', day: 'numeric' })}{i.run_time ? ` ${i.run_time}` : ''} · {i.channel}: {i.hook && i.hook !== '—' ? i.hook : i.job}<em> — {show(i.event_id)}</em></li>)}</ul></>}
      </section>
      <section>
        {mail.length > 0 && <><h2>Emails to answer</h2><ul className="todo">{mail.slice(0, 8).map(m => <li key={m.id}><span className="box"/>{m.subject}<small> — {m.from_address}</small></li>)}</ul></>}
        {shows.length > 0 && <><h2>Shows this week</h2><ul>{shows.map(e => <li key={e.id}><b>{fmtDate(e.event_date, { weekday: 'short', month: 'short', day: 'numeric' })}</b> {e.title}{e.starts_at ? ` · ${fmtTime(e.starts_at)}` : ''}{e.tickets_sold != null ? ` · ${e.tickets_sold} sold` : ''}</li>)}</ul></>}
        {(waiting.length > 0 || churches.length > 0) && <><h2>Follow up / waiting on</h2><ul className="todo">{waiting.map(t => <li key={t.id}><span className="box"/>{t.title}{t.waiting_on && <small> — {t.waiting_on}</small>}</li>)}
          {churches.slice(0, 5).map(c => <li key={c.id}><span className="box"/>Church follow-up: {c.name}</li>)}</ul></>}
        {isWed && agenda.length > 0 && <><h2>Meeting agenda</h2><ul>{agenda.slice(0, 10).map(m => <li key={m.id}>{m.title}</li>)}</ul></>}
      </section>
    </div>
    <section className="brain"><h2>Brain dump</h2><div className="lines"/></section>
    <div className="sheetcols">
      <section className="brain small"><h2>For Wednesday’s meeting</h2><div className="lines"/></section>
      <section className="brain small"><h2>Tomorrow</h2><div className="lines"/></section>
    </div>
  </article>
}
