import { useState } from 'react'
import { Clock3, ExternalLink, Info, ListChecks, LogOut, Menu, Search, Stamp, Sun, Ticket, Wifi, X } from 'lucide-react'
import { needsAYes, useClock, useDataQuality, useDecisions, useEvents, useIdeas, useMeetingItems, useTasks } from './lib/data'
import { Approvals } from './approvals'
import { DayOfShowSheet } from './dayofshow'
import { ContactsPage, MyWorkPage, WednesdayIdeasPage, type ContactsTab, type WedTab, type WorkTab } from './pages'
import { GlobalSearch } from './search'
import { Record45, TextSize, UndoToast } from './chrome'
import { Marketing } from './marketing'
import { Inbox, Reports } from './reports'
import { MyDay, Shows, Tasks, type Page } from './screens'
import { ShowWorkspace } from './workspace'
import { OpryStory } from './story'
import { OpenShow } from './popup'
import { assignShowColors } from './components'
import { NeonStar, SignCowboy } from './neon'
import { SetPassword } from './password'

// The menu, grouped by what Rach is trying to do, each with a plain one-line "what's in here".
type NavItem = { page: Page; label: string; hint: string }
const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'Today', items: [{ page: 'My Day', label: 'My Day', hint: 'Start here: what needs you now' }] },
  { label: 'The work', items: [
    { page: 'Shows', label: 'Shows', hint: 'Every show and its checklist' },
    { page: 'To-Do', label: 'To-Do', hint: 'All your tasks in one list' },
    { page: 'Approvals', label: 'Needs a yes', hint: 'Questions for Clay, Barbie or Jamie' },
    { page: 'Inbox', label: 'Emails', hint: 'Work email, sorted each morning' } ] },
  { label: 'Planning', items: [
    { page: 'Marketing', label: 'Marketing', hint: 'Ads, email blasts and posts' },
    { page: 'Wednesday & Ideas', label: 'Wednesday & Ideas', hint: 'Meeting list and idea drop' } ] },
  { label: 'Look it up', items: [
    { page: 'Contacts & Info', label: 'Contacts & Info', hint: 'Phones, venues, where files live' },
    { page: 'Reports', label: 'Reports', hint: 'Sales, settlements, show sheets' } ] },
]
// Pages only Rach needs now and then: small links at the very bottom, easy to ignore.
const TUCKED: { page: Page; label: string }[] = [{ page: 'My Work', label: 'My work log' }, { page: 'Opry Story', label: 'Opry Story' }]
const NAV = GROUPS.flatMap(g => g.items)
// Phone: the four places Rach goes most sit in a bottom tab bar; everything else is one tap away under "More".
const TABS: { page: Page; label: string; icon: typeof Sun }[] = [
  { page: 'My Day', label: 'My Day', icon: Sun }, { page: 'Shows', label: 'Shows', icon: Ticket },
  { page: 'To-Do', label: 'To-Do', icon: ListChecks }, { page: 'Approvals', label: 'Needs a yes', icon: Stamp },
]
const SHEET: NavItem[] = NAV.filter(n => !TABS.some(t => t.page === n.page))
// Quick sign-ins for office work. They open in a new tab; Opry Ops never stores these passwords.
const LOGINS = [
  { label: 'Etix box office', href: 'https://boxoffice.etix.com/ticket/', title: 'Etix box office sign-in (tickets, holds, reports)' },
  { label: 'Cymbal', href: 'https://manager.cymbal.co/login', title: 'Cymbal Manager sign-in (emails, texts, ads, audiences)' },
]
// Old page names still work (search results, My Day links) and land on the right tab of the combined page.
const ALIAS: Partial<Record<Page, [Page, string]>> = { Improvements: ['My Work', 'improvements'], 'My Role': ['My Work', 'private'], Ideas: ['Wednesday & Ideas', 'ideas'],
  'Wednesday Meeting': ['Wednesday & Ideas', 'meeting'], 'Artists & Venues': ['Contacts & Info', 'artists'], 'Show Calendar': ['Shows', 'calendar'], Churches: ['Contacts & Info', 'churches'], 'Open Questions': ['Wednesday & Ideas', 'questions'] }

export function Dashboard({ onSignOut }: { onSignOut?: () => void }) {
  const [page, setPage] = useState<Page>('My Day')
  const [q, setQ] = useState('')
  const [showId, setShowId] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const [searching, setSearching] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [showsMode, setShowsMode] = useState<'list' | 'calendar'>('list')
  const [contactsTab, setContactsTab] = useState<ContactsTab>('team'); const [workTab, setWorkTab] = useState<WorkTab>('improvements'); const [wedTab, setWedTab] = useState<WedTab>('meeting')
  const openShow = (id: string) => { setPage('Shows'); setShowId(id); setSheet(false); setQ(''); setSearching(false); window.scrollTo(0, 0) }
  const openSheet = (id: string) => { openShow(id); setSheet(true) }
  const tasks = useTasks(), events = useEvents(), ideas = useIdeas(), meeting = useMeetingItems(), decisions = useDecisions(), issues = useDataQuality()
  const loading = tasks.loading || events.loading || ideas.loading || meeting.loading || decisions.loading
  const error = tasks.error || events.error || ideas.error || meeting.error || decisions.error
  // One "Needs a yes" count everywhere (see needsAYes): open questions + sign-offs due in the next 14 days.
  const waiting = needsAYes(decisions.rows, tasks.rows).total
  const data = { tasks: tasks.rows, events: events.rows, ideas: ideas.rows, meeting: meeting.rows, decisions: decisions.rows, issues: issues.rows }
  assignShowColors(events.rows)
  const clock = useClock()
  const [clockErr, setClockErr] = useState<string | null>(null)
  const toggleClock = () => (clock.entry ? clock.clockOut() : clock.clockIn()).catch(e => setClockErr(e.message))
  const hm = `${Math.floor(clock.minutes / 60)}h ${String(clock.minutes % 60).padStart(2, '0')}m`
  const go = (to: Page) => { const [p, tab] = ALIAS[to] ?? [to, '']
    setShowsMode(p === 'Shows' && tab === 'calendar' ? 'calendar' : 'list')
    if (tab) { if (p === 'My Work') setWorkTab(tab as WorkTab); if (p === 'Wednesday & Ideas') setWedTab(tab as WedTab); if (p === 'Contacts & Info') setContactsTab(tab as ContactsTab) }
    setPage(p); setShowId(null); setSheet(false); setQ(''); setSearching(false); setSheetOpen(false); window.scrollTo(0, 0) }

  return <OpenShow.Provider value={openShow}><div className="shell">
    <aside>
      <div className="brand"><img className="brandlogo" src="/brand/kentucky-opry-white-gold.png" alt="Kentucky Opry Theater"/><div className="brandsub"><strong>OPRY OPS</strong><small>The office behind the stage</small></div>
        <NeonStar size={46} className="brandstar"/></div>
      <nav aria-label="Main">
        {GROUPS.map(g => <div key={g.label} className="navgroup"><small className="navlabel">{g.label}</small>
          {g.items.map(n => <button key={n.page} className={'navitem' + (page === n.page ? ' active' : '')} aria-current={page === n.page ? 'page' : undefined} onClick={() => go(n.page)}>
            <span>{n.label}{n.page === 'Approvals' && waiting > 0 && <i className="navbadge">{waiting}</i>}</span><small>{n.hint}</small></button>)}</div>)}
        <small className="navlabel logins">Quick sign-in</small>
        {LOGINS.map(l => <a key={l.href} className="navlink" href={l.href} target="_blank" rel="noopener noreferrer" title={l.title}>{l.label} <ExternalLink size={14} aria-hidden="true"/><span className="sr-only"> (opens in a new tab)</span></a>)}
        <div className="navtucked">{TUCKED.map(n => <button key={n.page} className={page === n.page ? 'active' : ''} aria-current={page === n.page ? 'page' : undefined} onClick={() => go(n.page)}>{n.label}</button>)}
          {onSignOut && <button onClick={() => setPwOpen(true)}>Set password</button>}</div>
      </nav>
      <div className="signnod" title="The guitar-playing cowboy from the original Kentucky Opry sign — he still hangs in the lobby"><SignCowboy size={58}/><small>Since 1988</small></div>
    </aside>
    <main data-page={page.toLowerCase().replace(/[^a-z]+/g, '-')}>
      <header>
        <div className="search"><Search size={18}/><input value={q} onChange={e => { setQ(e.target.value); setSearching(e.target.value.trim().length >= 2) }} onKeyDown={e => e.key === 'Escape' && setSearching(false)} placeholder="Search everything — a name, artist, “hotel”…" aria-label="Search everything"/></div>
        <button className={'qibtn' + (page === 'Contacts & Info' ? ' on' : '')} onClick={() => { setContactsTab('team'); go('Contacts & Info') }} title="Team phone numbers, venue facts, where files live"><Info size={18}/> Contacts & Info</button>
        <TextSize/>
        <span className="sync live" title="Changes appear instantly on every device"><Wifi size={16}/> Live</span>
        <button className={'clock' + (clock.entry ? ' running' : '')} onClick={toggleClock} title={clock.entry ? 'Clock out' : 'Clock in'}><Clock3 size={17}/> {clock.entry ? `On the clock ${hm} · Clock out` : 'Clock in'}</button>
        {onSignOut && <button className="signout" onClick={onSignOut}><LogOut size={17}/> Sign out</button>}
      </header>
      {clockErr && <p className="msg error banner">Clock: {clockErr}</p>}
      {error && <p className="msg error banner">Couldn’t load some data: {error}</p>}
      {searching && !loading && <GlobalSearch q={q} events={data.events} tasks={data.tasks} decisions={data.decisions} openShow={openShow} go={go} close={() => setSearching(false)}/>}
      {loading ? <Record45 label="Getting today’s show ready…"/> : <>
        {page === 'My Day' && <MyDay data={data} q={q} go={go} openShow={openShow}/>}
        {page === 'To-Do' && <Tasks data={data} q={q} openShow={openShow}/>}
        {page === 'Shows' && (() => { const ev = showId ? events.rows.find(e => e.id === showId) : undefined
          return ev ? sheet ? <DayOfShowSheet event={ev} events={events.rows} onBack={() => setSheet(false)}/>
            : <ShowWorkspace event={ev} tasks={tasks.rows} onBack={() => setShowId(null)} onSheet={() => { setSheet(true); window.scrollTo(0, 0) }}/> : <Shows data={data} q={q} openShow={openShow} initialMode={showsMode}/> })()}
        {page === 'Wednesday & Ideas' && <WednesdayIdeasPage data={data} q={q} tab={wedTab} setTab={setWedTab}/>}
        {page === 'Approvals' && <Approvals decisions={data.decisions} tasks={data.tasks} events={data.events} q={q}/>}
        {page === 'Reports' && <Reports events={data.events} decisions={data.decisions} tasks={data.tasks} openSheet={openSheet}/>}
        {page === 'Inbox' && <Inbox events={data.events}/>}
        {page === 'My Work' && <MyWorkPage tab={workTab} setTab={setWorkTab}/>}
        {page === 'Contacts & Info' && <ContactsPage events={data.events} q={q} openShow={openShow} tab={contactsTab} setTab={setContactsTab}/>}
        {page === 'Marketing' && <Marketing events={data.events} openShow={openShow}/>}
        {page === 'Opry Story' && <OpryStory events={data.events} openShow={openShow}/>}
      </>}
    </main>
    <nav className="tabbar" aria-label="Main (phone)">
      {TABS.map(({ page: p, label, icon: Icon }) => <button key={p} className={page === p ? 'on' : ''} aria-current={page === p ? 'page' : undefined} onClick={() => go(p)}>
        <Icon size={22} aria-hidden="true"/><span>{label}</span>{p === 'Approvals' && waiting > 0 && <i className="tabbadge">{waiting}</i>}</button>)}
      <button className={SHEET.some(n => n.page === page) || TUCKED.some(n => n.page === page) || sheetOpen ? 'on' : ''} aria-expanded={sheetOpen} onClick={() => setSheetOpen(!sheetOpen)}><Menu size={22} aria-hidden="true"/><span>More</span></button>
    </nav>
    {sheetOpen && <div className="sheetback" onClick={() => setSheetOpen(false)}>
      <div className="moresheet" role="dialog" aria-label="More" onClick={e => e.stopPropagation()}>
        <div className="sheethead"><NeonStar size={26} lit={false}/><b>More</b><button className="iconbtn" aria-label="Close" onClick={() => setSheetOpen(false)}><X size={20}/></button></div>
        <div className="sheetgrid">{SHEET.map(n => <button key={n.page} className={page === n.page ? 'on' : ''} onClick={() => go(n.page)}><b>{n.label}</b><small>{n.hint}</small></button>)}</div>
        <small className="sheetlabel">Quick sign-in</small>
        <div className="sheetgrid">{LOGINS.map(l => <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" title={l.title}>{l.label} <ExternalLink size={14} aria-hidden="true"/></a>)}</div>
        <div className="navtucked sheet">{TUCKED.map(n => <button key={n.page} className={page === n.page ? 'active' : ''} onClick={() => go(n.page)}>{n.label}</button>)}
          {onSignOut && <button onClick={() => { setSheetOpen(false); setPwOpen(true) }}>Set password</button>}</div>
        {onSignOut && <button className="sheetsignout" onClick={onSignOut}><LogOut size={17}/> Sign out</button>}
      </div>
    </div>}
    <UndoToast/>
    {pwOpen && <SetPassword onClose={() => setPwOpen(false)}/>}
  </div></OpenShow.Provider>
}
