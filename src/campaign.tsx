import { useEffect, useMemo, useState } from 'react'
import { Check, Copy as CopyIcon, ExternalLink, Megaphone, Printer } from 'lucide-react'
import { supabase } from './lib/supabase'
import { capacityOf, daysUntil, fmtDate, logChange, money, todayISO, useShowRows, type Event } from './lib/data'
import { Empty, useAsync } from './components'
import { DetailPopup } from './popup'
import { PrintSheet, printSheet } from './printsheet'

// ---------- Campaign plan: one per show, in Kentucky Opry's voice ----------
// Tables: marketing_plans (the plan: pitch, budget, targets, asks) and marketing_plan_items (every post, email, ad,
// church step — date, time, finished copy, rights, spend, KPI). Nothing here posts, sends or spends: it's the plan
// and the checklist. Rights: OURS = we made it · ARTIST_ASSETS = uses official artist photos/art · REQUEST = ask management first.

type Plan = {
  id: string; event_id: string; template: string | null; status: string; summary: string | null; notes: string | null
  pillars: { name: string; job: string }[] | null; facts: { fact: string; source: string; verified: boolean }[] | null
  links: { tickets?: string; info?: string; box_office?: string; note?: string } | null
  audiences: { name: string; where: string; use: string }[] | null
  budget: { running?: string; average?: string; recommended?: number; approval?: string; stages?: { from: string; to: string; daily: string; total: number; note: string }[] } | null
  targets: { by: string; tickets: number; why: string }[] | null; asks: { who: string; what: string; status: string }[] | null
}
export type PlanItem = {
  id: string; plan_id: string; event_id: string; week: number; week_theme: string | null; run_on: string | null; run_time: string | null
  channel: string; format: string | null; funnel: string | null; job: string | null; hook: string | null; caption: string | null; creative: string | null
  assets_needed: string | null; rights: string | null; audience: string | null; cta: string | null; link: string | null; tags: string | null
  paid: boolean | null; spend: string | null; meta_setup: string | null; retargeting: string | null; kpi: string | null
  needs_approval: boolean | null; owner: string | null; status: string; result: string | null; sort: number
}

const STATUSES: [string, string][] = [['PLANNED', 'Planned'], ['DRAFTED', 'Drafted'], ['APPROVED', 'Approved'], ['SCHEDULED', 'Scheduled'], ['DONE', 'Done ✓'], ['SKIPPED', 'Skipped']]
const RIGHTS: Record<string, [string, string]> = { OURS: ['Ours', 'ok'], ARTIST_ASSETS: ['Artist photo/art', 'amber'], REQUEST: ['Ask management first', 'violet'] }
export const KINDS = ['Social', 'Email', 'Churches', 'Ads', 'In venue', 'Radio & calendars', 'Artist team', 'Sign'] as const
export function kindOf(channel: string) {
  const c = channel.toLowerCase()
  return c.includes('church') ? 'Churches' : c.includes('meta') ? 'Ads' : c.includes('email') ? 'Email' : c.includes('venue') ? 'In venue'
    : c.includes('radio') || c.includes('calendar') ? 'Radio & calendars' : c.includes('artist') ? 'Artist team' : c.includes('sign') ? 'Sign' : 'Social'
}
const isDone = (i: PlanItem) => i.status === 'DONE' || i.status === 'SKIPPED'
const day = (d: string | null) => fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })

async function setItem(item: PlanItem, patch: Partial<PlanItem>, note: string) {
  const { error } = await supabase!.from('marketing_plan_items').update(patch).eq('id', item.id)
  if (error) throw error
  await logChange('marketing_plan_item', item.id, note, Object.fromEntries(Object.keys(patch).map(k => [k, (item as Record<string, unknown>)[k]])), patch, 'KY_OPRY')
}

function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false)
  return <button type="button" className="linkbtn" onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1800) }}>
    {ok ? <Check size={15}/> : <CopyIcon size={15}/>} {ok ? 'Copied' : label}</button>
}

function Badges({ i }: { i: PlanItem }) {
  const [r, tone] = RIGHTS[i.rights ?? ''] ?? [null, '']
  return <span className="planbadges">
    {i.funnel && <span className="pill">{i.funnel}</span>}
    {r && <span className={'pill ' + tone}>{r}</span>}
    {i.paid ? <span className="pill amber">Paid{i.spend ? `: ${i.spend}` : ''}</span> : null}
    {i.needs_approval && <span className="pill violet">Needs an OK</span>}
  </span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return children ? <div className="pfield"><b>{label}</b><div>{children}</div></div> : null
}

function ItemDetail({ i, onClose }: { i: PlanItem; onClose: () => void }) {
  const [result, setResult] = useState(i.result ?? '')
  const { busy, err, run } = useAsync()
  return <DetailPopup title={i.hook && i.hook !== '—' ? i.hook : `${i.channel}: ${i.format ?? ''}`} kicker={`${day(i.run_on)}${i.run_time ? ' · ' + i.run_time : ''} · ${i.channel}${i.format ? ' · ' + i.format : ''}`} onClose={onClose}>
    <Badges i={i}/>
    <Field label="Why we’re doing it">{i.job}</Field>
    <Field label="Who it’s for">{i.audience}</Field>
    {i.caption && i.caption !== '—' && <div className="pfield"><b>Ready-to-use copy</b><pre className="recap">{i.caption}</pre><Copy text={i.caption} label="Copy the copy"/></div>}
    <Field label="Button / call to action">{i.cta && i.cta !== '—' ? i.cta : null}</Field>
    <Field label="Link">{i.link ? <a href={i.link} target="_blank" rel="noreferrer">{i.link.includes('etix') ? 'Etix ticket link' : 'Show page'} <ExternalLink size={13}/></a> : null}</Field>
    <Field label="Tags & hashtags">{i.tags}</Field>
    <Field label="What it looks like">{i.creative && i.creative !== '—' ? i.creative : null}</Field>
    <Field label="What we need">{i.assets_needed && i.assets_needed !== '—' ? i.assets_needed : null}</Field>
    <Field label="Ad setup (Meta, through Cymbal)">{i.meta_setup}</Field>
    <Field label="Retargeting">{i.retargeting}</Field>
    <Field label="Keep, change or stop?">{i.kpi}</Field>
    <Field label="Who">{i.owner}</Field>
    <label className="pfield"><b>What happened (numbers, notes)</b>
      <textarea rows={3} value={result} onChange={e => setResult(e.target.value)} placeholder="e.g. 3.1% clicks, 6 tickets in 48 hours — keep"/></label>
    <div className="actions">
      <select aria-label="Status" value={i.status} disabled={busy} onChange={e => run(() => setItem(i, { status: e.target.value }, `Campaign item → ${e.target.value}: ${i.hook ?? i.channel}`))}>
        {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <button disabled={busy || result === (i.result ?? '')} onClick={() => run(() => setItem(i, { result }, `Campaign result noted: ${i.hook ?? i.channel}`))}>Save what happened</button>
    </div>
    {err && <p className="msg error">{err}</p>}
    <p className="note">Opry Ops never posts, sends or spends by itself — this is the plan. Mark it Done after you post or send it.</p>
  </DetailPopup>
}

function ItemRow({ i, onOpen }: { i: PlanItem; onOpen: () => void }) {
  const { busy, run } = useAsync()
  const d = daysUntil(i.run_on)
  const late = d != null && d < 0 && !isDone(i)
  return <div className={'planitem k-' + kindOf(i.channel).replace(/\W+/g, '').toLowerCase() + (isDone(i) ? ' done' : '') + (late ? ' late' : '')}>
    <button type="button" className="pi-when" onClick={onOpen} aria-label={`Open details: ${i.hook ?? i.channel}`}>
      <b>{fmtDate(i.run_on, { month: 'short', day: 'numeric' })}</b><small>{fmtDate(i.run_on, { weekday: 'short' })}</small>
    </button>
    <button type="button" className="pi-main" onClick={onOpen}>
      <small className="pi-chan">{i.channel}{i.format ? ` · ${i.format}` : ''}{i.run_time ? ` · ${i.run_time}` : ''}</small>
      <strong>{i.hook && i.hook !== '—' ? i.hook : i.job}</strong>
      {i.hook && i.hook !== '—' && i.job && <small className="pi-job">{i.job}</small>}
      <Badges i={i}/>
    </button>
    <select className="pi-status" aria-label="Status" value={i.status} disabled={busy}
      onChange={e => run(() => setItem(i, { status: e.target.value }, `Campaign item → ${e.target.value}: ${i.hook ?? i.channel}`))}>
      {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
  </div>
}

// ---------- the plan ----------
export function CampaignPlan({ event }: { event: Event }) {
  const plans = useShowRows<Plan>('marketing_plans', event.id)
  const items = useShowRows<PlanItem>('marketing_plan_items', event.id, '*', 'sort')
  const plan = plans.rows[0]
  const [kind, setKind] = useState<string>('All'); const [hideDone, setHideDone] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const today = todayISO()
  const rows = [...items.rows].sort((a, b) => (a.run_on ?? '').localeCompare(b.run_on ?? '') || a.sort - b.sort)
  const shown = rows.filter(i => (kind === 'All' || kindOf(i.channel) === kind) && (!hideDone || !isDone(i)))
  const weeks = useMemo(() => { const m = new Map<number, PlanItem[]>(); for (const i of shown) m.set(i.week, [...(m.get(i.week) ?? []), i]); return [...m.entries()].sort((a, b) => a[0] - b[0]) }, [shown])
  const thisWeek = rows.filter(i => !isDone(i) && i.run_on && daysUntil(i.run_on)! <= 7)
  const done = rows.filter(isDone).length
  const openItem = rows.find(i => i.id === open)

  if (!plan) return <StartPlan event={event}/>
  const sold = event.tickets_sold, cap = capacityOf(event)
  const nextTarget = plan.targets?.find(t => t.by >= today)
  const kinds = ['All', ...KINDS.filter(k => rows.some(i => kindOf(i.channel) === k))]

  return <div className="campaign">
    <section className="panel planhead">
      <div className="panelhead"><div><small>CAMPAIGN PLAN · {plan.template?.startsWith('christian') ? 'Christian & Gospel template' : 'Standard template'}</small>
        <h2>{rows.length} steps · {done} done</h2></div>
        <div className="planbtns"><span className={'pill ' + (plan.status === 'APPROVED' || plan.status === 'RUNNING' ? 'ok' : 'amber')}>{plan.status === 'IN_REVIEW' ? 'Draft — for Jamie to review' : plan.status.toLowerCase()}</span>
          <button onClick={() => printSheet('plan')}><Printer size={17}/> Print / save as PDF</button></div></div>
      {plan.summary && <p className="plansum">{plan.summary}</p>}
      <div className="planglance">
        <div><b>{sold ?? '—'}</b><small>sold{cap ? ` of ${cap}` : ''}</small></div>
        {nextTarget && <div className={sold != null && sold >= nextTarget.tickets ? 'good' : 'bad'}><b>{nextTarget.tickets}</b><small>goal by {fmtDate(nextTarget.by, { month: 'short', day: 'numeric' })}</small></div>}
        {plan.budget?.recommended != null && <div><b>{money(plan.budget.recommended)}</b><small>ad budget (recommended)</small></div>}
        <div className={thisWeek.length ? 'bad' : 'good'}><b>{thisWeek.length}</b><small>to do this week</small></div>
      </div>
    </section>

    {thisWeek.length > 0 && <section className="panel">
      <div className="panelhead"><div><small>COMING UP · NEXT 7 DAYS</small><h2>Do these next</h2></div></div>
      {thisWeek.map(i => <ItemRow key={i.id} i={i} onOpen={() => setOpen(i.id)}/>)}
    </section>}

    <div className="plangrid">
      {plan.pillars?.length ? <details className="panel plansec" open><summary>Why people will buy (our 4 angles)</summary>
        <ol className="pillars">{plan.pillars.map(p => <li key={p.name}><b>{p.name}</b><span>{p.job}</span></li>)}</ol></details> : null}
      {plan.budget && <details className="panel plansec" open><summary>Ad money</summary>
        {plan.budget.average && <p className="note">{plan.budget.average}</p>}
        {plan.budget.running && <p>{plan.budget.running}</p>}
        {plan.budget.stages && <table className="plantable"><thead><tr><th>When</th><th>Daily</th><th>Total</th><th>Why</th></tr></thead>
          <tbody>{plan.budget.stages.map(s => <tr key={s.from}><td>{s.from}{s.to ? `–${s.to}` : ''}</td><td>{s.daily}</td><td>{money(s.total)}</td><td>{s.note}</td></tr>)}</tbody></table>}
        {plan.budget.approval && <p className="pill violet">{plan.budget.approval}</p>}
      </details>}
      {plan.targets?.length ? <details className="panel plansec" open><summary>Ticket goals</summary>
        <table className="plantable"><thead><tr><th>By</th><th>Goal</th><th>Why</th></tr></thead>
          <tbody>{plan.targets.map(t => <tr key={t.by} className={t === nextTarget ? 'now' : t.by < today ? (sold != null && sold >= t.tickets ? 'hit' : 'miss') : ''}>
            <td>{fmtDate(t.by, { month: 'short', day: 'numeric' })}</td><td>{t.tickets}</td><td>{t.why}</td></tr>)}</tbody></table></details> : null}
      {plan.asks?.length ? <details className="panel plansec" open><summary>Answers we need</summary>
        <ul className="asks">{plan.asks.map(a => <li key={a.what}><b>{a.who}</b><span>{a.what}</span></li>)}</ul>
        {rows.find(i => i.channel === 'Artist team') && <p className="note">The short email to the band’s team is in the Setup week — open it to copy. Only asks what we need; meet &amp; greets are the artist’s call.</p>}
      </details> : null}
      <ArtistRules event={event}/>
      {plan.facts?.length ? <details className="panel plansec"><summary>Facts: checked and not yet checked</summary>
        <ul className="facts">{plan.facts.map(f => <li key={f.fact} className={f.verified ? 'ok' : 'no'}><span>{f.verified ? '✓ Checked' : '? Not checked'}</span>{f.fact}<small>{f.source}</small></li>)}</ul></details> : null}
      {plan.links && <details className="panel plansec"><summary>Links to use</summary>
        {plan.links.tickets && <p><b>Tickets (every Buy button):</b> <Copy text={plan.links.tickets} label="Copy Etix link"/></p>}
        {plan.links.info && <p><b>More info:</b> <Copy text={plan.links.info} label="Copy show page link"/></p>}
        {plan.links.box_office && <p>{plan.links.box_office}</p>}
        {plan.links.note && <p className="note">{plan.links.note}</p>}</details>}
      {plan.audiences?.length ? <details className="panel plansec"><summary>Who we’re talking to</summary>
        <ul className="asks">{plan.audiences.map(a => <li key={a.name}><b>{a.name}</b><span>{a.use} <small>({a.where})</small></span></li>)}</ul></details> : null}
    </div>

    <section className="panel">
      <div className="panelhead"><div><small>WEEK BY WEEK</small><h2>The whole plan</h2></div>
        <label className="chk"><input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)}/> Hide done</label></div>
      <div className="chips" role="group" aria-label="Show only">{kinds.map(k =>
        <button key={k} className={'chip' + (kind === k ? ' on' : '')} aria-pressed={kind === k} onClick={() => setKind(k)}>{k}</button>)}</div>
      {weeks.map(([w, list]) => <div className="planweek" key={w}>
        <h3><span>{w === 0 ? 'Setup' : `Week ${w}`}</span>{list[0].week_theme}<small>{fmtDate(list[0].run_on, { month: 'short', day: 'numeric' })}–{fmtDate(list[list.length - 1].run_on, { month: 'short', day: 'numeric' })}</small></h3>
        {list.map(i => <ItemRow key={i.id} i={i} onOpen={() => setOpen(i.id)}/>)}
      </div>)}
      {shown.length === 0 && <Empty>Nothing matches — try “All”.</Empty>}
    </section>
    {plan.notes && <p className="note">{plan.notes}</p>}
    {openItem && <ItemDetail i={openItem} onClose={() => setOpen(null)}/>}

    <PrintSheet id="plan"><PlanPrint event={event} plan={plan} rows={rows}/></PrintSheet>
  </div>
}

// The paper version: everything, in order, with the copy written out and a box to tick.
function PlanPrint({ event, plan, rows }: { event: Event; plan: Plan; rows: PlanItem[] }) {
  return <article className="sheet">
    <div className="sheethead"><div><small>KENTUCKY OPRY · CAMPAIGN PLAN</small><h1>{event.title}</h1>
      <p>{fmtDate(event.event_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · printed {fmtDate(todayISO(), { month: 'short', day: 'numeric' })}</p></div></div>
    {plan.summary && <p>{plan.summary}</p>}
    {plan.budget?.stages && <><h2>Ad money</h2><table><tbody>{plan.budget.stages.map(s => <tr key={s.from}><td>{s.from}{s.to ? `–${s.to}` : ''}</td><td>{s.daily}</td><td>{money(s.total)}</td><td>{s.note}</td></tr>)}</tbody></table>
      {plan.budget.approval && <p><i>{plan.budget.approval}</i></p>}</>}
    {plan.targets?.length ? <><h2>Ticket goals</h2><p>{plan.targets.map(t => `${fmtDate(t.by, { month: 'short', day: 'numeric' })}: ${t.tickets}`).join(' · ')}</p></> : null}
    {plan.asks?.length ? <><h2>Answers we need</h2><ul>{plan.asks.map(a => <li key={a.what}><b>{a.who}:</b> {a.what}</li>)}</ul></> : null}
    <h2>Every step</h2>
    {rows.map(i => <section className="sheetitem" key={i.id}>
      <h3><span className="box">{isDone(i) ? '✓' : ''}</span>{fmtDate(i.run_on, { weekday: 'short', month: 'short', day: 'numeric' })}{i.run_time ? ` · ${i.run_time}` : ''} — {i.channel}{i.format ? ` (${i.format})` : ''}</h3>
      <p><b>{i.hook && i.hook !== '—' ? i.hook : ''}</b> {i.job}</p>
      {i.caption && i.caption !== '—' && <pre>{i.caption}</pre>}
      <p className="sheetmeta">{[i.creative && i.creative !== '—' && `Looks like: ${i.creative}`, i.rights && `Rights: ${(RIGHTS[i.rights] ?? [i.rights])[0]}`,
        i.paid ? `Paid: ${i.spend ?? 'yes'}` : 'Organic', i.kpi && `Keep/change: ${i.kpi}`].filter(Boolean).join(' · ')}</p>
    </section>)}
  </article>
}

// Act-specific rules (e.g. "we must approve on-sale dates", "use approved copy only") live on the artist and show
// on every plan for that act.
type Rules = { status?: string; rules?: string[] }
function ArtistRules({ event }: { event: Event }) {
  const [artist, setArtist] = useState<{ id: string; name: string; marketing_rules: Rules | null } | null>(null)
  const [text, setText] = useState(''); const [editing, setEditing] = useState(false)
  const { busy, err, run } = useAsync()
  useEffect(() => { if (!event.artist_id) return
    supabase!.from('artists').select('id, name, marketing_rules').eq('id', event.artist_id).maybeSingle().then(({ data }) => { setArtist(data); setText((data?.marketing_rules?.rules ?? []).join('\n')) }) }, [event.artist_id])
  if (!artist) return null
  const r = artist.marketing_rules
  const save = () => run(async () => {
    const next: Rules = { status: text.trim() ? 'HAS_RULES' : 'NONE', rules: text.split('\n').map(s => s.trim()).filter(Boolean) }
    const { error } = await supabase!.from('artists').update({ marketing_rules: next }).eq('id', artist.id); if (error) throw error
    await logChange('artist', artist.id, `Marketing rules updated: ${artist.name}`, r, next, 'KY_OPRY')
    setArtist({ ...artist, marketing_rules: next }); setEditing(false)
  })
  return <details className="panel plansec" open><summary>{artist.name}’s marketing rules</summary>
    {r?.status === 'UNKNOWN' && <p className="pill amber">Not known yet — ask their team</p>}
    {!editing ? <>{r?.rules?.length ? <ul className="asks">{r.rules.map(x => <li key={x}><span>{x}</span></li>)}</ul> : <p className="note">No special rules on file.</p>}
      <button className="linkbtn" onClick={() => setEditing(true)}>Edit rules</button></>
    : <><label>One rule per line (e.g. “Approve the on-sale date with management”, “Use their approved copy only”)
        <textarea rows={4} value={text} onChange={e => setText(e.target.value)}/></label>
      <div className="actions"><button disabled={busy} onClick={save}>Save rules</button><button className="linkbtn" onClick={() => setEditing(false)}>Cancel</button></div></>}
    {err && <p className="msg error">{err}</p>}
    <p className="note">These rules follow {artist.name} to every show we book with them.</p>
  </details>
}

// ---------- start a plan from the template ----------
type Tpl = { off: number; time: string; channel: string; format: string; funnel: string; job: string; hook: string; caption: string; creative: string
  assets?: string; rights: 'OURS' | 'ARTIST_ASSETS' | 'REQUEST'; audience: string; cta: string; paid?: boolean; spend?: string; kpi: string; ok?: boolean; faith?: boolean; setup?: boolean }
const KPI_POST = 'Keep the angle if ticket-link clicks are 1% or more of people reached (or friends get tagged); lots of likes but no clicks → change the hook next time.'
const KPI_AD = 'Keep while each ticket costs $15 or less in ads. Spend more (with Jamie’s yes) if under $10 for 3+ days. Change the picture/words after $50 with no tickets or under 0.8% clicks.'
const HASH = '#KentuckyOpry #BentonKY #WesternKentucky'
const TEMPLATE: Tpl[] = [
  { off: 999, setup: true, time: 'This week', channel: 'Artist team', format: 'Email (draft)', funnel: 'Setup', rights: 'REQUEST', ok: true, audience: 'The act’s management or agent', cta: 'Reply with answers', kpi: 'Answered within 5 business days; if not, Jamie follows up.',
    job: 'Ask only what we need and learn the act’s rules before we make their content.', hook: 'A few quick marketing questions',
    caption: 'Subject: Kentucky Opry – {show} ({short}): a few quick marketing questions\n\nHi [name],\n\nThis is the office admin with the Kentucky Opry Theater in Benton, Kentucky. We’re excited to host {show} on {date}, and we’re building our local campaign now.\n\n1. Would they record a short (10–20 second) vertical hello video for our area? It helps local sales more than anything else we post.\n2. Are there approved photos, video or song clips we may use — and any rules we should follow (approved copy, approving posts, on-sale dates)?\n\nThank you — we’ll gladly send you everything we make.\n\nthe office admin\nKentucky Opry · 555-555-0100',
    creative: 'Send from person@example.com. Save their answers under the artist’s marketing rules.' },
  { off: 999, setup: true, time: '11:00 AM', channel: 'Email (Cymbal)', format: 'Email', funnel: 'Convert', rights: 'ARTIST_ASSETS', ok: true, audience: 'Our buyers who like this kind of show (Cymbal genre tag)', cta: 'Get tickets', kpi: 'Opens 35%+, clicks 4%+, tickets in the next 48 hours.',
    job: 'Tell the people most likely to buy first.', hook: '{show} is coming to Benton',
    caption: 'Subject: {show} is coming to the Kentucky Opry\n\nWe’re excited to welcome {show} to the Kentucky Opry on {date}.\n\n[One line on why people will love it — the songs, the story, the TV credit.]\n\n• Tickets from $[price]\n• Groups: buy 9 seats and the 10th is free — 555-555-0100\n\n[BUTTON] Get tickets', creative: 'Official photo on top, Kentucky Opry colors, one button, compliance footer.', assets: 'Official photo' },
  { off: 999, setup: true, time: 'By noon', channel: 'Meta ads', format: 'Ad creatives (3)', funnel: 'Discover', rights: 'ARTIST_ASSETS', paid: true, spend: 'Per the approved budget', audience: 'Interest (≈75 miles of Benton), past buyers, followers', cta: 'Buy Tickets', kpi: KPI_AD,
    job: 'Three different angles so we learn which one sells.', hook: 'A: the songs · B: the best seats · C: right here in Benton',
    caption: 'Ad A: You know the songs — hear them live. {show} at the Kentucky Opry in Benton, {short}.\nAd B: [what makes the best seats special]\nAd C: No long drive — {show} is coming to our theater in Benton on {short}.', creative: '1080×1350 + 1080×1920, our type over the official photo.', assets: 'Official photo; our theater photos' },
  { off: 999, setup: true, time: '10:00 AM', channel: 'Facebook + Instagram', format: 'Carousel', funnel: 'Discover', rights: 'ARTIST_ASSETS', audience: 'Our followers', cta: 'Tickets (link in first comment on Instagram)', kpi: KPI_POST,
    job: 'The welcome post.', hook: 'We’re excited to welcome {show}',
    caption: 'We’re excited to welcome {show} to the Kentucky Opry on {date}! 🎶\n\n[2–3 lines: the songs people know, why it’s special]\n\n🎟️ [ticket link]\n\n' + HASH, creative: '4–5 slides in our look: what, the songs, the date, the tickets.', assets: 'Official photo' },
  { off: 999, setup: true, faith: true, time: 'Morning', channel: 'Churches', format: 'List building', funnel: 'Partner', rights: 'OURS', audience: 'Church & Faith Partner Network', cta: '—', kpi: '30+ churches with an email or phone, marked by music fit.',
    job: 'Pick the churches that fit this act (contemporary vs Southern Gospel) from the Churches list; add new ones.', hook: 'Pick the right churches', caption: '—', creative: 'Contacts & Info → Churches: filter by music fit.' },
  { off: 45, time: 'Morning', channel: 'Meta ads', format: 'Checkpoint', funnel: 'Setup', rights: 'OURS', paid: true, spend: 'No change', audience: '—', cta: '—', kpi: KPI_AD,
    job: '45-day check: which ad is selling? Pause the losers.', hook: '45-day ad check', caption: '—', creative: '—' },
  { off: 42, faith: true, time: 'By Friday', channel: 'Churches', format: 'Church media kit', funnel: 'Partner', rights: 'ARTIST_ASSETS', audience: 'Churches', cta: 'Share with your congregation', kpi: 'Kit finished and link tested.',
    job: 'Make it easy for a church to share: slide, square, story, poster, QR, bulletin blurb, newsletter paragraph, Facebook post, 15s + 30s video, stage announcement.', hook: 'Church media kit',
    caption: 'Bulletin blurb: {show} comes to the Kentucky Opry in Benton on {date}. Tickets from $[price] at kentuckyopry.com or 555-555-0100. Groups of 10: the 10th seat is free.\n\nStage announcement (20 seconds): “{show} is coming to the Kentucky Opry in Benton on {date}. If you bring a group of ten, the tenth seat is free. Details are in the bulletin.”', creative: 'Our look, not a generic Christian template. One shared Drive folder.' },
  { off: 38, faith: true, time: '9:00 AM', channel: 'Churches', format: 'Email (1:1)', funnel: 'Partner', rights: 'OURS', audience: 'Churches whose music fits', cta: 'Share the kit', kpi: '20%+ reply; 10+ churches will share.',
    job: 'Ask churches, one at a time, to share.', hook: 'Would you share this with your church family?',
    caption: 'Subject: {show} is coming to Benton — free announcement kit\n\nHi [name],\n\nI’m Rach with the Kentucky Opry in Benton. We’re hosting {show} on {date}, and I thought your church family might enjoy knowing about it. I’ve put together a free kit — slide, bulletin blurb, social post and poster: [kit link]\n\nGroups of 10 get the 10th seat free 555-555-0100).\n\nThank you — and let me know if you’d rather not receive notes like this.\n\nthe office admin · Kentucky Opry', creative: 'Gmail drafts; Rach sends. Log each one on the church.' },
  { off: 36, faith: true, time: '10–11:30 AM', channel: 'Churches', format: 'Phone follow-up', funnel: 'Partner', rights: 'OURS', audience: 'Churches that didn’t reply', cta: '—', kpi: 'A named person for announcements at 15+ churches.',
    job: 'A friendly call gets more shares than email.', hook: 'Did you get the kit?', caption: '“Hi, this is Rach at the Kentucky Opry — I emailed a little announcement kit for {show}. Who handles announcements?”', creative: '—' },
  { off: 35, faith: true, time: 'Morning', channel: 'Radio & calendars', format: 'Outreach', funnel: 'Discover', rights: 'ARTIST_ASSETS', audience: 'Christian radio listeners, local calendars', cta: 'Tickets', kpi: 'Listed on 5+ calendars.',
    job: 'Free reach: Christian radio (Elevate FM 89.7 takes no ads — ask about calendar/giveaway), community calendars, Christian bookstores, homeschool groups, tourism.', hook: 'Radio & community calendars',
    caption: '{show} — {date}, Kentucky Opry Theater, 88 Chilton Lane, Benton. Tickets from $[price]: [ticket link] · 555-555-0100.', creative: '—' },
  { off: 34, time: '6:30 PM', channel: 'Facebook + Instagram', format: 'Reel (15–20 s)', funnel: 'Consider', rights: 'OURS', audience: 'Followers; can become an ad', cta: 'Tickets', kpi: KPI_POST,
    job: 'Sell the room: close, local, no arena.', hook: 'Every seat is close.', caption: 'Every seat at the Kentucky Opry is close to the stage. ✨ {show} · {short}\n🎟️ [ticket link]\n\n' + HASH, creative: 'Our own footage, licensed library music — not the act’s recordings.' },
  { off: 30, time: 'Morning', channel: 'Meta ads', format: 'Checkpoint', funnel: 'Setup', rights: 'OURS', paid: true, spend: 'No change without Jamie', audience: '—', cta: '—', kpi: KPI_AD,
    job: '30-day review: keep the best 2 ads.', hook: '30-day ad review', caption: '—', creative: '—' },
  { off: 28, time: '1:00 PM', channel: 'Facebook', format: 'Graphic post', funnel: 'Convert', rights: 'OURS', audience: 'Followers', cta: 'Call the box office', kpi: 'Group bookings at the box office.',
    job: 'Turn “we should go” into a group plan.', hook: 'Round up 9 friends — your seat’s on us.',
    caption: 'Round up 9 friends — your seat’s on us. 🙌 Bring your group to {show} on {date}: buy 9 seats and the 10th is free.\n📞 555-555-0100 · 🎟️ [ticket link]\n\n' + HASH, creative: 'Ten ticket stubs, the last one stamped “ON US.”' },
  { off: 21, time: 'Morning', channel: 'Meta ads', format: 'Checkpoint + budget step', funnel: 'Setup', rights: 'OURS', paid: true, spend: 'Next step needs Jamie', ok: true, audience: '—', cta: '—', kpi: 'Half the seats sold by today (our pace rule)?',
    job: 'Half-way check with 3 weeks to go. If behind, ask Jamie for the next step.', hook: '3-week check', caption: '—', creative: '—' },
  { off: 20, time: '5:00 PM', channel: 'Email (Cymbal)', format: 'Email', funnel: 'Convert', rights: 'ARTIST_ASSETS', ok: true, audience: 'Genre tag + recent buyers (skip people who already bought)', cta: 'Get tickets', kpi: 'Clicks 3%+; tickets in 48 hours.',
    job: 'Email #2, wider list.', hook: 'You probably know these songs', caption: 'Subject: You probably know these songs 🎶\n\n[Song titles people know.] Hear them live at the Kentucky Opry on {date}.\n\n[BUTTON] Get tickets', creative: 'Swap in the best-performing picture.' },
  { off: 17, faith: true, time: '9:00 AM', channel: 'Churches', format: 'Email (reminder)', funnel: 'Partner', rights: 'ARTIST_ASSETS', audience: 'Churches that said they’d share', cta: 'Share the new slide', kpi: 'Churches that share again.',
    job: 'Fresh slide, in time for Sunday.', hook: 'Two Sundays away — fresh slide', caption: 'Hi [name], thank you for sharing {show}! We’re two Sundays away — here’s a fresh slide: [link]. Groups of 10 still get the 10th seat free.\nRach · Kentucky Opry', creative: '“2 SUNDAYS AWAY” slide.' },
  { off: 14, time: '10:00 AM', channel: 'Facebook', format: 'Localized posts', funnel: 'Discover', rights: 'OURS', audience: 'Paducah, Murray, Mayfield', cta: 'Tickets', kpi: KPI_POST,
    job: 'Main push: one town at a time.', hook: 'Paducah — {show} is 30 minutes away.', caption: 'Paducah — {show} is about 30 minutes away at the Kentucky Opry in Benton. {short} · [ticket link]', creative: 'Map-pin graphic; repeat for Murray and Mayfield.' },
  { off: 14, time: 'Morning', channel: 'Meta ads', format: 'Budget step', funnel: 'Convert', rights: 'OURS', paid: true, spend: 'Main-push stage (if approved)', ok: true, audience: 'All ad sets + retargeting', cta: 'Buy Tickets', kpi: KPI_AD,
    job: 'Main push: best 2 ads plus retargeting.', hook: 'Main-push budget', caption: '—', creative: '—' },
  { off: 10, faith: true, time: '9:00 AM', channel: 'Churches', format: 'Email (final)', funnel: 'Partner', rights: 'ARTIST_ASSETS', audience: 'All churches that replied', cta: 'Share Sunday', kpi: 'Shares logged.',
    job: 'Final Sunday announcement — send Thursday.', hook: 'For Sunday — {show} is next week', caption: 'Hi [name], if you can mention it once more this Sunday, here’s a “NEXT SATURDAY” slide and a 20-second announcement: [link]. Thank you!\nRach · Kentucky Opry', creative: '“NEXT WEEK” slide.' },
  { off: 7, time: '10:00 AM', channel: 'Facebook + Instagram', format: 'Post + Story', funnel: 'Remind', rights: 'OURS', audience: 'Followers', cta: 'Tickets', kpi: KPI_POST,
    job: 'One week out.', hook: 'ONE WEEK.', caption: 'One week from tonight: {show} at the Kentucky Opry. 🎶\n🎟️ [ticket link]\n\n' + HASH, creative: 'Letter-board “ONE WEEK” graphic.' },
  { off: 7, time: 'Morning', channel: 'Meta ads', format: 'Checkpoint + final step', funnel: 'Convert', rights: 'OURS', paid: true, spend: 'Final-week stage (if approved)', ok: true, audience: '—', cta: '—', kpi: KPI_AD,
    job: 'Final review; the held-back money only with Jamie’s yes.', hook: 'Final-week ad check', caption: '—', creative: '—' },
  { off: 6, time: '5:00 PM', channel: 'Email (Cymbal)', format: 'Email', funnel: 'Convert', rights: 'ARTIST_ASSETS', ok: true, audience: 'Opened/clicked emails 1–2, not yet bought', cta: 'Get tickets', kpi: 'Tickets in 48 hours.',
    job: 'Email #3: this week.', hook: '{show} is this week', caption: 'Subject: {show} is this week in Benton\n\n[Real seat count only if it’s honestly low.]\n[BUTTON] Get tickets', creative: 'One picture, one button.' },
  { off: 2, time: '6:30 PM', channel: 'Facebook + Instagram', format: 'Post', funnel: 'Remind', rights: 'OURS', ok: true, audience: 'Followers', cta: 'Tickets', kpi: KPI_POST,
    job: '48 hours: push or hold? (a text blast costs money — needs Jamie)', hook: '2 days', caption: 'Two days! {show} at the Kentucky Opry. 🎟️ [ticket link]\n\n' + HASH, creative: 'Show-week template; real seat counts only.' },
  { off: 1, time: '12:00 PM', channel: 'Facebook + Instagram', format: 'Video', funnel: 'Remind', rights: 'OURS', audience: 'Followers', cta: 'Tickets', kpi: KPI_POST,
    job: 'A quick video from the stage (don’t film the act without their OK).', hook: 'Tomorrow night', caption: 'Tomorrow night in Benton! 🎶 {show} · Tickets: [ticket link]\n\n' + HASH, creative: '—' },
  { off: 0, time: '9:00 AM', channel: 'Facebook + Instagram', format: 'Post + Stories', funnel: 'Remind', rights: 'OURS', audience: 'Followers', cta: 'Tickets', kpi: KPI_POST,
    job: 'Day-of reminder.', hook: 'TONIGHT', caption: 'TONIGHT! {show} · Kentucky Opry. 🎟️ [ticket link]\n\n' + HASH, creative: '—' },
  { off: -1, time: '1:00 PM', channel: 'Facebook + Instagram', format: 'Photo post', funnel: 'Consider', rights: 'OURS', audience: 'Followers', cta: 'Next show', kpi: 'Comments and shares.',
    job: 'Thank-you and the next show; crowd/room photos only (act photos only with their OK).', hook: 'Thank you!', caption: 'Thank you for coming out for {show}! 💛 Next up: [next show + link]\n\n' + HASH, creative: '—' },
]
const THEMES: [number, string][] = [[45, 'Announce'], [22, 'Build interest'], [8, 'Main push'], [1, 'Final week'], [0, 'Show day'], [-99, 'After the show']]
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

export async function startPlan(event: Event, faith: boolean) {
  const today = todayISO(), show = event.event_date!
  const fill = (s: string) => s.replaceAll('{show}', event.title).replaceAll('{date}', fmtDate(show, { weekday: 'long', month: 'long', day: 'numeric' }))
    .replaceAll('{short}', fmtDate(show, { month: 'short', day: 'numeric' }))
  const { data: plan, error } = await supabase!.from('marketing_plans').insert({ event_id: event.id, template: faith ? 'christian-gospel-v1' : 'standard-v1', status: 'IN_REVIEW',
    summary: `Kentucky Opry’s plan to sell ${event.title}. Started from the ${faith ? 'Christian & Gospel' : 'standard'} template on ${fmtDate(today, { month: 'short', day: 'numeric' })} — edit the copy in brackets before using it.`,
    links: { tickets: event.ticket_url ?? undefined, box_office: 'Kentucky Opry box office: 555-555-0100 · 88 Chilton Lane, Benton' } }).select().single()
  if (error) throw error
  const rows = TEMPLATE.filter(t => faith || !t.faith).map((t, n) => {
    const run_on = t.setup ? today : addDays(show, -t.off)
    return { t, n, run_on }
  }).filter(r => r.run_on >= today).map(({ t, n, run_on }) => {
    const left = daysUntil(run_on) ?? 0, before = Math.round((new Date(show).getTime() - new Date(run_on).getTime()) / 86400000)
    return { plan_id: plan.id, event_id: event.id, week: t.setup ? 0 : Math.floor(left / 7) + 1, week_theme: t.setup ? 'Setup' : THEMES.find(([d]) => before >= d)![1],
      run_on, run_time: t.time, channel: t.channel, format: t.format, funnel: t.funnel, job: fill(t.job), hook: fill(t.hook), caption: fill(t.caption), creative: t.creative,
      assets_needed: t.assets ?? '—', rights: t.rights, audience: t.audience, cta: t.cta, link: t.channel.includes('Meta') && t.format.includes('Checkpoint') ? null : event.ticket_url,
      tags: t.caption.includes('#') ? HASH : null, paid: !!t.paid, spend: t.spend ?? null, kpi: t.kpi, needs_approval: !!t.ok, owner: 'Rach', sort: n }
  })
  const { error: e2 } = await supabase!.from('marketing_plan_items').insert(rows)
  if (e2) throw e2
  await logChange('marketing_plan', plan.id, `Campaign plan started from template: ${event.title}`, null, { items: rows.length }, event.business_unit)
}

function StartPlan({ event }: { event: Event }) {
  const { busy, err, run } = useAsync()
  const d = daysUntil(event.event_date)
  if (d == null || d < 0) return <Empty>No campaign plan for this show.</Empty>
  return <section className="panel startplan">
    <Megaphone size={28} aria-hidden="true"/>
    <h2>No campaign plan yet</h2>
    <p>Start one from our template: every post, email, ad check and reminder from today to show day, dated for this show, with Kentucky Opry copy to edit. Nothing is posted or sent.</p>
    <div className="actions">
      <button disabled={busy} onClick={() => run(() => startPlan(event, false))}>Start a standard plan</button>
      <button disabled={busy} onClick={() => run(() => startPlan(event, true))}>Start a Christian &amp; Gospel plan (adds church outreach)</button>
    </div>
    {err && <p className="msg error">{err}</p>}
  </section>
}
