import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import {
  addDecision, capacityOf, daysUntil, fmtDate, insertRow, money, showState, useShowRows, useTable,
  type Decision, type Event,
} from './lib/data'
import { Empty, Panel, showColor, useAsync } from './components'

// ---------- marketing phase (brief §8): a guide from days out, adjusted by sales ----------
export const PHASES = ['Getting ready', 'Gathering photos & video', 'Announcing', 'Early ads', 'Main ticket push', 'Final week', 'Last 2 days', 'After the show'] as const
export function marketingPhase(e: Event) {
  const d = daysUntil(e.event_date)
  if (d == null) return null
  const phase = d < 0 ? 'After the show' : d <= 2 ? 'Last 2 days' : d <= 7 ? 'Final week' : d <= 14 ? 'Main ticket push' : d <= 45 ? 'Early ads' : d <= 75 ? 'Announcing' : d <= 90 ? 'Gathering photos & video' : 'Getting ready'
  const cap = capacityOf(e), pct = cap && e.tickets_sold != null ? e.tickets_sold / cap : null
  const note = pct != null && pct >= 0.9 ? 'Nearly sold out — save the ad money.'
    : showState(e)?.tone === 'bad' && d > 14 ? 'Selling slowly — think about starting the ads earlier than usual.' : null
  return { phase, note, days: d }
}

// Staged budget (brief §9). Reserve is never spent automatically.
export const STAGES: [string, number][] = [['Announcing', 0.2], ['Early ads', 0.15], ['Main ticket push', 0.25], ['Final week', 0.2], ['Reserve (needs a yes)', 0.2]]

type Campaign = { id: string; event_id: string | null; platform: string; name: string; status: string; notes: string | null
  snaps: { captured_at: string; spend: number | null; link_clicks: number | null; attributed_tickets: number | null; attributed_revenue: number | null; source: string | null; data_confidence: string | null; known_issue: string | null }[] }
const latest = (c: Campaign) => [...(c.snaps ?? [])].sort((a, b) => b.captured_at.localeCompare(a.captured_at))[0]

// SCALE / HOLD / CHANGE / STOP — a SUGGESTION with its evidence, never an action. Shown in plain words.
export const ACTION_LABEL: Record<string, string> = { SCALE: 'Spend a little more', HOLD: 'Keep it as is', CHANGE: 'Try a different ad', STOP: 'Pause the ads' }
export function recommendAction(e: Event, campaigns: Campaign[]) {
  const d = daysUntil(e.event_date), cap = capacityOf(e), sold = e.tickets_sold
  const spend = campaigns.reduce((s, c) => s + (latest(c)?.spend ?? 0), 0)
  const attrTix = campaigns.reduce((s, c) => s + (latest(c)?.attributed_tickets ?? 0), 0)
  const avgPrice = sold && e.ticket_revenue ? e.ticket_revenue / sold : null
  const evidence = [d != null && `${d} days out`, cap && sold != null && `${sold}/${cap} sold (${Math.round(sold / cap * 100)}%)`,
    `${money(spend)} spent on ads`, campaigns.length ? `Facebook credits the ads with about ${attrTix} tickets (a rough count)` : 'no campaign data yet'].filter(Boolean) as string[]
  if (d == null || d < 0) return null
  const pct = cap && sold != null ? sold / cap : null
  if (sold == null) return { action: 'HOLD', why: 'No ticket count yet, so we can’t tell how it’s selling. Get the count from Etix first.', evidence }
  if (pct != null && pct >= 0.9) return { action: 'HOLD', why: 'Nearly sold out — no need to spend more on ads.', evidence }
  if (d <= 2 && cap && sold != null && cap - sold > 0) return { action: 'SCALE', why: `${cap - sold} seats left in the final 48 hours — a last-chance ad may be worth it (extra money needs Jamie’s yes).`, evidence }
  if ((!campaigns.length || spend === 0) && pct != null && pct >= 0.6) return { action: 'HOLD', why: 'Selling well without ads. If ads are running, write them down here; otherwise don’t add any yet.', evidence }
  if (!campaigns.length || spend === 0) return d <= 45 ? { action: 'SCALE', why: 'No ads running and the show is less than 45 days away — time to start ads (our 30-day rule).', evidence } : { action: 'HOLD', why: 'Too early for ads — gather the photos, video and plan first.', evidence }
  if (showState(e)?.tone === 'bad') {
    const cpt = attrTix ? spend / attrTix : null
    if (!attrTix || (cpt && avgPrice && cpt > avgPrice)) return { action: 'CHANGE', why: 'Selling slower than it should, and the ads aren’t selling tickets — try a new picture or video, or show it to different people, before adding money.', evidence }
    return { action: 'SCALE', why: 'Selling slower than it should, but the ads are working — adding a little money makes sense (needs a yes).', evidence }
  }
  return { action: 'HOLD', why: 'Selling on track — keep going and check again next week.', evidence }
}

// ---------- content ideas by phase (brief §19) ----------
const CONTENT_BY_PHASE: Record<string, string[]> = {
  'Getting ready': ['Announcement'], 'Gathering photos & video': ['Announcement', 'Artist introduction'],
  'Announcing': ['Announcement', 'Artist introduction', 'Recognizable song / video clip'],
  'Early ads': ['Recognizable song / video clip', 'Credibility (TV / awards / hits)', 'Nostalgia / story', 'Venue experience'],
  'Main ticket push': ['Ticket reminder', 'Social proof (reviews, crowd photos)', 'Venue experience'],
  'Final week': ['Countdown', 'Availability ("seats still open")', 'Last chance'],
  'Last 2 days': ['Last chance', 'Day-of post'], 'After the show': ['Post-show thank-you / photos'],
}

type ContentItem = { id: string; title: string; status: string; platform: string | null; publish_at: string | null }

export function MarketingPanel({ event }: { event: Event }) {
  const campaigns = useShowRows<Campaign>('campaigns', event.id, '*, snaps:campaign_snapshots(*)')
  const budgets = useShowRows<Decision>('decisions', event.id)
  const content = useShowRows<ContentItem>('content_ideas', event.id)
  const [amt, setAmt] = useState(''); const [why, setWhy] = useState('')
  const { busy, err, run } = useAsync()
  const ph = marketingPhase(event), rec = recommendAction(event, campaigns.rows)
  const budget = budgets.rows.filter(d => d.kind === 'BUDGET').sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const spend = campaigns.rows.reduce((s, c) => s + (latest(c)?.spend ?? 0), 0)
  const base = budget?.approved_amount ?? budget?.recommended_amount ?? null
  const baseIsApproved = budget?.approved_amount != null
  const recommend = (e: FormEvent) => { e.preventDefault(); run(async () => {
    await addDecision({ title: `${event.title}: total show ad budget`, kind: 'BUDGET', approver: 'Jamie', event_id: event.id, business_unit: event.business_unit,
      recommended_amount: Number(amt), recommendation: `Total-show budget released in stages (20% announcing / 15% early ads / 25% main push / 20% final week / 20% held back until someone says yes).${why ? ' ' + why : ''}`,
      evidence: rec?.evidence.join(' · ') ?? null, source: 'Opry Ops show workspace' })
    setAmt(''); setWhy('')
  }) }
  const suggested = (CONTENT_BY_PHASE[ph?.phase ?? ''] ?? []).filter(t => !content.rows.some(c => c.title.startsWith(t)))
  return <>
    {ph && <div className="phasebar">{PHASES.map(p => <span key={p} className={p === ph.phase ? 'on' : PHASES.indexOf(p) < PHASES.indexOf(ph.phase as typeof PHASES[number]) ? 'past' : ''}>{p}</span>)}</div>}
    {ph?.note && <p className="health bad inline">{ph.note}</p>}
    {rec && <div className={'recbox a-' + rec.action.toLowerCase()}>
      <b>SUGGESTION — {ACTION_LABEL[rec.action] ?? rec.action}</b><p>{rec.why}</p><small>Based on: {rec.evidence.join(' · ')}</small>
    </div>}
    <h3 className="minihead">Budget</h3>
    {budget ? <>
      <div className="budgetline">
        {budget.recommended_amount != null && <div className="rec"><b>RECOMMENDED</b><span className="amt">{money(budget.recommended_amount)}</span></div>}
        {budget.approved_amount != null ? <div className="dec"><b>APPROVED by {budget.decided_by}</b><span className="amt">{money(budget.approved_amount)}</span></div>
          : <div className="pending"><b>Not approved yet</b><small>Waiting on {budget.approver ?? 'Jamie'} — see Approvals</small></div>}
        <div className="fact"><b>SPENT (Meta, fact)</b><span className="amt">{money(spend)}</span></div>
      </div>
      {base != null && <div className="stages">{STAGES.map(([label, share]) => <div key={label}><small>{label}</small><b>{money(base * share)}</b></div>)}</div>}
      {base != null && !baseIsApproved && <p className="note">Stage amounts above are from the recommendation, not an approved budget.</p>}
    </> : <Empty>No budget recommended yet for this show.</Empty>}
    <form className="addform" onSubmit={recommend}>
      <label>Recommend a total budget $<input value={amt} onChange={e => setAmt(e.target.value)} inputMode="decimal" placeholder="e.g. 650"/></label>
      <label className="grow">Reason (optional)<input value={why} onChange={e => setWhy(e.target.value)} placeholder="Why this amount"/></label>
      <button className="primary" disabled={busy || !amt}><Plus size={16}/> Send to Jamie for approval</button>
    </form>
    <h3 className="minihead">Campaigns</h3>
    {campaigns.rows.length ? campaigns.rows.map(c => { const s = latest(c); return <div className="camp" key={c.id}>
      <b>{c.name}</b> <span className="pill">{c.platform}</span> <span className="pill">{c.status}</span>
      {s && <div className="campnums">
        <span>Spend <b>{money(s.spend)}</b></span><span>Link clicks <b>{s.link_clicks ?? '—'}</b></span>
        <span>Tickets credited to ads <b>{s.attributed_tickets ?? '—'}</b></span><span>Sales credited to ads <b>{money(s.attributed_revenue)}</b></span>
        {s.spend && s.attributed_tickets ? <span>Ad cost per credited ticket <b>{money(s.spend / s.attributed_tickets)}</b></span> : null}
      </div>}
      {s && <small className="source">{s.source} · {fmtDate(s.captured_at, { month: 'short', day: 'numeric' })} · {s.data_confidence === 'VERIFIED' ? 'Verified' : 'Uncertain'}{s.known_issue ? ` — ${s.known_issue}` : ''}</small>}
    </div> }) : <Empty>No campaign data recorded for this show yet.</Empty>}
    <p className="note">“Credited to ads” is Facebook’s and Cymbal’s own estimate. It is never the show’s real ticket money — that’s the Etix total.</p>
    <h3 className="minihead">Content plan</h3>
    {content.rows.map(c => <div className="waitrow" key={c.id}><span className="pill">{c.status}</span><div><b>{c.title}</b></div></div>)}
    {suggested.length > 0 && <div className="suggest"><small>Suggested for the {ph?.phase} phase:</small>
      {suggested.map(t => <button key={t} className="mini" disabled={busy} onClick={() => run(() => insertRow('content_ideas', { business_unit: event.business_unit, title: `${t} — ${event.title}`, event_id: event.id, artist_id: event.artist_id, objective: 'Ticket sales', status: 'PLANNED', source: `Suggested for ${ph?.phase} phase` }, `Content planned: ${t}`, event.id))}>+ {t}</button>)}
    </div>}
    {err && <p className="msg error">{err}</p>}
  </>
}

// ---------- Marketing page: every show's phase + recommendation, audiences, past-show benchmarks ----------
type Audience = { id: string; name: string; audience_type: string | null; meta_sync: string | null; purpose: string | null; notes: string | null; counts: { captured_at: string; count: number | null }[] }
export function Marketing({ events, openShow }: { events: Event[]; openShow: (id: string) => void }) {
  const campaigns = useTable<Campaign>('campaigns', '*, snaps:campaign_snapshots(*)', { column: 'created_at' })
  const audiences = useTable<Audience>('audiences', '*, counts:audience_counts(captured_at, count)', { column: 'name' })
  const house = (e: Event) => e.show_type === 'HOUSE' || e.show_type === 'RENTAL'
  const upcoming = events.filter(e => (daysUntil(e.event_date) ?? -1) >= 0 && !house(e) && e.show_status !== 'HOLD' && e.show_status !== 'CANCELLED')
  const past = events.filter(e => (daysUntil(e.event_date) ?? 0) < 0).reverse()
  const forEvent = (id: string) => campaigns.rows.filter(c => c.event_id === id)
  const onMeta = (a: Audience) => !!a.meta_sync && !/cymbal only/i.test(a.meta_sync)
  const synced = audiences.rows.filter(onMeta), cymbalOnly = audiences.rows.filter(a => !onMeta(a))
  const count = (a: Audience) => [...(a.counts ?? [])].sort((x, y) => y.captured_at.localeCompare(x.captured_at))[0]
  return <>
    <section className="hero small"><p>MARKETING</p><h1>Where every show stands</h1>
      <span>Where each show is in its ad plan, how it’s selling, and a suggestion with the reason. Nothing is spent or posted from here. Free house nights aren’t listed.</span></section>
    <Panel kicker="UPCOMING SHOWS" title="Stage and suggestion">
      {upcoming.map(e => { const ph = marketingPhase(e), r = recommendAction(e, forEvent(e.id)), cap = capacityOf(e)
        return <button key={e.id} className="attn mk" style={{ ['--sc' as string]: showColor(e.id) }} onClick={() => openShow(e.id)}>
          <b className="mkname">{e.title}</b>
          <span>{fmtDate(e.event_date, { month: 'short', day: 'numeric' })} · {ph?.phase} · {e.tickets_sold ?? '—'}{cap ? `/${cap}` : ''} sold</span>
          {r && <span className={'act a-' + r.action.toLowerCase()}>{ACTION_LABEL[r.action] ?? r.action}: {r.why}</span>}
          <small>Open ›</small>
        </button> })}
    </Panel>
    <Panel kicker="LEARN FROM PAST SHOWS" title="Results vs. ads">
      <table className="money bench"><thead><tr><th>Show</th><th>Tickets (actual)</th><th>Gross (actual)</th><th>Ad spend</th><th>Credited to ads</th></tr></thead>
        <tbody>{past.map(e => { const c = forEvent(e.id); const s = c.map(latest).filter(Boolean)
          return <tr key={e.id}><td><button className="linkish small" onClick={() => openShow(e.id)}>{e.title}</button><small> {fmtDate(e.event_date, { month: 'short', day: 'numeric' })}</small></td>
            <td>{e.tickets_sold ?? '—'}{e.data_confidence === 'UNCERTAIN' ? ' *' : ''}</td><td>{money(e.ticket_revenue)}</td>
            <td>{s.length ? money(s.reduce((x, y) => x + (y!.spend ?? 0), 0)) : '—'}</td><td>{s.length ? s.reduce((x, y) => x + (y!.attributed_tickets ?? 0), 0) : '—'}</td></tr> })}</tbody></table>
      <p className="note">* Not yet reconciled with a box-office report. A show can sell very well even when few tickets are credited to ads — that number alone doesn’t say whether a show or its ads worked.</p>
    </Panel>
    <Panel kicker="CYMBAL AUDIENCES" title={`${synced.length} shared with Facebook ads · ${cymbalOnly.length} email & text only`}>
      {[['Shared with Facebook ads', synced], ['Email & text lists only (Cymbal)', cymbalOnly]].map(([label, list]) => <div key={label as string} className="group"><h3>{label as string}</h3>
        {(list as Audience[]).map(a => { const n = count(a); return <div className="waitrow" key={a.id}><div><b>{a.name}</b>
          <small>{[a.audience_type, n?.count != null && `${n.count.toLocaleString()} people (${fmtDate(n.captured_at, { month: 'short', day: 'numeric' })})`, onMeta(a) && `Facebook: ${a.meta_sync}`, a.purpose, a.notes !== a.purpose && a.notes].filter(Boolean).join(' · ')}</small>
          {a.notes && <small>{a.notes}</small>}</div></div> })}
        {(list as Audience[]).length === 0 && <Empty>None.</Empty>}</div>)}
      <p className="note">Don’t delete “duplicate-looking” tags until their automations and Facebook syncs are checked.</p>
    </Panel>
  </>
}
