import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { todayISO, useTable, type Event } from './lib/data'
import { showColor } from './components'

// Month view of every show: Opry artist shows, free house nights, CCP shows at other theaters, and pending deals (dimmed).
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const iso = (d: Date) => d.toLocaleDateString('en-CA')
type Closed = { id: string; starts_on: string; ends_on: string; label: string; note: string | null }

export function ShowCalendar({ events, openShow }: { events: Event[]; openShow: (id: string) => void }) {
  const today = todayISO()
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const closed = useTable<Closed>('closed_dates', 'id, starts_on, ends_on, label, note', { column: 'starts_on' }).rows
  const closedOn = (key: string) => closed.find(c => key >= c.starts_on && key <= c.ends_on)
  const byDay = useMemo(() => {
    const m = new Map<string, Event[]>()
    for (const e of events) if (e.event_date) (m.get(e.event_date) ?? m.set(e.event_date, []).get(e.event_date)!).push(e)
    return m
  }, [events])
  const first = new Date(month + '-01T12:00:00')
  const start = new Date(first); start.setDate(1 - first.getDay())
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  const shift = (n: number) => { const d = new Date(first); d.setMonth(d.getMonth() + n); setMonth(iso(d).slice(0, 7)) }
  const label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const inMonth = events.filter(e => e.event_date?.startsWith(month))

  return <div className="cal">
    <div className="calhead">
      <button onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={20}/></button>
      <h3>{label}</h3>
      <button onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={20}/></button>
      <button className="caltoday" onClick={() => setMonth(today.slice(0, 7))}>This month</button>
      <small>{inMonth.length} show{inMonth.length === 1 ? '' : 's'}</small>
    </div>
    <div className="calgrid" role="grid">
      {DOW.map(d => <div key={d} className="caldow">{d}</div>)}
      {days.map(d => { const key = iso(d), list = byDay.get(key) ?? [], other = key.slice(0, 7) !== month, shut = closedOn(key)
        return <div key={key} className={'calday' + (other ? ' other' : '') + (key === today ? ' today' : '') + (list.length ? ' has' : '') + (shut ? ' closed' : '')}
          title={shut ? `${shut.label}${shut.note ? ` — ${shut.note}` : ''}` : undefined}>
          <span className="calnum">{d.getDate()}</span>
          {shut && (key === shut.starts_on || d.getDay() === 0) && <span className="calclosed">{shut.label}</span>}
          {list.map(e => { const house = e.show_type === 'HOUSE' || e.show_type === 'RENTAL', hold = e.show_status === 'HOLD'
            return <button key={e.id} className={'calev' + (hold ? ' hold' : '') + (house ? ' house' : '') + (e.business_unit === 'CCP' ? ' ccp' : '')}
              style={{ ['--sc' as string]: showColor(e.id) }} onClick={() => openShow(e.id)}
              title={`${e.title}${e.venue?.name ? ` · ${e.venue.name}` : ''}${hold ? ' · pending deal' : ''}`}>
              {house ? '★ ' : ''}{e.title}{e.business_unit === 'CCP' ? <small> · {e.venue?.name ?? 'CCP'}</small> : null}{hold ? <small> · pending</small> : null}
            </button> })}
        </div> })}
    </div>
    <p className="note calkey"><span className="k artist"/> Artist show <span className="k house"/> ★ Free house night <span className="k ccp"/> CCP at another theater <span className="k hold"/> Pending deal <span className="k closed"/> Closed / no show</p>
  </div>
}
