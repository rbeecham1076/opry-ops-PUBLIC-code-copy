import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { offerUndo } from './undo'

export type BusinessUnit = 'KY_OPRY' | 'CCP' | 'SHARED'
export type TaskStatus = 'OPEN' | 'WAITING' | 'IN_PROGRESS' | 'COMPLETE' | 'ARCHIVED'

export type Task = {
  id: string; title: string; description: string | null; business_unit: BusinessUnit; category: string | null
  status: TaskStatus; priority: string | null; waiting_on: string | null; due_at: string | null; event_id: string | null
  next_action: string | null; execution_system: string | null; completed_at: string | null; created_at: string; updated_at: string
  // Show-workflow fields (migration 008). source_rule_id = the workflow step code, e.g. 'A06'.
  artist_id: string | null; source_rule_id: string | null; section: string | null; purpose: string | null; done_when: string | null; blocked_by: string | null
  handling: Handling | null; approver: string | null; catch_up: boolean | null; source_document: string | null
  link_url?: string | null; link_label?: string | null
}
export type Handling = 'RACHEL' | 'CLARIFY' | 'APPROVAL' | 'TEAM'
export type Event = {
  id: string; title: string; business_unit: BusinessUnit; event_date: string | null; starts_at: string | null; doors_at: string | null
  tickets_sold: number | null; ticket_revenue: number | null; external_source: string | null; external_id: string | null
  ticketing_system: string | null; last_refreshed_at: string | null; image_url: string | null; venue: { name: string; capacity: number | null; city?: string | null } | null
  artist_id: string | null; venue_id: string | null; show_status: string | null; announce_date: string | null; on_sale_date: string | null
  ticket_url: string | null; ticketable_capacity: number | null; show_type: string | null; notes: string | null
  data_confidence: string | null; known_issue: string | null
}
export type Idea = {
  id: string; body: string; source: string | null; business_unit: BusinessUnit; category: string | null; objective: string | null
  status: string; add_to_wednesday: boolean; event_id: string | null; created_at: string
}
export type MeetingItem = {
  id: string; meeting_date: string | null; item_type: string | null; title: string; detail: string | null; business_unit: BusinessUnit
  status: string; owner: string | null; decision: string | null; next_step: string | null; created_at: string
}

// Loads a table and re-loads it whenever the table changes in any session (Supabase realtime).
export function useTable<T>(table: string, select = '*', order: { column: string; ascending?: boolean } = { column: 'created_at' }) {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase!.from(table).select(select).order(order.column, { ascending: order.ascending ?? true, nullsFirst: false })
    if (error) setError(error.message)
    else { setRows((data ?? []) as T[]); setError(null) }
    setLoading(false)
  }, [table, select, order.column, order.ascending])

  useEffect(() => {
    load()
    const channel = supabase!.channel(`live:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => { load() })
      .subscribe()
    return () => { supabase!.removeChannel(channel) }
  }, [load, table])

  return { rows, loading, error, reload: load }
}

export const useTasks = () => useTable<Task>('tasks', '*', { column: 'created_at' })
export const useEvents = () => useTable<Event>('events', '*, venue:venues(name, capacity, city)', { column: 'event_date' })
export const useIdeas = () => useTable<Idea>('ideas', '*', { column: 'created_at', ascending: false })
export const useMeetingItems = () => useTable<MeetingItem>('meeting_items', '*', { column: 'created_at' })
export const useDecisions = () => useTable<Decision>('decisions', '*', { column: 'created_at', ascending: false })
export const useDataQuality = () => useTable<DataIssue>('data_quality_issues', '*', { column: 'created_at' })

// FACT lives on records. A Decision row holds a RECOMMENDATION and, separately, what was actually DECIDED.
export type Decision = {
  id: string; title: string; kind: string; status: 'OPEN' | 'RECOMMENDED' | 'APPROVED' | 'DECLINED' | 'ANSWERED' | 'WITHDRAWN'
  business_unit: BusinessUnit; event_id: string | null; approver: string | null; why: string | null
  recommendation: string | null; recommended_amount: number | null; recommended_by: string | null; recommended_at: string | null; evidence: string | null
  decision: string | null; approved_amount: number | null; decided_by: string | null; decided_at: string | null
  next_step: string | null; source: string | null; created_at: string
  goal?: string | null; success_measure?: string | null; check_on?: string | null; note?: string | null
}
export type DataIssue = { id: string; title: string; severity: string | null; status: string; detail: string | null; created_at: string }
export const isWaiting = (d: Decision) => d.status === 'OPEN' || d.status === 'RECOMMENDED'

export async function addDecision(fields: Partial<Decision> & { title: string }) {
  const rec = fields.recommendation || fields.recommended_amount != null
  const row = { kind: 'QUESTION', ...fields, status: rec ? 'RECOMMENDED' : 'OPEN', recommended_by: rec ? 'Rach' : null, recommended_at: rec ? new Date().toISOString() : null }
  const { data, error } = await supabase!.from('decisions').insert(row).select().single()
  if (error) throw error
  await logChange('decision', data.id, rec ? 'Recommendation recorded (not approved)' : 'Question added to decision log', null, row, fields.business_unit ?? 'SHARED')
}

// Recording what management decided. approved_amount is only ever what the approver said — never copied silently.
export async function recordDecision(d: Decision, outcome: 'APPROVED' | 'DECLINED' | 'ANSWERED', decidedBy: string, decision: string, approvedAmount: number | null) {
  const patch = { status: outcome, decided_by: decidedBy, decided_at: new Date().toISOString(), decision: decision || null,
    approved_amount: outcome === 'APPROVED' ? approvedAmount : null, updated_at: new Date().toISOString() }
  const { error } = await supabase!.from('decisions').update(patch).eq('id', d.id)
  if (error) throw error
  const { data: u } = await supabase!.auth.getUser()
  await supabase!.from('change_log').insert({ entity_type: 'decision', entity_id: d.id, what_changed: `${outcome === 'APPROVED' ? 'Approved' : outcome === 'DECLINED' ? 'Declined' : 'Answered'}: ${d.title}`,
    before_value: { status: d.status, recommended_amount: d.recommended_amount }, after_value: patch, business_unit: d.business_unit,
    approved_by: outcome === 'APPROVED' ? decidedBy : null, reason: decision || null, created_by: u.user?.id ?? null })
}

// Writes. Every write also records a change-log line so edits keep their history.
// An edit is not an approval: approved_by is only set through a recorded decision (brief §32).
export async function logChange(entity_type: string, entity_id: string, what_changed: string, before_value: unknown, after_value: unknown, business_unit: BusinessUnit = 'SHARED') {
  const { data: u } = await supabase!.auth.getUser()
  await supabase!.from('change_log').insert({ entity_type, entity_id, what_changed, before_value, after_value, business_unit, created_by: u.user?.id ?? null })
}

export async function updateTask(task: Task, patch: Partial<Task>, note: string) {
  const full = { ...patch, updated_at: new Date().toISOString() }
  if (patch.status === 'COMPLETE') full.completed_at = new Date().toISOString()
  const { error } = await supabase!.from('tasks').update(full).eq('id', task.id)
  if (error) throw error
  const before = Object.fromEntries(Object.keys(full).filter(k => k !== 'updated_at').map(k => [k, (task as Record<string, unknown>)[k] ?? null]))
  await logChange('task', task.id, note, before, patch, task.business_unit)
  offerUndo(`${note}: ${task.title}`, async () => {
    const { error } = await supabase!.from('tasks').update({ ...before, updated_at: new Date().toISOString() }).eq('id', task.id)
    if (error) throw error
    await logChange('task', task.id, `Undone — ${note}`, patch, before, task.business_unit)
  })
}

export async function addTask(fields: Partial<Task> & { title: string }) {
  const { data, error } = await supabase!.from('tasks').insert({ status: 'OPEN', priority: 'Medium', business_unit: 'SHARED', ...fields }).select().single()
  if (error) throw error
  offerUndo(`Added: ${fields.title}`, async () => { const { error } = await supabase!.from('tasks').delete().eq('id', data.id); if (error) throw error })
  return data as Task
}

export async function addIdea(body: string, add_to_wednesday = false) {
  const { error } = await supabase!.from('ideas').insert({ body, source: 'RACHEL', status: 'NEW', add_to_wednesday })
  if (error) throw error
}

export async function updateIdea(idea: Idea, patch: Partial<Idea>, note: string) {
  const { error } = await supabase!.from('ideas').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', idea.id)
  if (error) throw error
  const before = Object.fromEntries(Object.keys(patch).map(k => [k, (idea as Record<string, unknown>)[k]]))
  await logChange('idea', idea.id, note, before, patch, idea.business_unit)
}

export async function addMeetingItem(fields: Partial<MeetingItem> & { title: string }) {
  const { error } = await supabase!.from('meeting_items').insert({ status: 'OPEN', ...fields })
  if (error) throw error
}

export async function updateMeetingItem(item: MeetingItem, patch: Partial<MeetingItem>, note: string) {
  const { error } = await supabase!.from('meeting_items').update(patch).eq('id', item.id)
  if (error) throw error
  const before = Object.fromEntries(Object.keys(patch).map(k => [k, (item as Record<string, unknown>)[k]]))
  await logChange('meeting_item', item.id, note, before, patch, item.business_unit)
}

// ---------- show workspace ----------
// Rows belonging to one show, kept live. Tables: agreements, financial_obligations, show_facts, asset_requests,
// settlements, documents, ticket_snapshots, event_artists.
export function useShowRows<T>(table: string, eventId: string, select = '*', order = 'created_at') {
  const [rows, setRows] = useState<T[]>([])
  const load = useCallback(async () => {
    let qy = supabase!.from(table).select(select).eq('event_id', eventId)
    if (order) qy = qy.order(order, { ascending: true })
    const { data } = await qy
    setRows((data ?? []) as T[])
  }, [table, eventId, select, order])
  useEffect(() => {
    load()
    const channel = supabase!.channel(`show:${table}:${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `event_id=eq.${eventId}` }, () => { load() })
      .subscribe()
    return () => { supabase!.removeChannel(channel) }
  }, [load, table, eventId])
  return { rows, reload: load }
}

export type Agreement = {
  id: string; event_id: string; kind: string; status: string; received_at: string | null; signed_at: string | null
  sent_back_at: string | null; fully_executed_at: string | null; signed_by: string | null; radius_clause: string | null
  merch_fee: string | null; payable_to: string | null; ticket_holds: string | null; notes: string | null
}
export type MoneyLine = {
  id: string; event_id: string; category: string | null; obligation_type: string; payee: string | null; direction: string
  estimated_amount: number | null; actual_amount: number | null; due_at: string | null; status: string; paid_at: string | null; notes: string | null
}
export type ShowFact = { event_id: string; section: string; field: string; value: string | null; source: string | null; updated_at: string }
export type AssetRequest = { id: string; event_id: string; asset_type: string; status: string; approved_by: string | null; url: string | null; notes: string | null; updated_at: string }
export type Settlement = {
  event_id: string; status: string; final_tickets: number | null; final_gross: number | null; total_expenses: number | null
  profit: number | null; marketing_spend: number | null; box_office_report_url: string | null; check_to_partners: string | null
  lessons: string | null; settled_at: string | null
  concessions_gross: number | null; concessions_notes: string | null; rental_fee: number | null; renter: string | null
}
export type Doc = { id: string; title: string; document_type: string | null; url: string | null; created_at: string }
export type Snapshot = { id: string; captured_at: string; tickets_sold: number | null; gross: number | null; source: string | null; data_confidence: string | null }
export type Billing = { event_id: string; billing: string; artist: { id: string; name: string; agent: { name: string; email: string | null; phone: string | null } | null } | null }

// Generic row writes for the workspace, each logged to the change log (an edit is not an approval).
export async function saveRow(table: string, match: Record<string, string>, patch: Record<string, unknown>, label: string, entityId: string) {
  const { data: prev } = await supabase!.from(table).select(Object.keys(patch).join(',')).match(match).maybeSingle()
  const { error } = await supabase!.from(table).update({ ...patch, updated_at: new Date().toISOString() }).match(match)
  if (error) throw error
  await logChange(table, entityId, label, prev ?? null, patch)
  if (prev) offerUndo(label, async () => {
    const { error } = await supabase!.from(table).update({ ...(prev as unknown as Record<string, unknown>), updated_at: new Date().toISOString() }).match(match)
    if (error) throw error
    await logChange(table, entityId, `Undone — ${label}`, patch, prev)
  })
}
export async function insertRow(table: string, row: Record<string, unknown>, label: string, entityId: string) {
  const { error } = await supabase!.from(table).insert(row)
  if (error) throw error
  await logChange(table, entityId, label, null, row)
  if (typeof row.id === 'string') offerUndo(label, async () => { const { error } = await supabase!.from(table).delete().eq('id', row.id as string); if (error) throw error })
}
export async function upsertFact(eventId: string, section: string, field: string, value: string) {
  const { data: prev } = await supabase!.from('show_facts').select('value, source').match({ event_id: eventId, section, field }).maybeSingle()
  const { error } = await supabase!.from('show_facts').upsert({ event_id: eventId, section, field, value: value || null, source: 'Entered in Opry Ops', updated_at: new Date().toISOString() })
  if (error) throw error
  await logChange('show_fact', eventId, `${section}: ${field}`, prev ?? null, { value })
  offerUndo(`${field} changed`, async () => {
    const q = prev ? supabase!.from('show_facts').update({ ...prev, updated_at: new Date().toISOString() }).match({ event_id: eventId, section, field })
      : supabase!.from('show_facts').delete().match({ event_id: eventId, section, field })
    const { error } = await q; if (error) throw error
  })
}
export async function updateEvent(event: Event, patch: Partial<Event>, note: string) {
  const { error } = await supabase!.from('events').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', event.id)
  if (error) throw error
  const before = Object.fromEntries(Object.keys(patch).map(k => [k, (event as Record<string, unknown>)[k] ?? null]))
  await logChange('event', event.id, note, before, patch, event.business_unit)
  offerUndo(note, async () => {
    const { error } = await supabase!.from('events').update({ ...before, updated_at: new Date().toISOString() }).eq('id', event.id)
    if (error) throw error
    await logChange('event', event.id, `Undone — ${note}`, patch, before, event.business_unit)
  })
}

export const HANDLING_LABEL: Record<Handling, string> = { RACHEL: 'You can handle', CLARIFY: 'Needs an answer', APPROVAL: 'Needs approval', TEAM: 'Team action' }
export const isShowStep = (t: Task) => !!t.source_rule_id && !!t.event_id
export const capacityOf = (e: Event) => e.ticketable_capacity ?? e.venue?.capacity ?? null

// Tickets sold over the last 7 days, from snapshots. Null until there are two snapshots at least ~a day apart.
export function velocity(snaps: Snapshot[]) {
  const s = snaps.filter(x => x.tickets_sold != null).sort((a, b) => a.captured_at.localeCompare(b.captured_at))
  if (s.length < 2) return null
  const last = s[s.length - 1], since = new Date(last.captured_at).getTime() - 7 * 86400000
  const base = [...s].reverse().find(x => new Date(x.captured_at).getTime() <= since) ?? s[0]
  const days = (new Date(last.captured_at).getTime() - new Date(base.captured_at).getTime()) / 86400000
  if (days < 0.9) return null
  return { sold: (last.tickets_sold ?? 0) - (base.tickets_sold ?? 0), days: Math.round(days) }
}

// ---------- display helpers ----------
export const PRIORITY_RANK: Record<string, number> = { Critical: 0, Urgent: 0, High: 1, Medium: 2, Normal: 2, Low: 3 }
export const byPriority = (a: Task, b: Task) =>
  (PRIORITY_RANK[a.priority ?? ''] ?? 2) - (PRIORITY_RANK[b.priority ?? ''] ?? 2) ||
  (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999') || a.title.localeCompare(b.title)

// The one ranking rule for every list: the soonest show first, then importance (Critical → Low), then due date.
// A task tied to a show goes by the show's date even if it has no due date of its own; a task with no show goes by its
// own due date; anything with neither goes last.
export function rankTasks(events: Event[]) {
  const dateOf = new Map(events.map(e => [e.id, e.event_date]))
  const when = (t: Task) => (t.event_id && dateOf.get(t.event_id)) || t.due_at?.slice(0, 10) || '9999-12-31'
  return (a: Task, b: Task) => when(a).localeCompare(when(b)) || (a.event_id ?? '').localeCompare(b.event_id ?? '') || byPriority(a, b)
}
// Same idea for questions waiting on Clay, Barbie or Jamie: the soonest show first, then the one waiting longest.
export function rankDecisions(events: Event[]) {
  const dateOf = new Map(events.map(e => [e.id, e.event_date]))
  const when = (d: Decision) => (d.event_id && dateOf.get(d.event_id)) || '9999-12-31'
  return (a: Decision, b: Decision) => when(a).localeCompare(when(b)) || (a.created_at ?? '').localeCompare(b.created_at ?? '')
}

export const STATUS_LABEL: Record<TaskStatus, string> = { OPEN: 'To do', IN_PROGRESS: 'In progress', WAITING: 'Waiting', COMPLETE: 'Done', ARCHIVED: 'Archived' }
export const BU_LABEL: Record<BusinessUnit, string> = { KY_OPRY: 'Kentucky Opry', CCP: 'CCP', SHARED: 'Shared' }

const TZ = 'America/Chicago'
export const fmtDate = (d: string | null, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { timeZone: TZ, ...opts }) : ''
export const fmtTime = (d: string | null) => d ? new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : ''
export const money = (n: number | null) => n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ })
export const daysUntil = (date: string | null) => date ? Math.round((new Date(date + 'T12:00:00').getTime() - new Date(todayISO() + 'T12:00:00').getTime()) / 86400000) : null

// Next Wednesday (today if it is Wednesday), as YYYY-MM-DD in Central time.
export function nextWednesday() {
  const t = new Date(todayISO() + 'T12:00:00')
  t.setDate(t.getDate() + ((3 - t.getDay() + 7) % 7))
  return t.toISOString().slice(0, 10)
}

// Show health, from sell-through against capacity and days to show. Explains itself so the badge is never a mystery.
// ("Selling fast" needs sales pace over time, which needs repeated ticket snapshots — not claimed until that exists.)
export function showState(e: Event): { label: string; tone: 'good' | 'bad'; why: string } | null {
  const d = daysUntil(e.event_date), cap = capacityOf(e), sold = e.tickets_sold
  if (d == null || d < 0 || !cap || sold == null) return null
  const pct = sold / cap
  if (pct >= 0.9) return { label: 'Near sellout', tone: 'good', why: `${Math.round(pct * 100)}% of ${cap} seats sold` }
  if ((d <= 21 && pct < 0.5) || (d <= 60 && pct < 0.2))
    return { label: 'Needs attention', tone: 'bad', why: `${Math.round(pct * 100)}% sold with ${d} days to go` }
  return null
}

// A booked show (not a hold or a cancelled date). Holds are real dates, but they aren't "shows coming up" yet.
export const isHoldOrCancelled = (e: Event) => e.show_status === 'HOLD' || e.show_status === 'CANCELLED'

// The line a show has to be over not to count as "behind pace" — the same rule showState uses, spelled out:
// under 20% sold with 60 days or less to go, or under half sold with 3 weeks or less. Not a forecast.
export function paceTarget(e: Event): { seats: number; pct: number; short: number; rule: string } | null {
  const d = daysUntil(e.event_date), cap = capacityOf(e), sold = e.tickets_sold
  if (d == null || d < 0 || !cap || sold == null) return null
  const pct = d <= 21 ? 0.5 : d <= 60 ? 0.2 : null
  if (pct == null) return null
  const seats = Math.ceil(cap * pct)
  return { seats, pct, short: Math.max(0, seats - sold), rule: d <= 21 ? 'half sold with 3 weeks to go' : '20% sold with 60 days to go' }
}

// "Needs a yes" — ONE count used everywhere (menu badge, My Day, the Needs a yes page):
// open questions for Clay/Barbie/Jamie + show sign-offs due in the next 14 days (or undated office sign-offs).
export function needsAYes(decisions: Decision[], tasks: Task[]) {
  const until = new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const questions = decisions.filter(isWaiting)
  const signOffs = tasks.filter(t => t.handling === 'APPROVAL' && !t.catch_up && (t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'WAITING')
    && (t.due_at ? t.due_at.slice(0, 10) <= until : !t.source_rule_id)).sort((a, b) => (a.due_at ?? '9').localeCompare(b.due_at ?? '9'))
  return { questions, signOffs, total: questions.length + signOffs.length }
}

// ---------- time clock ----------
export type TimeEntry = { id: string; user_id: string; started_at: string; ended_at: string | null; note: string | null }

export function useClock() {
  const [entry, setEntry] = useState<TimeEntry | null>(null)
  const [now, setNow] = useState(Date.now())
  const load = useCallback(async () => {
    const { data } = await supabase!.from('time_entries').select('*').is('ended_at', null).order('started_at', { ascending: false }).limit(1)
    setEntry((data?.[0] as TimeEntry) ?? null)
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (!entry) return; const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [entry])
  const clockIn = async () => {
    const { data: u } = await supabase!.auth.getUser()
    const { error } = await supabase!.from('time_entries').insert({ user_id: u.user?.id, started_at: new Date().toISOString(), business_unit: 'SHARED' })
    if (error) throw error
    setNow(Date.now()); await load()
  }
  const clockOut = async () => {
    if (!entry) return
    const { error } = await supabase!.from('time_entries').update({ ended_at: new Date().toISOString() }).eq('id', entry.id)
    if (error) throw error
    await load()
  }
  const minutes = entry ? Math.max(0, Math.floor((now - new Date(entry.started_at).getTime()) / 60000)) : 0
  return { entry, minutes, clockIn, clockOut }
}

// Rental fees are coded but not shown yet (Rach, 2026-09-28: not her call yet). Flip to true to bring them back.
export const SHOW_RENTALS = false
// Walmart phone checklist (no-sign-in link for the day-of-show lead) — built, but switched off until later. Printable list is used instead.
export const SHOW_PHONE_LIST = false

// One tap: everything due before Opry Ops started (Sept 28, 2026) was handled. Pass an event id for one show, or nothing for all.
export async function confirmCatchUp(eventId?: string) {
  const { data, error } = await supabase!.rpc('confirm_catch_up', { p_event: eventId ?? null })
  if (error) throw error
  return data as number
}

// What to show on screen for a stored approver value — Clay and Barbie by name, never "Owners".
export const whoLabel = (w: string) => w.replace(/^Owners \/ Jamie$/, 'Clay, Barbie & Jamie').replace(/^Owners$/, 'Clay & Barbie')
