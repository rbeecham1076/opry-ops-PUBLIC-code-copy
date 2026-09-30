import type { ReactNode } from 'react'
import type { Event } from './lib/data'
import { ArtistsVenues } from './directory'
import { QuickInfo } from './quickinfo'
import { Churches } from './churches'
import { OpenQuestions } from './questions'
import { MyRole } from './reports'
import { Improvements } from './requests'
import { Ideas, Wednesday, type Data } from './screens'

// Combined pages: fewer menu items, same tools. Each old page is now a tab; its own heading is hidden (.tabbody > .hero).
function Tabbed<T extends string>({ kicker, title, blurb, photo, tabs, tab, setTab, children }: {
  kicker: string; title: string; blurb: string; photo?: [string, string]; tabs: [T, string][]; tab: T; setTab: (t: T) => void; children: ReactNode
}) {
  return <>
    <section className={'hero small' + (photo ? ' withpic' : '')}><div><p>{kicker}</p><h1>{title}</h1><span>{blurb}</span></div>{photo && <img className="heropic" src={photo[0]} alt={photo[1]} loading="lazy"/>}</section>
    <div className="pagetabs" role="tablist">{tabs.map(([k, label]) =>
      <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}</div>
    <div className="tabbody">{children}</div>
  </>
}

export type ContactsTab = 'team' | 'artists' | 'venues' | 'everyone' | 'churches'
export function ContactsPage({ events, q, openShow, tab, setTab }: { events: Event[]; q: string; openShow: (id: string) => void; tab: ContactsTab; setTab: (t: ContactsTab) => void }) {
  return <Tabbed kicker="CONTACTS & INFO" title="Who to call, and need-to-know" blurb="Our team, each venue’s people, the artists and their agents, and our church partners — filed by group. Tap a number to call." photo={['/photos/lobby.jpg', 'The Opry lobby — barnwood walls covered in signed photos']}
    tabs={[['team', 'Our team & the Opry'], ['everyone', 'Everyone, by group'], ['artists', 'Artists & agents'], ['venues', 'Venues'], ['churches', 'Churches']]} tab={tab} setTab={setTab}>
    {tab === 'team' ? <QuickInfo/> : tab === 'churches' ? <Churches events={events} q={q}/> : <ArtistsVenues events={events} q={q} openShow={openShow} only={tab === 'artists' ? 'Artists' : tab === 'venues' ? 'Venues' : 'Contacts'}/>}
  </Tabbed>
}

export type WorkTab = 'improvements' | 'private'
export function MyWorkPage({ tab, setTab }: { tab: WorkTab; setTab: (t: WorkTab) => void }) {
  return <Tabbed kicker="MY WORK" title="What you’ve done — and whether it worked" blurb="Improvements you share with Clay, Barbie and Jamie, and a private log that stays yours. Your hours are here too." photo={['/photos/stained-glass.jpg', 'The stained-glass Kentucky Opry sign']}
    tabs={[['improvements', 'Improvements (shared)'], ['private', 'Private log & hours']]} tab={tab} setTab={setTab}>
    {tab === 'improvements' ? <Improvements/> : <MyRole/>}
  </Tabbed>
}

export type WedTab = 'meeting' | 'questions' | 'ideas'
export function WednesdayIdeasPage({ data, q, tab, setTab }: { data: Data; q: string; tab: WedTab; setTab: (t: WedTab) => void }) {
  const newIdeas = data.ideas.filter(i => i.status === 'NEW').length
  return <Tabbed kicker="WEDNESDAY MEETING & IDEAS" title="Bring it to Wednesday" blurb="The meeting agenda, the questions still waiting on an answer, and the ideas you drop during the week." photo={['/photos/records-table.jpg', 'Lobby table covered in 45 records']}
    tabs={[['meeting', 'Wednesday agenda'], ['questions', 'Open questions'], ['ideas', `Ideas${newIdeas ? ` (${newIdeas} new)` : ''}`]]} tab={tab} setTab={setTab}>
    {tab === 'meeting' ? <Wednesday data={data} q={q}/> : tab === 'questions' ? <OpenQuestions q={q}/> : <Ideas data={data} q={q}/>}
  </Tabbed>
}
