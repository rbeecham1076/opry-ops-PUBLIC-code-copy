import { useMemo, useState, type FormEvent } from 'react'
import { Check, X } from 'lucide-react'
import { addTask, fmtDate, insertRow, todayISO, updateTask, useTable, type Event, type Task } from './lib/data'
import { guessArea, guessShows, guessTasks, taskTitleFrom } from './lib/logmatch'
import { useAsync } from './components'

// "Log it": jot down something you did in one tap. It reads what you wrote and shows where it will go —
// which show it's about, which task(s) it finishes, and whether a new task is needed — before anything saves.
// Everything lands in the private log (My Work → Private log & hours).
const AREAS = ['Box office', 'Booking', 'Marketing', 'Show day', 'Office', 'Systems']
type Entry = { id: string; entry_date: string; work: string; area: string | null; status: string | null }

export function LogIt({ tasks, events, onClose }: { tasks: Task[]; events: Event[]; onClose: () => void }) {
  const [work, setWork] = useState(''); const [areaPick, setAreaPick] = useState<string | null>(null); const [done, setDone] = useState(true)
  const [next, setNext] = useState(''); const [share, setShare] = useState(false); const [saved, setSaved] = useState<string[] | null>(null)
  const [showPick, setShowPick] = useState<string | null | undefined>(undefined)   // undefined = use the guess, null = no show
  const [taskPick, setTaskPick] = useState<Record<string, boolean>>({})
  const { busy, err, run } = useAsync()
  const today = todayISO()
  const todays = useTable<Entry>('role_impact_entries', 'id, entry_date, work, area, status', { column: 'created_at', ascending: false }).rows.filter(e => e.entry_date === today)

  // The guesses update as you type.
  const shows = useMemo(() => work.trim().length > 3 ? guessShows(work, events, today).slice(0, 3) : [], [work, events, today])
  const show = showPick === undefined ? shows[0]?.event : showPick ? events.find(e => e.id === showPick) : undefined
  const matches = useMemo(() => work.trim().length > 3 ? guessTasks(work, tasks, show ? [show] : []) : [], [work, tasks, show])
  const picked = (id: string, i: number) => taskPick[id] ?? (i === 0 && matches[0].score >= 0.7)
  const chosen = matches.filter((m, i) => picked(m.task.id, i)).map(m => m.task)
  const area = areaPick ?? guessArea(work) ?? 'Office'
  const newTask = !done && chosen.length === 0 ? taskTitleFrom(work, next) : done && next.trim() ? taskTitleFrom('', next) : null

  const reset = () => { setWork(''); setNext(''); setAreaPick(null); setShowPick(undefined); setTaskPick({}) }
  const save = (e: FormEvent) => { e.preventDefault(); if (!work.trim()) return
    run(async () => {
      const did: string[] = []
      for (const t of chosen) {
        if (done) { await updateTask(t, { status: 'COMPLETE', catch_up: false }, 'Done (from Log it)'); did.push(`Checked off “${t.title}”`) }
        else if (t.status !== 'IN_PROGRESS') { await updateTask(t, { status: 'IN_PROGRESS' }, 'In progress (from Log it)'); did.push(`Moved to in progress: “${t.title}”`) }
      }
      if (newTask) {
        await addTask({ title: newTask, next_action: next.trim() || null, status: done ? 'OPEN' : 'IN_PROGRESS', priority: 'Medium',
          event_id: show?.id ?? null, business_unit: show?.business_unit ?? 'SHARED', description: `Added from Log it on ${fmtDate(today, { month: 'short', day: 'numeric' })}: ${work.trim()}` })
        did.push(`Added task “${newTask}”`)
      }
      const id = crypto.randomUUID()
      await insertRow('role_impact_entries', { id, entry_date: today, area, work: work.trim(), what_i_did: work.trim(), status: done ? 'Done' : 'In Progress',
        next: next.trim() || null, evidence_or_result: did.length ? did.join(' · ') : null, include_in_owner_report: share, source: 'Opry Ops — Log it' },
        'Logged: ' + work.trim().slice(0, 60), id)
      setSaved([`Logged “${work.trim().slice(0, 50)}${work.trim().length > 50 ? '…' : ''}”`, ...did]); reset()
    }) }

  return <section className="panel logit" aria-label="Log it">
    <div className="logit-head"><div><small>PUNCH IT IN</small><h2>Log it</h2></div>
      <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}><X size={20}/></button></div>
    <form onSubmit={save}>
      <label className="sr-only" htmlFor="logit-work">What did you do?</label>
      <textarea id="logit-work" rows={2} value={work} onChange={e => { setWork(e.target.value); setSaved(null) }} placeholder="What did you do? e.g. “Filled out the Isaacs Benton contract and sent it to the artist office”" autoFocus/>
      <div className="logit-row">
        <div className="seg" role="group" aria-label="Status">
          <button type="button" className={done ? 'on' : ''} aria-pressed={done} onClick={() => setDone(true)}>Done</button>
          <button type="button" className={!done ? 'on' : ''} aria-pressed={!done} onClick={() => setDone(false)}>Still working on it</button>
        </div>
        <input className="logit-next" value={next} onChange={e => setNext(e.target.value)} placeholder={done ? 'Anything still to do? (adds a task)' : 'Next step (optional)'} aria-label="Next step"/>
      </div>

      {work.trim().length > 3 && <div className="logit-where" aria-live="polite">
        <small>WHERE THIS GOES</small>
        <div className="lw-row"><b>Show</b>
          {shows.map(g => <button type="button" key={g.event.id} className={'lchip' + (show?.id === g.event.id ? ' on' : '')} onClick={() => { setShowPick(g.event.id); setTaskPick({}) }}>
            {g.event.title} · {fmtDate(g.event.event_date, { month: 'short', day: 'numeric', year: '2-digit' })}{g.event.venue?.city ? ` · ${g.event.venue.city}` : ''}</button>)}
          <button type="button" className={'lchip' + (!show ? ' on' : '')} onClick={() => { setShowPick(null); setTaskPick({}) }}>{shows.length ? 'Not a show' : 'Not about a show'}</button>
        </div>
        {matches.length > 0 && <div className="lw-row col"><b>{done ? 'Check off' : 'Mark in progress'}</b>
          {matches.map((m, i) => <label key={m.task.id} className="lw-task"><input type="checkbox" checked={picked(m.task.id, i)} onChange={e => setTaskPick({ ...taskPick, [m.task.id]: e.target.checked })}/>
            <span>{m.task.title}{m.task.due_at ? <em> · due {fmtDate(m.task.due_at, { month: 'short', day: 'numeric' })}</em> : null}</span></label>)}
        </div>}
        {newTask && <div className="lw-row"><b>New task</b><span className="lw-new">“{newTask}”{show ? <em> · {show.title}</em> : null}</span></div>}
        {!matches.length && !newTask && <p className="note">Nothing on your list matches this, so it's just logged as done.</p>}
        <div className="lw-row"><b>Kind</b>{AREAS.map(a => <button type="button" key={a} className={'lchip' + (area === a ? ' on' : '')} aria-pressed={area === a} onClick={() => setAreaPick(a)}>{a}</button>)}</div>
      </div>}

      <div className="logit-row">
        <button className="primary" disabled={busy || !work.trim()}>{busy ? 'Saving…' : 'Log it'}</button>
        <label className="inline-check"><input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)}/> OK to share with Clay and Barbie</label>
        {err && <p className="msg error">{err}</p>}
      </div>
      {saved && !busy && <ul className="logit-ok" role="status">{saved.map((s, i) => <li key={i}><Check size={15}/> {s}</li>)}</ul>}
    </form>
    {todays.length > 0 && <div className="logit-today"><small>TODAY’S CARD · {todays.length} punched</small>
      <ul>{todays.slice(0, 6).map(e => <li key={e.id}><span className={'punch' + (e.status === 'Done' ? ' done' : '')} aria-hidden="true"/><span>{e.work}{e.area ? <em> · {e.area}</em> : null}{e.status !== 'Done' ? <em> · in progress</em> : null}</span></li>)}</ul>
      <p className="note">Everything you log lives under “My work log” at the bottom of the menu.</p></div>}
  </section>
}
