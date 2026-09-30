import { useState, type FormEvent } from 'react'
import { ExternalLink, Plus } from 'lucide-react'
import { supabase } from './lib/supabase'
import { fmtDate, logChange, todayISO, useTable } from './lib/data'
import { Empty, Panel, useAsync } from './components'

// Open questions: one list with a status, current notes and — once an email, note or document answers it — the answer,
// where it came from and a link. The morning routine fills in answers it finds as "Answer found"; Rach confirms.
export type Question = {
  id: string; topic: string; question: string; ask_who: string | null; priority: string; status: string; notes: string | null
  answer: string | null; answer_source: string | null; answer_url: string | null; found_by: string | null
  event_id: string | null; asked_on: string | null; answered_on: string | null; updated_at: string
}
const STATUS: Record<string, [string, string]> = {
  ANSWER_FOUND: ['Answer found — check it', 'violet'], OPEN: ['Open', 'amber'], ASKED: ['Asked — waiting', ''], ANSWERED: ['Answered ✓', 'ok'], PARKED: ['Parked', ''],
}
const TOPICS = ['Shows & data', 'Website & Etix', 'Sheets & riders', 'People & accounts', 'Other']
export const useQuestions = () => useTable<Question>('open_questions', '*', { column: 'created_at' })

async function save(q: Question, patch: Partial<Question>, note: string) {
  const { error } = await supabase!.from('open_questions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', q.id)
  if (error) throw error
  await logChange('open_question', q.id, note, Object.fromEntries(Object.keys(patch).map(k => [k, (q as Record<string, unknown>)[k]])), patch, 'SHARED')
}

function QuestionCard({ q }: { q: Question }) {
  const [notes, setNotes] = useState(q.notes ?? ''); const [answer, setAnswer] = useState(q.answer ?? '')
  const { busy, err, run } = useAsync()
  const [label, tone] = STATUS[q.status] ?? [q.status, '']
  const today = todayISO()
  return <article className={'qcard s-' + q.status.toLowerCase()}>
    <header><span className={'pill ' + tone}>{label}</span>{q.priority !== 'Normal' && <span className={'pill ' + (q.priority === 'High' ? 'red' : '')}>{q.priority}</span>}
      {q.ask_who && <small>Ask: <b>{q.ask_who}</b></small>}</header>
    <strong>{q.question}</strong>
    {(q.answer || q.status === 'ANSWER_FOUND') && <div className="qanswer">
      <b>Answer{q.found_by === 'Routine' && q.status === 'ANSWER_FOUND' ? ' (found automatically — check it)' : ''}</b>
      <p>{q.answer}</p>
      {(q.answer_source || q.answer_url) && <small>{q.answer_source}{q.answer_url && <> · <a href={q.answer_url} target="_blank" rel="noreferrer">Open it <ExternalLink size={12}/></a></>}</small>}
    </div>}
    <details><summary>Notes, answer &amp; status</summary>
      <label>Current notes<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What we know so far"/></label>
      <label>Answer<textarea rows={2} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type the answer when you have it"/></label>
      <div className="actions">
        <button disabled={busy} onClick={() => run(() => save(q, { notes: notes || null, answer: answer || null, ...(answer && !q.answer ? { status: 'ANSWERED', answered_on: today, found_by: 'Rach', answer_source: q.answer_source ?? 'Rach' } : {}) }, `Question updated: ${q.question.slice(0, 60)}`))}>Save</button>
        {q.status === 'ANSWER_FOUND' && <button className="primary" disabled={busy} onClick={() => run(() => save(q, { status: 'ANSWERED', answered_on: today }, `Answer confirmed: ${q.question.slice(0, 60)}`))}>Yes, that answers it</button>}
        {q.status === 'ANSWER_FOUND' && <button disabled={busy} onClick={() => run(() => save(q, { status: 'OPEN', answer: null, answer_source: null, answer_url: null, found_by: null }, `Found answer rejected: ${q.question.slice(0, 60)}`))}>No, still open</button>}
        {q.status === 'OPEN' && <button disabled={busy} onClick={() => run(() => save(q, { status: 'ASKED', asked_on: today }, `Asked: ${q.question.slice(0, 60)}`))}>I asked</button>}
        {q.status !== 'PARKED' && q.status !== 'ANSWERED' && <button className="linkbtn" disabled={busy} onClick={() => run(() => save(q, { status: 'PARKED' }, `Parked: ${q.question.slice(0, 60)}`))}>Park it</button>}
        {(q.status === 'PARKED' || q.status === 'ANSWERED') && <button className="linkbtn" disabled={busy} onClick={() => run(() => save(q, { status: 'OPEN' }, `Reopened: ${q.question.slice(0, 60)}`))}>Reopen</button>}
      </div>
      {err && <p className="msg error">{err}</p>}
    </details>
    <small className="muted">{q.asked_on ? `Asked ${fmtDate(q.asked_on, { month: 'short', day: 'numeric' })} · ` : ''}{q.answered_on ? `Answered ${fmtDate(q.answered_on, { month: 'short', day: 'numeric' })} · ` : ''}Updated {fmtDate(q.updated_at, { month: 'short', day: 'numeric' })}</small>
  </article>
}

export function OpenQuestions({ q: search }: { q: string }) {
  const { rows } = useQuestions()
  const [adding, setAdding] = useState(false); const [text, setText] = useState(''); const [who, setWho] = useState(''); const [topic, setTopic] = useState(TOPICS[0])
  const { busy, err, run } = useAsync()
  const match = (x: Question) => !search || [x.question, x.notes, x.answer, x.ask_who].some(f => f?.toLowerCase().includes(search.toLowerCase()))
  const list = rows.filter(match)
  const found = list.filter(x => x.status === 'ANSWER_FOUND')
  const open = list.filter(x => x.status === 'OPEN' || x.status === 'ASKED').sort((a, b) => (a.priority === 'High' ? 0 : a.priority === 'Normal' ? 1 : 2) - (b.priority === 'High' ? 0 : b.priority === 'Normal' ? 1 : 2))
  const done = list.filter(x => x.status === 'ANSWERED' || x.status === 'PARKED')
  const add = (e: FormEvent) => { e.preventDefault(); run(async () => {
    const { error } = await supabase!.from('open_questions').insert({ question: text.trim(), ask_who: who || null, topic }); if (error) throw error
    setText(''); setWho(''); setAdding(false) }) }
  return <>
    <Panel kicker="OPEN QUESTIONS" title={`${open.length} open${found.length ? ` · ${found.length} answer${found.length === 1 ? '' : 's'} to check` : ''}`}
      action={<button onClick={() => setAdding(!adding)}><Plus size={16}/> Add a question</button>}>
      <p className="note">Every weekday morning Opry Ops reads new email and notes for answers. When it finds one it shows it here as “Answer found” with a link — you confirm it. Nothing is marked answered without you.</p>
      {adding && <form className="addform" onSubmit={add}>
        <label className="grow">Question<input required value={text} onChange={e => setText(e.target.value)}/></label>
        <label>Who can answer<input value={who} onChange={e => setWho(e.target.value)} placeholder="Jamie, Clay, Tiff…"/></label>
        <label>Topic<select value={topic} onChange={e => setTopic(e.target.value)}>{TOPICS.map(t => <option key={t}>{t}</option>)}</select></label>
        <button disabled={busy}>Add</button>{err && <p className="msg error">{err}</p>}
      </form>}
      {found.length > 0 && <><h3 className="minihead">Answers found — check these</h3><div className="qgrid">{found.map(x => <QuestionCard key={x.id} q={x}/>)}</div></>}
      {TOPICS.map(t => { const inT = open.filter(x => (x.topic ?? 'Other') === t); return inT.length ? <div key={t}><h3 className="minihead">{t}</h3><div className="qgrid">{inT.map(x => <QuestionCard key={x.id} q={x}/>)}</div></div> : null })}
      {open.length === 0 && found.length === 0 && <Empty>No open questions.</Empty>}
      {done.length > 0 && <details className="qdone"><summary>Answered &amp; parked ({done.length})</summary><div className="qgrid">{done.map(x => <QuestionCard key={x.id} q={x}/>)}</div></details>}
    </Panel>
  </>
}
