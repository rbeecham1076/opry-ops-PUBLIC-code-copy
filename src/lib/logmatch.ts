// "Log it" smarts: read what Rach wrote and suggest where it goes — which show it's about, which open
// task(s) it finishes, and what kind of work it is. Plain word matching (no AI service, $0), always shown
// to her before anything is saved.
import type { Event, Task } from './data'

const STOP = new Set(('a an the and or but for to of in on at by with from up out off into over about as is are was were be been it its this that these those ' +
  'i me my we our you your he she they them their his her have has had do did done doing get got make made just also then than so very all any some ' +
  'what when where who which how please need needs needed will would should could can may might one two show shows ticket tickets ' +
  'today tomorrow yesterday this week asked ask sent send').split(' '))
// Words that mean the same thing in the office (including common misspellings)
const SAME: Record<string, string> = {
  comped: 'comp', comps: 'comp', comping: 'comp', complimentary: 'comp',
  performa: 'proforma', performas: 'proforma', proformas: 'proforma', 'pro-forma': 'proforma',
  contracts: 'contract', etown: 'elizabethtown', 'e-town': 'elizabethtown',
  printed: 'print', printing: 'print', emailed: 'email', emails: 'email', called: 'call', texted: 'text',
  posted: 'post', posts: 'post', scheduled: 'schedule', ordered: 'order', riders: 'rider', ads: 'ad', advert: 'ad',
  signed: 'sign', signature: 'sign', filled: 'fill', finished: 'finish', updated: 'update', added: 'add',
}
// Title words too common to identify a show on their own
const GENERIC = new Set('christmas tour starring tribute night free gospel bluegrass classic country music magic the and brothers sound band live'.split(' '))

function stem(w: string): string {
  w = SAME[w] ?? w
  if (w.length > 5) w = w.replace(/(ing|ed|e)$/, '')
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  return SAME[w] ?? w
}
export function words(s: string): string[] {
  return s.toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9-]+/).map(w => w.replace(/^-+|-+$/g, ''))
    .filter(w => w.length > 1 && !STOP.has(w)).map(stem).filter(w => w.length > 1 && !STOP.has(w))
}

export type ShowGuess = { event: Event; why: string }
// Shows the note is about: a distinctive word from the show's title, sharpened by the town (Etown vs Benton).
export function guessShows(text: string, events: Event[], today: string): ShowGuess[] {
  const t = new Set(words(text))
  const hits = events.filter(e => !e.event_date || e.event_date >= addDays(today, -7)).map(e => {
    const key = words(e.title).filter(w => w.length >= 4 && !GENERIC.has(w))
    const hit = key.filter(w => t.has(w))
    const town = words([e.venue?.name ?? '', e.venue?.city ?? ''].join(' ')).filter(w => !GENERIC.has(w) && w !== 'theater' && w !== 'historic')
    const townHit = town.some(w => t.has(w)) || (t.has('opry') && /opry/i.test(e.venue?.name ?? '')) || (t.has('benton') && /opry/i.test(e.venue?.name ?? ''))
    return { event: e, score: hit.length ? hit.length / Math.max(1, key.length) + (townHit ? 0.5 : 0) : 0, why: hit.join(', ') }
  }).filter(h => h.score > 0).sort((a, b) => b.score - a.score || (a.event.event_date ?? '').localeCompare(b.event.event_date ?? ''))
  return hits.map(h => ({ event: h.event, why: h.why }))
}

export type TaskGuess = { task: Task; score: number; shared: string[] }
// Open tasks the note probably finishes (or moves along). Needs real overlap, not one common word.
export function guessTasks(text: string, tasks: Task[], shows: Event[]): TaskGuess[] {
  const t = new Set(words(text))
  if (t.size === 0) return []
  const showIds = shows.map(e => e.id)
  const showWords = new Set(shows.flatMap(e => words(e.title)))
  return tasks.filter(k => k.status === 'OPEN' || k.status === 'IN_PROGRESS' || k.status === 'WAITING').map(k => {
    const titleWords = new Set(words(k.title))
    const kw = [...new Set([...titleWords, ...words(k.next_action ?? '')])]
    const shared = kw.filter(w => t.has(w))
    const real = shared.filter(w => !showWords.has(w))       // words about the work itself, not just the show's name
    const sameShow = !!k.event_id && showIds.includes(k.event_id)
    const score = (shared.filter(w => titleWords.has(w)).length + 0.3 * shared.filter(w => !titleWords.has(w)).length) / Math.max(3, Math.min(titleWords.size, 6)) + (sameShow ? 0.35 : 0) - (showIds.length && k.event_id && !sameShow ? 0.3 : 0)
    return { task: k, score, shared, real: real.length, sameShow }
  }).filter(g => g.real >= 2 || (g.real >= 1 && (g.sameShow || g.score >= 0.5))).filter(g => g.score >= 0.4)
    .sort((a, b) => b.score - a.score).slice(0, 4).map(({ task, score, shared }) => ({ task, score, shared }))
}

const AREA_WORDS: [string, string[]][] = [
  ['Box office', ['comp', 'etix', 'box', 'refund', 'seat', 'seating', 'will-call', 'hold', 'exchange']],
  ['Booking', ['contract', 'proforma', 'offer', 'agent', 'booking', 'deposit', 'sign', 'radius', 'guarantee']],
  ['Marketing', ['ad', 'post', 'facebook', 'instagram', 'cymbal', 'campaign', 'flyer', 'poster', 'reel', 'video', 'email', 'press', 'radio']],
  ['Show day', ['rider', 'walmart', 'hospitality', 'dressing', 'catering', 'usher', 'stagehand', 'merch', 'load-in', 'soundcheck', 'hotel']],
  ['Systems', ['opry', 'ops', 'app', 'propresenter', 'website', 'drive', 'spreadsheet']],
]
export function guessArea(text: string): string | null {
  const t = new Set(words(text)); let best: string | null = null, n = 0
  for (const [area, ws] of AREA_WORDS) { const c = ws.filter(w => t.has(w)).length; if (c > n) { best = area; n = c } }
  return best
}

// "Printed contracts for The Isaacs" → a short task title when a new task is needed.
export function taskTitleFrom(text: string, next: string): string {
  const base = (next.trim() || text.trim()).replace(/\s+/g, ' ')
  const t = base.charAt(0).toUpperCase() + base.slice(1)
  return t.length > 120 ? t.slice(0, 117) + '…' : t
}

function addDays(iso: string, n: number) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
