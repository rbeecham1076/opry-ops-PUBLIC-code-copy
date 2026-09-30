import { useState, type ReactNode } from 'react'
import { fmtDate, whoLabel, isWaiting, money, needsAYes, rankTasks, rankDecisions, recordDecision, type Decision, type Event, type Task } from './lib/data'
import { Empty, Panel, ShowTag, useAsync } from './components'
import { StepRow } from './workspace'
import { RequestBuilder } from './requests'
import { Detail } from './popup'

const WHO = ['Jamie', 'Clay', 'Barbie', 'Owners / Jamie', 'Rach']
const KIND_LABEL: Record<string, string> = { QUESTION: 'Question', BUDGET: 'Ad money', PURCHASE: 'Purchase', TOOL: 'New tool or service', PROCESS: 'Better way to do something', PUBLISH: 'Publish / go live', CONTRACT: 'Contract', DEPOSIT: 'Deposit / payment', TRACKING: 'Tracking / systems', RULE: 'Working rule', OTHER: 'Other' }

// Who has to answer: "Owners / Jamie" → Clay, Barbie, Jamie.
export function whoOf(approver: string | null | undefined): string[] {
  const a = (approver ?? '').toLowerCase(), out: string[] = []
  if (/owner|clay/.test(a)) out.push('Clay')
  if (/owner|barbie/.test(a)) out.push('Barbie')
  if (/jamie/.test(a)) out.push('Jamie')
  if (/rach/.test(a)) out.push('Rach')
  return out.length ? out : ['Clay', 'Barbie']
}
export function WhoChips({ approver }: { approver: string | null | undefined }) {
  const names = whoOf(approver)
  return <span className="whochips" aria-label={`Needs ${names.join(', ')}`}>{names.map(n => <i key={n} title={n}>{n[0]}</i>)}<small>{names.join(' · ')}</small></span>
}

// A show sign-off as a request slip: the stub says when it's due and who signs.
export function SignOffSlip({ due, who, children }: { due?: string | null; who?: string | null; children: ReactNode }) {
  return <div className="decision open slip signoff">
    <div className="slip-stub"><span className="slip-label">Sign-off</span><b>{due ? fmtDate(due, { month: 'short', day: 'numeric' }) : '—'}</b><small>due</small><WhoChips approver={who}/></div>
    <div className="slip-body">{children}</div></div>
}

// Three different looks, never mixed: RECOMMENDATION (dashed, amber) · DECISION (solid, green/grey) · open QUESTION.
export function DecisionCard({ d, event, compact }: { d: Decision; event?: Event; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [who, setWho] = useState(d.approver && WHO.includes(d.approver) ? d.approver : 'Jamie')
  const [text, setText] = useState(''); const [amount, setAmount] = useState('')
  const { busy, err, run } = useAsync()
  const record = (outcome: 'APPROVED' | 'DECLINED' | 'ANSWERED') => run(() => recordDecision(d, outcome, who, text.trim(), outcome === 'APPROVED' && amount ? Number(amount) : null))
  const waiting = isWaiting(d)
  const rec = (d.recommendation || d.recommended_amount != null) ? <div className="rec">
      <b>SUGGESTED — not approved yet{d.recommended_by ? ` · from ${d.recommended_by}` : ''}</b>
      {d.recommended_amount != null && <span className="amt">{money(d.recommended_amount)}</span>}
      {d.recommendation && <p>{d.recommendation}</p>}
      {d.evidence && <small>Evidence: {d.evidence}</small>}
    </div> : null
  const days = d.created_at ? Math.max(0, Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000)) : null
  return <div className={'decision ' + d.status.toLowerCase() + (waiting ? ' slip' : '')}>
    {waiting && <div className="slip-stub"><span className="slip-label">Waiting</span><b>{days ?? '—'}</b><small>{days === 1 ? 'day' : 'days'}</small><WhoChips approver={d.approver}/></div>}
    <div className="slip-body">
    <div className="dtop">
      <span className="pill">{KIND_LABEL[d.kind] ?? d.kind}</span>
      {event && <ShowTag event={event}/>}
      {waiting && d.approver && !compact && <span className="pill violet">Needs: {d.approver}</span>}
      {!waiting && <span className={'pill ' + (d.status === 'APPROVED' ? 'green' : d.status === 'DECLINED' ? 'red' : '')}>{d.status === 'APPROVED' ? 'Approved' : d.status === 'DECLINED' ? 'Declined' : d.status === 'ANSWERED' ? 'Decided' : 'Withdrawn'}</span>}
    </div>
    <strong>{d.title}</strong>
    {d.why && !compact && <small>Why: {d.why}</small>}
    {!compact && d.goal && <small>What it should do: {d.goal}</small>}
    {!compact && d.success_measure && <small>How we’ll know it worked: {d.success_measure}{d.check_on ? ` Report back by ${fmtDate(d.check_on, { month: 'short', day: 'numeric' })}.` : ''}</small>}
    {!compact && d.note && <small className="dnote">Rach’s note: {d.note}</small>}
    {!compact && rec}
    {!waiting && (d.decision || d.approved_amount != null) && <div className="dec">
      <b>{d.status === 'APPROVED' ? 'APPROVED' : d.status === 'DECLINED' ? 'DECLINED' : 'DECIDED'} by {d.decided_by} · {fmtDate(d.decided_at, { month: 'short', day: 'numeric', year: 'numeric' })}</b>
      {d.approved_amount != null && <span className="amt">{money(d.approved_amount)}</span>}
      {d.decision && <p>{d.decision}</p>}
    </div>}
    {waiting && d.next_step && !compact && <small>Next step: {d.next_step}</small>}
    {waiting && <>
      <button className="btn secondary small slip-go" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Record the answer'} →</button>
      <Detail open={open} title={d.title} kicker={`${KIND_LABEL[d.kind] ?? d.kind}${d.approver ? ` · needs ${d.approver}` : ''}`} onClose={() => setOpen(false)}><div className="taskdetail">
        {compact && d.why && <p><b>Why:</b> {d.why}</p>}
        {compact && d.next_step && <p><b>Next step:</b> {d.next_step}</p>}
        {compact && d.note && <p><b>Your note:</b> {d.note}</p>}
        {compact && rec}
        <div className="addform">
          <label>Who decided<select value={who} onChange={e => setWho(e.target.value)}>{WHO.map(w => <option key={w} value={w}>{whoLabel(w)}</option>)}</select></label>
          <label className="grow">What they said<input value={text} onChange={e => setText(e.target.value)} placeholder="The answer or decision, in their words"/></label>
          {(d.kind === 'BUDGET' || d.recommended_amount != null) && <label>Approved amount $<input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="only what they approved"/></label>}
        </div>
        {d.recommended_amount != null && !amount && <button className="linkbtn" onClick={() => setAmount(String(d.recommended_amount))}>They approved the recommended {money(d.recommended_amount)}</button>}
        <div className="actions">
          {d.kind !== 'QUESTION' && <button disabled={busy} onClick={() => record('APPROVED')}>Approved</button>}
          {d.kind !== 'QUESTION' && <button disabled={busy} onClick={() => record('DECLINED')}>Declined</button>}
          <button disabled={busy || !text.trim()} onClick={() => record('ANSWERED')}>{d.kind === 'QUESTION' ? 'Save answer' : 'Decided (other)'}</button>
        </div>
        {err && <p className="msg error">{err}</p>}
      </div></Detail>
    </>}
    </div>
  </div>
}

export function Approvals({ decisions, tasks, events, q }: { decisions: Decision[]; tasks: Task[]; events: Event[]; q: string }) {
  const [tab, setTab] = useState<'waiting' | 'ask' | 'log'>('waiting')
  const byId = new Map(events.map(e => [e.id, e]))
  const m = (d: Decision) => !q || [d.title, d.decision, d.recommendation].some(f => f?.toLowerCase().includes(q.toLowerCase()))
  const waiting = decisions.filter(d => isWaiting(d) && m(d)).sort(rankDecisions(events))
  const groups = waiting.reduce<Record<string, Decision[]>>((g, d) => { (g[d.approver ?? 'Not assigned'] ??= []).push(d); return g }, {})
  const signOffs = needsAYes(decisions, tasks).signOffs.sort(rankTasks(events))
  const decided = decisions.filter(d => !isWaiting(d) && m(d))
  return <>
    <section className="hero small">
      <p>NEEDS A YES · APPROVALS</p>
      <h1>{waiting.length + signOffs.length ? `${waiting.length + signOffs.length} waiting on an answer` : 'Nothing waiting on an answer'}</h1>
      <span>{waiting.length} question{waiting.length === 1 ? '' : 's'} + {signOffs.length} show sign-off{signOffs.length === 1 ? '' : 's'} due in the next 2 weeks — the same count as the menu and My Day. A suggestion is never an approval; only what Jamie, Clay or Barbie decided is recorded.</span>
    </section>
    <div className="pagetabs" role="tablist">{([['waiting', `Waiting on an answer (${waiting.length + signOffs.length})`], ['ask', 'Ask for something'], ['log', `Decided (${decided.length})`]] as const).map(([k, label]) =>
      <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}</div>
    {tab === 'waiting' && <>
      {Object.entries(groups).map(([who, list]) => <Panel key={who} kicker="WAITING FOR" title={who}>
        <div className="slipgrid">{list.map(d => <DecisionCard key={d.id} d={d} event={d.event_id ? byId.get(d.event_id) : undefined}/>)}</div>
      </Panel>)}
      {waiting.length === 0 && <Panel title="Waiting for a decision"><Empty>Nothing is waiting on Clay, Barbie or Jamie. ★</Empty></Panel>}
      <Panel kicker="SHOW CHECKLISTS · NEXT 14 DAYS" title={`${signOffs.length} sign-off${signOffs.length === 1 ? '' : 's'} coming up`}>
        <div className="slipgrid">{signOffs.map(t => <SignOffSlip key={t.id} due={t.due_at} who={t.approver}>{byId.get(t.event_id ?? '') && <ShowTag event={byId.get(t.event_id ?? '')!}/>}<StepRow task={t}/></SignOffSlip>)}</div>
        {signOffs.length === 0 && <Empty>No show sign-offs due in the next two weeks.</Empty>}
      </Panel>
    </>}
    {tab === 'ask' && <Panel kicker="ASK FOR SOMETHING" title="Make a request"><RequestBuilder events={events}/></Panel>}
    {tab === 'log' && <Panel kicker="DECISION LOG" title={`Decided (${decided.length})`}>
      <p className="note">Working rules and answered questions, with who decided and when.</p>
      {decided.map(d => <DecisionCard key={d.id} d={d} event={d.event_id ? byId.get(d.event_id) : undefined} compact/>)}
    </Panel>}
  </>
}
